import { describe, expect, it } from 'vitest';
import { backlog, basePlan, baseScenario, baseShipments, compare, hero, overrides, whatifs } from './data';
import { applyChanges, counts, flightMap, overrideRequest, requestKey, whatIfRequest } from './plan';
import { solveSnapshot } from './live';
import { fmtFlight, modelText, ruleText, untranslated } from './text';
import { waterfallSteps } from '../components/Waterfall';

const F = flightMap(basePlan);
/** Real flight id for a scenario role, as the model maps it. */
const role = (r: string) => baseScenario.flights.find((f) => f.role === r)!.id;
const R1 = role('CX9101'), R2 = role('CX9102'), R4 = role('CX9104'), C1 = role('CX9301');

describe('committed model outputs (brief section 0)', () => {
  it('has 60 shipments and the status counts the model reports', () => {
    expect(baseShipments).toHaveLength(60);
    const c = counts(basePlan);
    expect(c['Placed automatically'] + c['Placed, promise missed'] + c['No action needed'] + c['Needs a person']).toBe(60);
  });

  it('only ever assigns a leg that the regulatory screen marks eligible for planning', () => {
    for (const s of baseShipments) {
      for (const a of s.alternatives) {
        expect(a.regulatory).toBeDefined();
        if (a.chosen) expect(a.regulatory!.status).toBe('ELIGIBLE_FOR_PLANNING');
        if (a.regulatory!.status !== 'ELIGIBLE_FOR_PLANNING') expect(a.eligible).toBe(false);
      }
    }
  });

  it('screens the dangerous goods cases as the regulatory module intends', () => {
    const dg = hero('dg')!;
    expect(dg.alternatives.find((a) => a.flight === R2)!.regulatory!.status).toBe('BLOCKED');
    expect(dg.alternatives.find((a) => a.flight === R4)!.regulatory!.status).toBe('ELIGIBLE_FOR_PLANNING');
    expect(hero('metal')!.status).toBe('Needs a person');
    expect(hero('paint_review')!.status).toBe('Needs a person');
    expect(hero('paint_review')!.alternatives.some((a) => a.regulatory!.status === 'NEEDS_DG_REVIEW')).toBe(true);
    expect(hero('water')!.status).toBe('No action needed');
  });

  it('keeps dry ice on every flight within its budget', () => {
    for (const f of baseScenario.flights) expect(f.plannedDryIceKg ?? 0).toBeLessThanOrEqual(f.dryIceCapacityKg ?? 0);
  });

  it('carries a neural time sensitivity curve that never decreases with a later arrival', () => {
    let covered = 0;
    for (const s of baseShipments) {
      const opts = s.timeSensitivity?.flightOptions ?? [];
      for (let i = 1; i < opts.length; i++) {
        for (const [k, p] of Object.entries(opts[i - 1].risk)) expect(opts[i].risk[k]).toBeGreaterThanOrEqual(p - 1e-9);
      }
      if (opts.some((o) => Object.keys(o.risk).length > 0)) covered += 1;
    }
    expect(covered).toBeGreaterThan(5);
  });

  it('never puts dangerous goods or a main deck unit on a passenger flight', () => {
    for (const s of baseShipments) {
      if (!s.assigned) continue;
      const f = F[s.assigned];
      if (s.dg) expect(f.kind).toBe('FRT');
      if (s.mainDeck) expect(f.kind).toBe('FRT');
      expect(f.dep).toBeGreaterThanOrEqual(s.ready);
    }
  });

  it('propagates the 9h delay on the trigger flight to the same aircraft\'s return flight', () => {
    expect(F[R1].dep - F[R1].schedDep).toBeCloseTo(9, 5);
    expect(baseScenario.ripple.trigger.flight).toBe(R1);
    expect(baseScenario.returnFlight.dep).toBeGreaterThan(baseScenario.returnFlight.schedDep);
    expect(baseScenario.returnFlight.dep).toBeCloseTo(F[R1].arr + 2.5, 5);
  });

  it('detects the three connecting shipments out of Shanghai as re planned', () => {
    const fromPvg = baseShipments.filter((s) => s.origin === 'PVG');
    expect(fromPvg).toHaveLength(3);
    for (const s of fromPvg) expect(s.status).not.toBe('No action needed');
    expect(baseScenario.ripple.chain.map((l) => l.flight)).toEqual([R1, baseScenario.returnFlight.id, C1]);
  });

  it('moves the cherries off the delayed flight to an earlier arrival inside their promise', () => {
    const s = hero('cherries')!;
    expect(s.booked).toBe(R1);
    expect(s.assigned).toBe(R2);
    expect(F[R2].arr).toBeLessThanOrEqual(s.promise);
    expect(F[R1].arr).toBeGreaterThan(s.promise);
  });

  it('moves the garments automatically to a later flight inside their promise', () => {
    const s = hero('garments')!;
    expect(s.booked).toBe(R2);
    expect(s.assigned).not.toBe(R2);
    expect(F[s.assigned!].arr).toBeLessThanOrEqual(s.promise);
    expect(s.status).toBe('Placed automatically');
  });

  it('shows the honest cases: electronics placed late, isotopes need a person', () => {
    expect(hero('electronics')!.status).toBe('Placed, promise missed');
    const iso = hero('isotopes')!;
    expect(iso.status).toBe('Needs a person');
    expect(iso.assigned).toBeNull();
  });

  // Known model issue, reported to the team: run.py sorts the bump order by the optimiser's full bump cost
  // (which includes the wait term), but publishes overbookingCost = full minus underbooking cost. On some flights
  // the published numbers are not ascending. it.fails documents it; this test flips when the model is fixed.
  it.fails('KNOWN MODEL ISSUE: bump order is ascending in the published overbooking cost on every flight', () => {
    const by = Object.fromEntries(baseShipments.map((s) => [s.awb, s]));
    for (const f of baseScenario.flights) {
      const co = f.bumpOrder.map((a) => by[a].overbookingCost).filter((v): v is number => v !== undefined && v !== null);
      expect(co).toEqual([...co].sort((a, b) => a - b));
    }
  });

  it('On Call 36 beats both reference rules on expected cost and promises kept', () => {
    const ours = compare.find((p) => p.policy === 'On Call 36')!;
    for (const p of compare.filter((x) => x.policy === 'Backlog first' || x.policy === 'Original bookings first')) {
      expect(ours.expectedCostIndex).toBeLessThan(p.expectedCostIndex);
      expect(ours.promisesKept).toBeGreaterThanOrEqual(p.promisesKept);
    }
  });

  it('reports the ablations, including when the neural risk does not pay for itself', () => {
    const names = compare.map((p) => p.policy);
    expect(names).toContain('Median-capacity optimiser');
    expect(names).toContain('Without neural risk');
  });
});

