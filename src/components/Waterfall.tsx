// SHAP waterfall for one flight's median capacity forecast: start at the base, one bar per driver, end at the median.
import type { Flight } from '../model/types';
import { driverLabel, fmtFlight } from '../model/text';
import { useT } from '../i18n';
import { fmtKgNum } from '../lib/time';

interface Step { label: string; from: number; to: number; kind: 'base' | 'up' | 'down' | 'total' | 'scale'; value: string }

export function waterfallSteps(f: Flight, label: (s: string) => string, scaleLabel: string, baseLabel: string, totalLabel: string, otherLabel = 'Other'): Step[] {
  const steps: Step[] = [];
  let run = f.forecast.shapBaseKg;
  steps.push({ label: baseLabel, from: 0, to: run, kind: 'base', value: `${fmtKgNum(run)} kg` });
  const drivers = [...f.forecast.drivers].sort((a, b) => Math.abs(b.effectKg) - Math.abs(a.effectKg));
  for (const d of drivers) {
    steps.push({ label: label(d.label), from: run, to: run + d.effectKg, kind: d.effectKg >= 0 ? 'up' : 'down', value: `${d.effectKg >= 0 ? '+' : '−'}${fmtKgNum(Math.abs(d.effectKg))} kg` });
    run += d.effectKg;
  }
  // SHAP values are on the unrounded model output; quantile ordering and rounding leave a small residual. Show it rather than hide it.
  const unscaled = Math.round(f.forecastKg.p50 / (f.capacityScale || 1));
  if (Math.abs(unscaled - run) >= 5) {
    steps.push({ label: otherLabel, from: run, to: unscaled, kind: unscaled >= run ? 'up' : 'down', value: `${unscaled >= run ? '+' : '−'}${fmtKgNum(Math.abs(unscaled - run))} kg` });
    run = unscaled;
  }
  if (Math.abs(f.capacityScale - 1) > 1e-9) {
    const scaled = f.forecastKg.p50;
    steps.push({ label: scaleLabel, from: run, to: scaled, kind: scaled >= run ? 'up' : 'down', value: `${scaled >= run ? '+' : '−'}${fmtKgNum(Math.abs(scaled - run))} kg` });
    run = scaled;
  }
  steps.push({ label: totalLabel, from: 0, to: f.forecastKg.p50, kind: 'total', value: `${fmtKgNum(f.forecastKg.p50)} kg` });
  return steps;
}

export function Waterfall({ flight }: { flight: Flight }) {
  const { t, locale } = useT();
  const steps = waterfallSteps(flight, (l) => driverLabel(l, locale), t('shap.scale', { pct: Math.round(flight.capacityScale * 100) }), t('shap.base'), t('shap.total'), t('shap.other'));
  const values = steps.flatMap((s) => (s.kind === 'base' || s.kind === 'total' ? [s.to] : [s.from, s.to]));
  const lo = Math.min(...values) * 0.9;
  const hi = Math.max(...values) * 1.03;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="wf">
      <p className="muted small">{t('shap.caption', { flight: fmtFlight(flight.id), kg: fmtKgNum(flight.forecastKg.p50) })}</p>
      <div className="wf-rows" role="img" aria-label={steps.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {steps.map((s, i) => {
          const a = s.kind === 'base' || s.kind === 'total' ? lo : Math.min(s.from, s.to);
          const b = s.kind === 'base' || s.kind === 'total' ? s.to : Math.max(s.from, s.to);
          return (
            <div key={i} className={`wf-row wf-row--${s.kind}`}>
              <span className="wf-label">{s.label}</span>
              <span className="wf-track">
                <i style={{ left: `${x(a)}%`, width: `${Math.max(0.6, x(b) - x(a))}%` }} />
              </span>
              <b className="wf-value">{s.value}</b>
            </div>
          );
        })}
      </div>
      <p className="xs muted">{t('shap.note')}</p>
    </div>
  );
}
