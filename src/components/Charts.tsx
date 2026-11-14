// Small charts built in HTML and SVG. Single series bars, a status donut, and tier bars on the jade ramp.
import { useState } from 'react';

export interface BarDatum { key: string; label: string; value: number; tip: string }

export function BarChart({ data, format }: { data: BarDatum[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <div role="img" aria-label={data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}>
      <div className="chart-bars">
        <div className="chart-grid" aria-hidden>
          {ticks.map((v) => <span key={v} style={{ top: `${100 - (v / top) * 100}%` }}><em>{format(v)}</em></span>)}
        </div>
        {data.map((d) => (
          <div key={d.key} className="chart-bar" tabIndex={0}>
            <i style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 4 : 0 }} />
            <span className="tip">{d.tip}</span>
          </div>
        ))}
      </div>
      <div className="chart-baseline" />
      <div className="chart-axis" aria-hidden>
        {data.map((d) => <span key={d.key}>{d.label}</span>)}
      </div>
    </div>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export interface DonutSlice { key: string; label: string; value: number; color: string }

export function Donut({ slices, total, unit }: { slices: DonutSlice[]; total: number; unit: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const r = 70;
  const c = 2 * Math.PI * r;
  const gap = 3;
  let acc = 0;
  const active = slices.find((s) => s.key === hover);
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 180 180" role="img" aria-label={slices.map((s) => `${s.label} ${s.value}`).join(', ')}>
          <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
          {slices.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle key={s.key} cx="90" cy="90" r={r} fill="none" stroke={s.color} strokeWidth={hover === s.key ? 22 : 18}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-acc}
                onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="donut-center">
          <div><b>{active ? active.value : total}</b><span>{active ? active.label : unit}</span></div>
        </div>
      </div>
      <div className="legend">
        {slices.map((s) => (
          <div key={s.key} className="legend-row" onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.value}</b>
            <span className="pct">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TierBars({ rows }: { rows: { tier: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.tier} className="hbar">
          <span className={`tier tier--${r.tier}`}>{r.tier}</span>
          <div className="hbar-track"><i style={{ width: `${(r.value / max) * 100}%`, background: `var(--tier-${r.tier})`, boxShadow: r.tier === 'GEN' ? 'inset 0 0 0 1px #b9d3d0' : undefined }} /></div>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}
