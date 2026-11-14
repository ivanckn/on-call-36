// Demo state. Persisted: language, held batches, operations log, and the current what if request.
// In memory: the plan on screen, the service mode and the last change list.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { basePlan } from '../model/data';
import { checkHealth, hasSnapshot, solveLive, solveSnapshot } from '../model/live';
import { emptyRequest, requestKey } from '../model/plan';
import type { Locale } from '../model/text';
import type { Diff, Plan, Regulatory, SolveRequest } from '../model/types';

export type Mode = 'checking' | 'live' | 'offline';

export interface LogEntry { at: string; text: string }

interface Persisted {
  locale: Locale;
  /** When the disruption alert was acknowledged (ISO time), or null while it still needs attention. */
  alertAck: string | null;
  holds: string[];
  log: LogEntry[];
  request: SolveRequest;
}

export type ToastTone = 'alert' | 'caution' | 'ok';
export interface Toast { id: number; tone: ToastTone; key: string; params: Record<string, string | number>; awb?: string }

export interface DemoState extends Persisted {
  mode: Mode;
  toasts: Toast[];
  plan: Plan;
  solving: boolean;
  diff: Diff | null;
  lastLabel: string | null;
  blocked: string | null;
  blockedRule: Regulatory | null;
  seconds: number | null;
  source: 'base' | 'live' | 'snapshot';
  movedAwbs: string[];
}

const KEY = 'oncall36:v3';
const persistedDefaults: Persisted = { locale: 'en', alertAck: null, holds: [], log: [], request: emptyRequest() };

function initial(): DemoState {
  let p = persistedDefaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const { locale, alertAck, holds, log, request } = { ...persistedDefaults, ...(JSON.parse(raw) as Partial<Persisted>) }; p = { locale, alertAck, holds, log, request }; }
  } catch { /* storage unavailable */ }
  return { ...p, mode: 'checking', toasts: [], plan: basePlan, solving: false, diff: null, lastLabel: null, blocked: null, blockedRule: null, seconds: null, source: 'base', movedAwbs: [] };
}

type Action =
  | { type: 'setLocale'; locale: Locale }
  | { type: 'mode'; mode: Mode }
  | { type: 'solving'; request: SolveRequest; text: string }
  | { type: 'solved'; plan: Plan; diff: Diff | null; source: 'live' | 'snapshot'; label: string | null; seconds: number | null; request: SolveRequest }
  | { type: 'blocked'; reason: string; label: string | null; rule?: Regulatory | null }
  | { type: 'resetPlan' }
  | { type: 'ack' }
  | { type: 'dismissToast'; id: number }
  | { type: 'toast'; tone: ToastTone; key: string; params: Toast['params'] }
  | { type: 'hold'; flight: string }
  | { type: 'release'; flight: string }
  | { type: 'reset' };

const entry = (text: string): LogEntry => ({ at: new Date().toISOString(), text });

let toastSeq = 0;
const toast = (tone: ToastTone, key: string, params: Toast['params'], awb?: string): Toast => ({ id: ++toastSeq, tone, key, params, awb });

/** Shipments that became an exception or late in the new plan: each one is a toast. */
function newExceptionToasts(before: Plan, after: Plan): Toast[] {
  const was = new Map(before.shipments.map((x) => [x.awb, x.status]));
  const out: Toast[] = [];
  for (const sh of after.shipments) {
    const prev = was.get(sh.awb);
    if (sh.status === prev) continue;
    if (sh.status === 'Needs a person') out.push(toast('alert', 'toast.needsPerson', { name: sh.commodity, awb: sh.awb }, sh.awb));
    else if (sh.status === 'Placed, promise missed') out.push(toast('caution', 'toast.late', { name: sh.commodity, flight: sh.assigned ?? '' }, sh.awb));
  }
  return out;
}