describe('SHAP drivers', () => {
  it('base plus contributions is within 1% of the median forecast on every flight', () => {
    for (const f of baseScenario.flights) {
      const sum = f.forecast.shapBaseKg + f.forecast.drivers.reduce((a, d) => a + d.effectKg, 0);
      expect(Math.abs(sum - f.forecastKg.p50) / f.forecastKg.p50).toBeLessThan(0.01);
    }
  });

  it('the waterfall ends at the median forecast; any residual of 5 kg or more is its own bar', () => {
    for (const f of baseScenario.flights) {
      const steps = waterfallSteps(f, (l) => l, 'scale', 'base', 'total', 'other');
      const last = steps[steps.length - 2];
      expect(Math.abs(last.to - f.forecastKg.p50)).toBeLessThan(5);
      expect(steps[steps.length - 1].to).toBe(f.forecastKg.p50);
    }
  });
});

describe('offline snapshot', () => {
  it('plays back every pre computed case by its request', () => {
    for (const o of overrides) {
      const r = solveSnapshot(overrideRequest(o))!;
      expect(r).not.toBeNull();
      expect(r.feasible).toBe(o.feasible);
      if (!o.feasible) expect(r.reason).toBe(o.reason);
    }
    for (const w of whatifs) expect(solveSnapshot(whatIfRequest(w))?.feasible).toBe(true);
  });

  it('treats the default trigger delay as implied when matching', () => {
    expect(requestKey({ forced: {}, capScale: {}, delays: { [R4]: 6 } })).toBe(requestKey({ forced: {}, capScale: {}, delays: { [R1]: 9, [R4]: 6 } }));
  });

  it('applies a change list: shipments move and planned loads follow', () => {
    const o = overrides.find((x) => x.label.startsWith('Keep the garments'))!;
    const plan = applyChanges(basePlan, o.changed!, overrideRequest(o));
    const g = plan.shipments.find((s) => s.awb === o.awb)!;
    expect(g.assigned).toBe(R2);
    for (const f of plan.scenario.flights) {
      const kg = plan.shipments.filter((s) => s.assigned === f.id).reduce((a, s) => a + s.kg, 0);
      expect(f.plannedKg).toBe(kg);
      expect(new Set(f.bumpOrder)).toEqual(new Set(plan.shipments.filter((s) => s.assigned === f.id).map((s) => s.awb)));
    }
  });

  it('applies capacity scales and delays to the flights', () => {
    const w = whatifs.find((x) => x.inputs.cap_scale)!;
    const plan = applyChanges(basePlan, w.changed, whatIfRequest(w));
    const f = plan.scenario.flights.find((x) => x.id === R2)!;
    expect(f.capacityScale).toBe(0.8);
    expect(f.forecastKg.p50).toBe(Math.round(F[R2].forecastKg.p50 * 0.8));
    const d = whatifs.find((x) => x.inputs.delays?.[R4])!;
    const p2 = applyChanges(basePlan, d.changed, whatIfRequest(d));
    expect(p2.scenario.flights.find((x) => x.id === R4)!.dep).toBeCloseTo(F[R4].schedDep + 6, 5);
  });

  it('has no answer for a request that was never pre computed', () => {
    expect(solveSnapshot({ forced: {}, capScale: { [role('CX9201')]: 0.5 }, delays: {} })).toBeNull();
  });
});

