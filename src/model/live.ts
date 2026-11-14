// The local re optimisation service, with a required fallback to the committed snapshot.
import { DEFAULT_DELAYS, basePlan } from './data';
import { applyChanges, requestKey, snapshots } from './plan';
import type { Diff, Plan, SolveRequest, SolveResult, SolverStats } from './types';

export const SERVICE = 'http://localhost:8036';

export async function checkHealth(timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${SERVICE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

interface LiveResponse {
  feasible: boolean;
  reason?: string;
  regulatory?: SolveResult['regulatory'];
  scenario?: Plan['scenario'];
  shipments?: Plan['shipments'];
  solver?: SolverStats;
  diff?: Diff;
  totalSeconds?: number;
}

export async function solveLive(req: SolveRequest): Promise<SolveResult> {
  const res = await fetch(`${SERVICE}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forced: req.forced, capScale: req.capScale, delays: { ...DEFAULT_DELAYS, ...req.delays } }),
  });
  const body = (await res.json()) as LiveResponse;
  if (!body.feasible || !body.scenario || !body.shipments || !body.solver) {
    return { feasible: false, reason: body.reason ?? 'No plan satisfies every rule with this change.', regulatory: body.regulatory ?? null, source: 'live' };
  }
  return { feasible: true, plan: { scenario: body.scenario, shipments: body.shipments, solver: body.solver }, diff: body.diff, seconds: body.totalSeconds, source: 'live' };
}

const SNAPSHOTS = snapshots();

/** Is there a pre computed answer for this request? */
export function hasSnapshot(req: SolveRequest): boolean {
  return SNAPSHOTS.has(requestKey(req));
}

export function solveSnapshot(req: SolveRequest): SolveResult | null {
  const snap = SNAPSHOTS.get(requestKey(req));
  if (!snap) return null;
  if (!snap.feasible) return { feasible: false, reason: snap.reason, regulatory: snap.regulatory ?? null, source: 'snapshot', label: snap.label };
  return {
    feasible: true,
    plan: { ...applyChanges(basePlan, snap.changed, req), solver: snap.solver ?? basePlan.solver },
    diff: snap.diff,
    source: 'snapshot',
    label: snap.label,
  };
}

export function allSnapshots() {
  return [...SNAPSHOTS.values()];
}
