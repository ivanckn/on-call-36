// Pure helpers over a plan: lookups, counts, and offline playback of a pre computed change list.
import { DEFAULT_DELAYS, overrides, whatifs } from './data';
import type { Change, Diff, Flight, Override, Plan, Shipment, SolveRequest, Status, Tier, WhatIf } from './types';
import { TIER_ORDER } from './types';

export const flightMap = (plan: Plan) => Object.fromEntries(plan.scenario.flights.map((f) => [f.id, f]));
export const shipmentMap = (plan: Plan) => Object.fromEntries(plan.shipments.map((s) => [s.awb, s]));
export const flightsInOrder = (plan: Plan) => [...plan.scenario.flights].sort((a, b) => a.dep - b.dep || a.id.localeCompare(b.id));

export function counts(plan: Plan): Record<Status, number> {
  const out = { 'Placed automatically': 0, 'Placed, promise missed': 0, 'No action needed': 0, 'Needs a person': 0 } as Record<Status, number>;
  for (const s of plan.shipments) out[s.status] += 1;
  return out;
}

export const isAffected = (s: Shipment) => s.status !== 'No action needed';
export const isMoved = (s: Shipment) => s.assigned !== null && s.assigned !== s.booked;

/** The forwarder is told automatically when the plan changes, the promise is missed, or a person takes over; never while the batch is held. No reply is needed. */
export const isNotified = (s: Shipment, holds: string[] = []) =>
  s.status !== 'No action needed' && !(s.assigned && holds.includes(s.assigned));

/** Shipments on a flight, in bump order: first to come off first. */
export function onFlight(plan: Plan, f: Flight): Shipment[] {
  const by = shipmentMap(plan);
  return f.bumpOrder.map((a) => by[a]).filter(Boolean);
}

/** Booked general cargo moved off this flight to make room. */
export function displacedFrom(plan: Plan, flightId: string): Shipment[] {
  return plan.shipments.filter((s) => s.booked === flightId && s.assigned !== flightId && s.kind === 'BAU');
}

/** Recovery shipments that left this flight, so their space was freed. */
export function freedFrom(plan: Plan, flightId: string): Shipment[] {
  return plan.shipments.filter((s) => s.booked === flightId && s.assigned !== flightId && s.kind === 'RECOVERY');
}

export function tierCounts(list: Shipment[]): Record<Tier, number> {
  const out = Object.fromEntries(TIER_ORDER.map((t) => [t, 0])) as Record<Tier, number>;
  for (const s of list) out[s.tier] += 1;
  return out;
}

export const delayOf = (f: Flight) => Math.max(0, f.dep - f.schedDep);

export function emptyRequest(): SolveRequest {
  return { forced: {}, capScale: {}, delays: {} };
}

/** Normalised key for matching a request against pre computed cases. */
export function requestKey(r: SolveRequest): string {
  const delays = { ...DEFAULT_DELAYS, ...r.delays };
  const cap = Object.fromEntries(Object.entries(r.capScale).filter(([, v]) => Math.abs(v - 1) > 1e-9));
  const sort = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ forced: sort(r.forced), cap: sort(cap), delays: sort(delays) });
}

export function whatIfRequest(w: WhatIf): SolveRequest {
  return { forced: {}, capScale: w.inputs.cap_scale ?? {}, delays: w.inputs.delays ?? {} };
}
export function overrideRequest(o: Override): SolveRequest {
  return { forced: { [o.awb]: o.flight }, capScale: {}, delays: {} };
}

export type Snapshot = { label: string; feasible: boolean; reason?: string; regulatory?: Override['regulatory']; changed: Change[]; diff?: Diff; request: SolveRequest; solver?: WhatIf['solver'] };

/** Every pre computed case, keyed by its normalised request. */
export function snapshots(): Map<string, Snapshot> {
  const map = new Map<string, Snapshot>();
  for (const w of whatifs) {
    const request = whatIfRequest(w);
    map.set(requestKey(request), { label: w.label, feasible: true, changed: w.changed, request, solver: w.solver,
      diff: { changed: w.changed, costIndexChange: w.costIndexChange, promisesKeptChange: w.promisesKeptChange, perishableChange: w.perishableChange } });
  }
  for (const o of overrides) {
    const request = overrideRequest(o);
    map.set(requestKey(request), o.feasible
      ? { label: o.label, feasible: true, changed: o.changed ?? [], request,
          diff: { changed: o.changed ?? [], costIndexChange: o.costIndexChange ?? 0, promisesKeptChange: o.promisesKeptChange ?? 0, perishableChange: o.perishableChange ?? 0 } }
      : { label: o.label, feasible: false, reason: o.reason, regulatory: o.regulatory, changed: [], request });
  }
  return map;
}

/**
 * Apply a pre computed change list to the base plan, for the offline snapshot. Moves shipments,
 * rebuilds planned loads and bump order, applies capacity scales and delays to the flight times.
 * Forecasts are not re run offline; delayed flights keep the base forecast.
 */
export function applyChanges(base: Plan, changed: Change[], request: SolveRequest): Plan {
  const moved = new Map(changed.map((c) => [c.awb, c]));
  const shipments = base.shipments.map((s) => {
    const c = moved.get(s.awb);
    if (!c) return s;
    return { ...s, assigned: c.now, status: c.statusNow, reason: c.reason, alternatives: s.alternatives.map((a) => ({ ...a, chosen: a.flight === c.now })) };
  });
  const delays = { ...DEFAULT_DELAYS, ...request.delays };
  const flights = base.scenario.flights.map((f) => {
    const scale = request.capScale[f.id] ?? 1;
    const delay = delays[f.id] ?? 0;
    const on = shipments.filter((s) => s.assigned === f.id);
    const oldOrder = new Map(f.bumpOrder.map((a, i) => [a, i]));
    // Keep the base bump order for shipments that stayed; newcomers go by tier, least urgent first.
    const order = [...on].sort((a, b) => (oldOrder.get(a.awb) ?? 100 + (4 - TIER_ORDER.indexOf(a.tier))) - (oldOrder.get(b.awb) ?? 100 + (4 - TIER_ORDER.indexOf(b.tier))));
    const forecastKg = { p10: Math.round((f.forecastKg.p10 / f.capacityScale) * scale), p50: Math.round((f.forecastKg.p50 / f.capacityScale) * scale), p90: Math.round((f.forecastKg.p90 / f.capacityScale) * scale) };
    const plannedKg = on.reduce((sum, s) => sum + s.kg, 0);
    const dep = delay > 0 ? f.schedDep + delay : f.dep;
    const mix = Object.fromEntries(TIER_ORDER.map((t) => [t, on.filter((s) => s.tier === t).reduce((sum, s) => sum + s.kg, 0)])) as Record<Tier, number>;
    return {
      ...f, capacityScale: scale, forecastKg, plannedKg, plannedVsMedian: plannedKg / Math.max(1, forecastKg.p50), bumpOrder: order.map((s) => s.awb), mixKgByTier: mix,
      dep, arr: f.arr + (dep - f.dep), status: dep > f.schedDep ? `Delayed ${Math.round(dep - f.schedDep)}h` : f.status,
    };
  });
  return { ...base, shipments, scenario: { ...base.scenario, flights } };
}