describe('OAG backbone and back to normal forecast', () => {
  it('uses real OAG flights for every scenario role', () => {
    for (const f of baseScenario.flights) {
      expect(f.source).toBe('OAG schedule');
      expect(f.id).toMatch(/^CX\d{1,4}$/);
      expect(f.role).toMatch(/^CX9\d{3}$/);
    }
  });

  it('forecasts the time back to normal with ordered percentiles and a lever that helps', () => {
    const o = backlog.overall;
    expect(o.p10).not.toBeNull();
    expect(o.p10!).toBeLessThanOrEqual(o.p50!);
    expect(o.p50!).toBeLessThanOrEqual(o.p90!);
    expect(backlog.lanes.map((l) => l.lane)).toEqual(['PVG', 'NRT', 'LAX']);
    expect(backlog.lever.p50HoursEarlier!).toBeGreaterThan(0);
    const probs = o.byMidnight.map((d) => d.probability);
    expect(probs).toEqual([...probs].sort((a, b) => a - b));
    for (let i = 0; i < backlog.fan.t.length; i++) expect(backlog.fan.p10[i]).toBeLessThanOrEqual(backlog.fan.p90[i]);
  });
});

describe('display text', () => {
  it('shows flight numbers as CX 9xxx', () => {
    expect(fmtFlight('CX380')).toBe('CX 380');
    expect(fmtFlight('CX2058')).toBe('CX 2058');
    expect(modelText('Moved from CX360 (delayed 9h) to CX380.')).toBe('Moved from CX 360 (delayed 9h) to CX 380.');
  });

  it('translates every model sentence into Chinese', () => {
    const texts = [
      ...baseShipments.flatMap((s) => [s.reason, s.note, ...s.alternatives.map((a) => (a.reason ? `Not allowed: ${a.reason}.` : ''))]),
      ...baseScenario.flights.flatMap((f) => [f.reason, f.status, f.cause]),
      ...baseScenario.ripple.chain.flatMap((l) => [l.label, l.status ?? '', l.cause ?? '']),
      baseScenario.ripple.trigger.cause, baseScenario.returnFlight.cause, baseScenario.returnFlight.status,
      ...overrides.flatMap((o) => [o.label, o.reason ?? '', ...(o.changed ?? []).map((c) => c.reason)]),
      ...whatifs.flatMap((w) => [w.label, ...w.changed.map((c) => c.reason)]),
    ].filter(Boolean);
    const findings = baseShipments.flatMap((s) => s.alternatives.flatMap((a) => a.regulatory?.findings.map((f) => f.message) ?? []));
    for (const m of new Set(findings)) expect(ruleText(m, 'zh'), m).not.toBe(m);
    const missing = texts.flatMap(untranslated);
    expect(missing).toEqual([]);
    expect(modelText(hero('cherries')!.reason, 'zh')).toContain(fmtFlight(R2));
  });
});

describe('disruption trigger sources', () => {
  it('maps HKO warnings to cargo impact and drops cancelled ones', async () => {
    const { parseWarnings, hkoTriggers } = await import('./sources');
    const w = parseWarnings({
      WTS: { name: 'Thunderstorm Warning', code: 'WTS', actionCode: 'ISSUE', issueTime: '2026-11-17T10:00:00+08:00' },
      WTCSGNL: { name: 'No. 8 Northeast Gale or Storm Signal', code: 'TC8NE', actionCode: 'ISSUE' },
      WRAIN: { name: 'Amber Rainstorm', code: 'WRAINA', actionCode: 'CANCEL' },
      WHOT: { name: 'Very Hot Weather Warning', code: 'WHOT', actionCode: 'ISSUE' },
    });
    expect(w.map((x) => x.code)).toEqual(['TC8NE', 'WTS', 'WHOT']);
    expect(w[0].impact).toBe('severe');
    expect(hkoTriggers({ fetchedAt: '', warnings: w, forecast: [], cached: false })).toBe(true);
    expect(hkoTriggers({ fetchedAt: '', warnings: parseWarnings({}), forecast: [], cached: false })).toBe(false);
    expect(hkoTriggers({ fetchedAt: '', warnings: w.filter((x) => x.impact === 'watch'), forecast: [], cached: false })).toBe(false);
  });

  it('flags forecast days that need watching', async () => {
    const { parseForecast } = await import('./sources');
    const d = parseForecast({ weatherForecast: [
      { forecastDate: '20261115', week: 'Sunday', forecastWeather: 'Mainly fine.', forecastMaxtemp: { value: 27 }, forecastMintemp: { value: 22 }, PSR: 'Low' },
      { forecastDate: '20261116', week: 'Monday', forecastWeather: 'Showers and a few squally thunderstorms.', forecastMaxtemp: { value: 25 }, forecastMintemp: { value: 21 }, PSR: 'Medium' },
    ] });
    expect(d.map((x) => x.watch)).toEqual([false, true]);
    expect(d[0].max).toBe(27);
  });
});
