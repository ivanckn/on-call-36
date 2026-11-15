// Shapes of the committed model outputs in model/out/ and of the live service responses. All data is simulated.

export type Tier = 'PRS' | 'PR1' | 'PR2' | 'PR3' | 'GEN';
export const TIER_ORDER: Tier[] = ['PRS', 'PR1', 'PR2', 'PR3', 'GEN'];
export type Status = 'Placed automatically' | 'Placed, promise missed' | 'No action needed' | 'Needs a person';
export const STATUSES: Status[] = ['Placed automatically', 'Placed, promise missed', 'No action needed', 'Needs a person'];
export type Kind = 'RECOVERY' | 'BAU';

export interface Driver { feature: string; label: string; value: number; effect: number; effectKg: number }

export type RegStatus = 'ELIGIBLE_FOR_PLANNING' | 'NEEDS_DG_REVIEW' | 'BLOCKED';
export interface Finding { status: RegStatus; code: string; message: string; source: string }
export interface Regulatory { status: RegStatus; policyVersion: string; findings: Finding[]; declaredUNs: string[] }

export interface RiskOption {
  flight: string;
  arrival: number;
  risk: Record<string, number>;
  increaseVsEarliestPercentagePoints: Record<string, number>;
  learnedRiskCostIndex: number;
  riskChargeInObjective: number;
  learnedCostIncreaseVsEarliest: number;
  totalAssignmentCostIndex: number;
}
export interface TimeSensitivity {
  awb: string;
  deliveryPromise: number;
  downstreamDeadline: number | null;
  earliestArrivalFlight: string | null;
  excludedFlights: { flight: string; reason: string }[];
  flightOptions: RiskOption[];
}

export interface Flight {
  id: string;
  origin: string;
  dest: string;
  schedDep: number;
  dep: number;
  arr: number;
  kind: 'PAX' | 'FRT';
  role?: string;
  aircraftType?: string;
  oagCargoTonnes?: number;
  localDep?: string;
  source?: string;
  operator?: string;
  dryIceCapacityKg?: number;
  plannedDryIceKg?: number;
  nominalKg: number;
  coolPositions: number;
  status: string;
  cause: string;
  features: Record<string, number>;
  forecast: { p10: number; p50: number; p90: number; drivers: Driver[]; shapBaseKg: number };
  capacityScale: number;
  forecastKg: { p10: number; p50: number; p90: number };
  plannedKg: number;
  plannedVsMedian: number;
  bumpOrder: string[];
  mixKgByTier: Record<Tier, number>;
  reason: string;
}

export interface ReturnFlight { id: string; origin: string; dest: string; schedDep: number; dep: number; arr: number; schedArr: number; status: string; cause: string }

export interface RippleLink { label: string; flight: string; shipments: number; needReplan: number; status?: string; cause?: string }

export interface Scenario {
  now: number;
  closure: [number, number];
  minTransferHours: number;
  flights: Flight[];
  returnFlight: ReturnFlight;
  ripple: { trigger: { flight: string; status: string; cause: string }; delayedFlights: string[]; chain: RippleLink[] };
  simulated: boolean;
}

export interface Alternative {
  flight: string; eligible: boolean; reason: string; costIndex: number | null; arr: number; chosen: boolean;
  regulatory?: Regulatory; learnedRiskCost?: number; risk?: Record<string, number>;
}

export interface Shipment {
  awb: string;
  commodity: string;
  kg: number;
  tier: Tier;
  shc: string[];
  dest: string;
  promise: number;
  kind: Kind;
  booked: string | null;
  ready: number;
  cool: boolean;
  dg: boolean;
  mainDeck: boolean;
  shelf: number | null;
  latestDep: number | null;
  forwarder: string;
  origin: string;
  note: string;
  hero: string;
  assigned: string | null;
  fitProbability: number;
  status: Status;
  reason: string;
  underbookingCost?: number;
  overbookingCost?: number;
  criticalRatio?: number;
  alternatives: Alternative[];
  uplift?: number;
  downstreamDeadline?: number | null;
  handlingAgeHours?: number;
  temperatureExcursionHours?: number;
  regulatedItems?: { entryId: string; un: string; netPerPackage: number; unit: string; packageCount: number }[];
  timeSensitivity?: TimeSensitivity;
}

