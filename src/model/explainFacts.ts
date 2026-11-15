// The explainable layer's input: the numbers the model already computed, in plain fields for the language model.
// The language model only rewrites these facts in plain words. It never decides anything, and checkNumbers()
// flags any number in its answer that does not come from these facts.
import { backlog } from './data';
import { counts, displacedFrom, flightMap, isAffected, isNotified } from './plan';
import type { Diff, Plan, Shipment } from './types';
import { toDate } from '../lib/time';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
/** "Tue 17 Nov 22:34" */
export function when(h: number | null | undefined): string | null {
  if (h === null || h === undefined || !Number.isFinite(h)) return null;
  const d = toDate(h);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const day = (h: number | null) => (h === null ? null : (when(h) ?? '').slice(0, -6));
const r1 = (v: number) => Math.round(v * 10) / 10;
const flightName = (id: string | null | undefined) => (id ? id.replace(/^CX(\d)/, 'CX $1') : null);

function scenarioFacts(plan: Plan) {
  const sc = plan.scenario;
  const fl = flightMap(plan);
  const trig = fl[sc.ripple.trigger.flight];
  return {
    simulated: 'The disruption, the shipments and the costs are simulated. Flight times are the real CX schedule from OAG.',
    now: when(sc.now),
    background: `Hong Kong airport was closed by a simulated Typhoon Signal No. 8 from ${when(sc.closure[0])} and reopened ${when(sc.closure[1])}.`,
    trigger: { flight: flightName(trig?.id), route: `${trig?.origin} to ${trig?.dest}`, status: trig?.status, cause: trig?.cause },
  };
}

export function shipmentFacts(plan: Plan, s: Shipment, holds: string[]) {
  const fl = flightMap(plan);
  const booked = s.booked ? fl[s.booked] : undefined;
  const assigned = s.assigned ? fl[s.assigned] : undefined;
  const margin = assigned ? r1(s.promise - assigned.arr) : null;
  const chosenAlt = s.alternatives.find((a) => a.chosen);
  const madeRoom = s.assigned && s.kind === 'RECOVERY' ? displacedFrom(plan, s.assigned) : [];
  const risk = s.timeSensitivity?.flightOptions.slice(0, 3).map((o) => ({
    flight: flightName(o.flight), arrives: when(o.arrival),
    riskPercent: Object.fromEntries(Object.entries(o.risk).map(([k, v]) => [k, Math.round(v * 100)])),
  }));
  return {
    ...scenarioFacts(plan),
    shipment: {
      awb: s.awb, commodity: s.commodity, weightKg: s.kg, serviceTier: s.tier, tierMeaning: 'PRS is the most urgent tier, then PR1, PR2, PR3, and GEN is general cargo.',
      handlingCodes: s.shc, from: s.origin, to: s.dest, forwarder: s.forwarder,
      group: s.kind === 'RECOVERY' ? 'Disrupted cargo that needs a new plan' : 'An existing booking on a flight that is operating',
      readyInHongKong: when(s.ready), promisedDelivery: when(s.promise), shelfLifeEnds: when(s.shelf), mustDepartBy: when(s.latestDep), note: s.note || null,
    },
    originalFlight: booked ? { flight: flightName(booked.id), status: booked.status, cause: booked.cause || null, departs: when(booked.dep), arrives: when(booked.arr) } : null,
    decision: {
      outcome: s.status,
      newFlight: assigned ? { flight: flightName(assigned.id), aircraft: assigned.kind === 'FRT' ? 'freighter' : 'passenger aircraft', departs: when(assigned.dep), arrives: when(assigned.arr) } : null,
      hoursBeforePromise: margin !== null && margin >= 0 ? margin : null,
      hoursAfterPromise: margin !== null && margin < 0 ? -margin : null,
      shelfLifeHoursLeftOnArrival: assigned && s.shelf ? r1(s.shelf - assigned.arr) : null,
      engineReason: s.reason,
      chanceItFitsPercent: Math.round(s.fitProbability * 100),
      costOfLeavingBehindIndex: s.underbookingCost ?? null,
      costOfBeingOffloadedIndex: s.overbookingCost ?? null,
      criticalRatio: s.criticalRatio ?? null,
      costUnits: 'Unitless cost index, not money.',
      forwarderNotified: isNotified(s, holds),
      batchHeldByOperations: !!s.assigned && holds.includes(s.assigned),
    },
    madeRoomBy: madeRoom.map((x) => ({ commodity: x.commodity, tier: x.tier, movedFrom: flightName(x.booked), movedTo: flightName(x.assigned) })),
    dangerousGoodsScreen: chosenAlt?.regulatory
      ? { status: chosenAlt.regulatory.status, findings: chosenAlt.regulatory.findings.slice(0, 4).map((f) => f.message) }
      : (s.alternatives.find((a) => a.regulatory && a.regulatory.status !== 'ELIGIBLE_FOR_PLANNING')?.regulatory
        ? { status: 'See each flight below', findings: [] } : null),
    timeRisk: risk && risk.length ? risk : null,
    otherFlightsOnThisRoute: s.alternatives.slice(0, 8).map((a) => ({
      flight: flightName(a.flight), allowed: a.eligible, blockedBecause: a.reason || null, arrives: when(a.arr), costIndex: a.costIndex, chosen: a.chosen,
      dangerousGoodsStatus: a.regulatory?.status ?? null,
    })),
  };
}

export function incidentFacts(plan: Plan) {
  const c = counts(plan);
  const affected = plan.shipments.filter(isAffected);
  const slow = [...backlog.lanes].sort((a, b) => (b.clearHours.p50 ?? 1e9) - (a.clearHours.p50 ?? 1e9))[0];
  return {
    ...scenarioFacts(plan),
    shipmentsAffected: affected.length,
    placedAutomatically: c['Placed automatically'],
    placedButLate: c['Placed, promise missed'],
    needAPerson: c['Needs a person'],
    temperatureOrTimeSensitive: affected.filter((s) => s.shc.some((x) => ['PER', 'COL', 'AVI', 'PIL'].includes(x))).length,
    ripple: plan.scenario.ripple.chain.map((l) => ({ group: l.label, flight: flightName(l.flight), shipments: l.shipments, needNewPlan: l.needReplan })),
    exceptions: plan.shipments.filter((s) => s.status === 'Needs a person' || s.status === 'Placed, promise missed')
      .map((s) => ({ commodity: s.commodity, outcome: s.status, engineReason: s.reason })),
    backToNormal: {
      method: 'Monte Carlo simulation over the real CX schedule',
      cancelledDepartures: backlog.cancelled.length,
      backlogTonnes: Math.round(backlog.cancelled.reduce((a, x) => a + x.tonnes, 0)),
      medianDate: day(backlog.overall.p50),
      range: `10% chance of being back to normal by ${day(backlog.overall.p10)}, 50% by ${day(backlog.overall.p50)}, 90% by ${day(backlog.overall.p90)}`,
      slowestLane: slow?.lane ?? null,
    },
    humansDo: 'Review batches, hold a batch if needed, handle the exceptions. Nobody approves shipments one by one.',
  };
}

export function changeFacts(plan: Plan, diff: Diff, label: string | null, request: string | null) {
  return {
    ...scenarioFacts(plan),
    whatWasChanged: label ?? request,
    shipmentsMoved: diff.changed.length,
    moves: diff.changed.slice(0, 12).map((c) => ({ commodity: c.commodity, tier: c.tier, from: flightName(c.was), to: flightName(c.now), outcomeNow: c.statusNow, engineReason: c.reason })),
    expectedCostIndexChange: Math.round(diff.costIndexChange),
    promisesKeptChange: diff.promisesKeptChange,
    perishablesInShelfLifeChange: diff.perishableChange,
    costUnits: 'Unitless cost index, not money. A negative cost change is better.',
  };
}

/** Every number written in a piece of text: 2.2, 87, 1,250, 27 (from 27 Nov), 22:34 counts as 22 and 34. */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, ''))).filter(Number.isFinite);
}

/** The set of numbers the facts justify, including simple rounding of each. */
function allowed(facts: unknown): Set<number> {
  const out = new Set<number>();
  const add = (v: number) => {
    for (const x of [v, Math.abs(v), Math.round(v), Math.round(Math.abs(v)), r1(v), r1(Math.abs(v)), Math.floor(Math.abs(v)), Math.ceil(Math.abs(v))]) out.add(x);
    if (Math.abs(v) <= 1) { out.add(Math.round(Math.abs(v) * 100)); out.add(r1(Math.abs(v) * 100)); }
  };
  const walk = (v: unknown) => {
    if (typeof v === 'number') add(v);
    else if (typeof v === 'string') { numbersIn(v).forEach(add); MONTHS.forEach((m, i) => { if (v.includes(` ${m}`)) out.add(i + 1); }); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}

/** Numbers in the answer that cannot be traced to the facts. The years 2025 to 2027 are ignored. */
export function checkNumbers(text: string, facts: unknown): { total: number; unverified: number[] } {
  const ok = allowed(facts);
  const found = numbersIn(text).filter((n) => !(n >= 2025 && n <= 2027));
  return { total: found.length, unverified: [...new Set(found.filter((n) => !ok.has(n)))] };
}
