// The committed model outputs. The app reads these; it never re implements the model.
import compareJson from '../../model/out/compare.json';
import modelCardJson from '../../model/out/model_card.json';
import overridesJson from '../../model/out/overrides.json';
import scenarioJson from '../../model/out/scenario.json';
import shipmentsJson from '../../model/out/shipments.json';
import summaryJson from '../../model/out/summary.json';
import whatifsJson from '../../model/out/whatifs.json';
import backlogJson from '../../model/out/backlog.json';
import type { BacklogForecast, ModelCard, Override, Plan, PolicyResult, Scenario, Shipment, SolverStats, WhatIf } from './types';

export const baseScenario = scenarioJson as unknown as Scenario;
export const baseShipments = shipmentsJson as unknown as Shipment[];
export const compare = compareJson as unknown as PolicyResult[];
export const overrides = overridesJson as unknown as Override[];
export const whatifs = whatifsJson as unknown as WhatIf[];
export const modelCard = modelCardJson as unknown as ModelCard;
export const backlog = backlogJson as unknown as BacklogForecast;
export const summary = summaryJson as unknown as Record<string, number> & { solver: SolverStats };

export const basePlan: Plan = { scenario: baseScenario, shipments: baseShipments, solver: summary.solver };

export const hero = (key: string, plan: Plan = basePlan) => plan.shipments.find((s) => s.hero === key);
export const CHERRIES = baseShipments.find((s) => s.hero === 'cherries')!.awb;
export const GARMENTS = baseShipments.find((s) => s.hero === 'garments')!.awb;
export const BATTERIES = baseShipments.find((s) => s.hero === 'dg')!.awb;
/** Delay applied in every plan unless changed: the trigger of the scenario, read from the model output. */
export const DEFAULT_DELAYS: Record<string, number> = Object.fromEntries(
  baseScenario.flights.filter((f) => f.dep > f.schedDep).map((f) => [f.id, Math.round((f.dep - f.schedDep) * 100) / 100]),
);
export const TRIGGER = baseScenario.ripple.trigger.flight;