export interface Change { awb: string; commodity: string; tier: Tier; was: string | null; now: string | null; statusNow: Status; reason: string }

export interface Diff { changed: Change[]; costIndexChange: number; promisesKeptChange: number; perishableChange: number; downstreamMissesChange?: number }

export interface SolverStats { method: string; lanes?: number; scenarios: number; binaryVariables: number; continuousVariables: number; constraints: number; solveSeconds: number; optimalityGap: number }

export interface PolicyResult {
  policy: string;
  note: string;
  expectedCostIndex: number;
  promisesKept: number;
  shipments: number;
  perishableInShelfLife: number;
  perishableTotal: number;
  bumpedAtAircraft: number;
  emptyKgOnFirstFlightsOut: number;
  avgHoursLatePRSandPR1: number;
  unplaced: number;
  p95CostIndex?: number;
  unflownByHorizon?: number;
  recoveryShipmentsFlown?: number;
  originalBAUBookingsFlown?: number;
  expectedLearnedCostIndex?: number;
  downstreamDeadlineMisses?: number;
}

export interface Override {
  label: string;
  awb: string;
  flight: string;
  feasible: boolean;
  reason?: string;
  regulatory?: Regulatory | null;
  changed?: Change[];
  costIndexChange?: number;
  promisesKeptChange?: number;
  perishableChange?: number;
}

export interface WhatIf extends Diff {
  label: string;
  inputs: { cap_scale?: Record<string, number>; delays?: Record<string, number> };
  solver: SolverStats;
}

export interface ModelCard {
  name: string;
  dataSource: string;
  trainingRows: number;
  heldOutRows: number;
  features: string[];
  method: string;
  metrics: Record<string, number>;
  limits: string;
  explanation?: { forecast: string; decisions: string };
  timeSensitivity?: {
    name: string; dataSource: string; architecture: string; trainingHistoriesPerOutcome: number; heldOutHistoriesPerOutcome: number;
    intervalHours: number; horizonHours: number; features: string[]; outcomes: Record<string, Record<string, number>>;
    impactPoints: Record<string, number>; limits: string;
  };
  regulatoryEligibility?: { policyVersion: string; approvalScope: string; inputs: string };
}

/** One plan as the app shows it: the base plan, a live re solve, or a played back pre computed case. */
export interface Plan {
  scenario: Scenario;
  shipments: Shipment[];
  solver: SolverStats;
}

export interface SolveRequest {
  forced: Record<string, string>;
  capScale: Record<string, number>;
  delays: Record<string, number>;
}

export interface SolveResult {
  feasible: boolean;
  reason?: string;
  regulatory?: Regulatory | null;
  plan?: Plan;
  diff?: Diff;
  seconds?: number;
  source: 'live' | 'snapshot';
  label?: string;
}

export interface ClearSummary {
  p10: number | null; p50: number | null; p90: number | null; mean: number | null;
  clearedWithinSchedule: number;
  byMidnight: { t: number; probability: number }[];
}
export interface BacklogLane {
  lane: string; cancelledFlights: number; cancelledTonnage: number; flightsAfterReopening: number;
  initialBacklogTonnes: { p10: number; p50: number; p90: number };
  clearHours: ClearSummary;
}
export interface Fan { t: number[]; p10: number[]; p50: number[]; p90: number[] }
export interface BacklogForecast {
  method: string;
  source: string;
  assumptions: Record<string, unknown> & { trials: number; seed: number; normalWhenBacklogBelowShare: number };
  scheduleEnd: number;
  cancelled: { flight: string; dest: string; dep: number; kind: string; tonnes: number }[];
  lanes: BacklogLane[];
  overall: ClearSummary;
  fan: Fan;
}