function reducer(s: DemoState, a: Action): DemoState {
  switch (a.type) {
    case 'setLocale': return { ...s, locale: a.locale };
    case 'mode': return { ...s, mode: a.mode };
    case 'solving': return { ...s, solving: true, blocked: null, log: [...s.log, entry(a.text)] };
    case 'solved': {
      const toasts = [...s.toasts, ...newExceptionToasts(s.plan, a.plan)];
      if (toasts.length === s.toasts.length && a.diff) toasts.push(toast('ok', 'toast.replanned', { n: a.diff.changed.length }));
      return { ...s, solving: false, plan: a.plan, diff: a.diff, source: a.source, lastLabel: a.label, seconds: a.seconds, request: a.request, blocked: null,
        movedAwbs: a.diff?.changed.map((c) => c.awb) ?? [], toasts: toasts.slice(-4) };
    }
    case 'blocked': return { ...s, solving: false, blocked: a.reason, blockedRule: a.rule ?? null, lastLabel: a.label, log: [...s.log, entry(`Blocked: ${a.reason}`)],
      toasts: [...s.toasts, toast('alert', 'toast.blocked', { reason: a.reason })].slice(-4) };
    case 'ack': return { ...s, alertAck: new Date().toISOString(), log: [...s.log, entry('Disruption alert acknowledged by the recovery desk.')] };
    case 'toast': return { ...s, toasts: [...s.toasts, toast(a.tone, a.key, a.params)].slice(-4) };
    case 'dismissToast': return { ...s, toasts: s.toasts.filter((x) => x.id !== a.id) };
    case 'resetPlan': return { ...s, plan: basePlan, diff: null, source: 'base', lastLabel: null, seconds: null, blocked: null, request: emptyRequest(), movedAwbs: [], log: [...s.log, entry('Back to the base plan.')] };
    case 'hold': return s.holds.includes(a.flight) ? s : { ...s, holds: [...s.holds, a.flight], log: [...s.log, entry(`Batch ${a.flight} held. Nothing sent to the cargo management system for it.`)],
      toasts: [...s.toasts, toast('caution', 'toast.held', { flight: a.flight })].slice(-4) };
    case 'release': return { ...s, holds: s.holds.filter((f) => f !== a.flight), log: [...s.log, entry(`Batch ${a.flight} released.`)] };
    case 'reset': return { ...initial(), ...persistedDefaults, locale: s.locale, mode: s.mode, toasts: [] };
    default: return s;
  }
}

interface Demo {
  state: DemoState;
  dispatch: (a: Action) => void;
  /** Merge a change into the current request and re solve, live or from the snapshot. */
  run: (change: Partial<SolveRequest>, describe: string) => Promise<void>;
  /** Run an exact request, for example a pre computed case. */
  runExact: (req: SolveRequest, describe: string) => Promise<void>;
  canRun: (change: Partial<SolveRequest>) => boolean;
  merge: (change: Partial<SolveRequest>) => SolveRequest;
}

const Ctx = createContext<Demo | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    const { locale, alertAck, holds, log, request } = state;
    try { localStorage.setItem(KEY, JSON.stringify({ locale, alertAck, holds, log, request })); } catch { /* ignore */ }
  }, [state]);

  const merge = useCallback((change: Partial<SolveRequest>): SolveRequest => {
    const r = ref.current.request;
    return { forced: { ...r.forced, ...change.forced }, capScale: { ...r.capScale, ...change.capScale }, delays: { ...r.delays, ...change.delays } };
  }, []);

  const runExact = useCallback(async (req: SolveRequest, describe: string) => {
    dispatch({ type: 'solving', request: req, text: describe });
    const live = ref.current.mode === 'live';
    try {
      const res = live ? await solveLive(req) : solveSnapshot(req);
      if (!res) { dispatch({ type: 'blocked', reason: 'No pre computed answer for this change. Start the live service to try it.', label: null }); return; }
      if (!res.feasible || !res.plan) { dispatch({ type: 'blocked', reason: res.reason ?? 'Not allowed.', label: res.label ?? null, rule: res.regulatory ?? null }); return; }
      dispatch({ type: 'solved', plan: res.plan, diff: res.diff ?? null, source: res.source, label: res.label ?? null, seconds: res.seconds ?? null, request: req });
    } catch {
      // The service went away mid demo: fall back to the snapshot.
      dispatch({ type: 'mode', mode: 'offline' });
      const snap = solveSnapshot(req);
      if (snap?.feasible && snap.plan) dispatch({ type: 'solved', plan: snap.plan, diff: snap.diff ?? null, source: 'snapshot', label: snap.label ?? null, seconds: null, request: req });
      else dispatch({ type: 'blocked', reason: snap?.reason ?? 'The live service stopped. Showing the offline snapshot.', label: snap?.label ?? null });
    }
  }, []);

  const run = useCallback((change: Partial<SolveRequest>, describe: string) => runExact(merge(change), describe), [merge, runExact]);
  const canRun = useCallback((change: Partial<SolveRequest>) => ref.current.mode === 'live' || hasSnapshot(merge(change)), [merge]);

  // On load: check the service; restore the last request if there was one.
  useEffect(() => {
    let alive = true;
    checkHealth().then((ok) => {
      if (!alive) return;
      dispatch({ type: 'mode', mode: ok ? 'live' : 'offline' });
      const r = ref.current.request;
      if (requestKey(r) !== requestKey(emptyRequest())) {
        ref.current = { ...ref.current, mode: ok ? 'live' : 'offline' };
        void runExact(r, 'Restored the last what if after reload.');
      }
    });
    return () => { alive = false; };
  }, [runExact]);

  const value = useMemo(() => ({ state, dispatch, run, runExact, canRun, merge }), [state, run, runExact, canRun, merge]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo(): Demo {
  const v = useContext(Ctx);
  if (!v) throw new Error('DemoProvider missing');
  return v;
}
