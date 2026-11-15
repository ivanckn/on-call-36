// Back to normal: Monte Carlo forecast of the time to clear the backlog, over the real OAG schedule.
import { backlog } from '../model/data';
import { placeName } from '../model/text';
import type { ClearSummary, Fan } from '../model/types';
import { useT } from '../i18n';
import { fmtClock, fmtT } from '../lib/time';
import { toDate } from '../lib/time';

const day = (h: number | null, locale: 'en' | 'zh') => {
  if (h === null) return '—';
  const d = toDate(h);
  return locale === 'zh' ? `${d.getMonth() + 1}月${d.getDate()}日 ${fmtClock(h, locale).split(' ')[0]}` : `${fmtClock(h, locale).split(' ')[0]} ${d.getDate()} Nov`;
};

function FanChart({ fan }: { fan: Fan }) {
  const { t, locale } = useT();
  const W = 1400, H = 300, L = 56, B = 30, T = 24, Rp = 12;
  const tMin = fan.t[0], tMax = fan.t[fan.t.length - 1];
  const yMax = Math.max(...fan.p90) * 1.05 || 1;
  const x = (v: number) => L + ((v - tMin) / (tMax - tMin)) * (W - L - Rp);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const band = (f: Fan) => `M${f.t.map((v, i) => `${x(v)},${y(f.p90[i])}`).join(' L')} L${[...f.t].reverse().map((v, i) => `${x(v)},${y(f.p10[f.t.length - 1 - i])}`).join(' L')} Z`;
  const line = (f: Fan) => `M${f.t.map((v, i) => `${x(v)},${y(f.p50[i])}`).join(' L')}`;
  const ticks = [];
  for (let h = Math.ceil((tMin + 6) / 24) * 24 - 6; h <= tMax; h += 24) ticks.push(h);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(yMax * k / 50) * 50);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('bk.chartAria')} style={{ display: 'block' }}>
      {yTicks.map((v) => <g key={v}><line x1={L} x2={W - Rp} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" /><text x={L - 6} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize="13" fill="var(--text-3)">{v}</text></g>)}
      {ticks.map((h) => <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize="13" fill="var(--text-3)">{day(h, locale)}</text>)}
      <path d={band(fan)} fill="var(--tint-2)" opacity="0.9" />
      <path d={line(fan)} fill="none" stroke="var(--green)" strokeWidth="2" />
      <text x={L} y={T - 8} fontSize="13" fill="var(--text-3)">{t('bk.tonnes')}</text>
    </svg>
  );
}

function Range({ c }: { c: ClearSummary }) {
  const { locale } = useT();
  return <span className="num">{day(c.p10, locale)} – {day(c.p90, locale)}</span>;
}

export function BacklogCard() {
  const { t, locale } = useT();
  const b = backlog;
  const c = b.overall;
  const lanes = b.lanes.map((l) => ({ ...l, clear: l.clearHours }));
  const total = b.lanes.reduce((s, l) => s + l.initialBacklogTonnes.p50, 0);
  return (
    <section className="card" aria-label={t('bk.title')}>
      <div className="card-head">
        <div><h2>{t('bk.title')}</h2><p>{t('bk.intro', { n: b.assumptions.trials.toLocaleString('en-US'), flights: b.cancelled.length })}</p></div>
      </div>
      <div className="bk">
        <div className="bk-head">
          <div className="kpi kpi--jade" style={{ boxShadow: 'none' }}>
            <span className="kpi-label">{t('bk.p50')}</span>
            <div className="kpi-value" style={{ fontSize: 30 }}>{day(c.p50, locale)}</div>
            <div className="kpi-sub">{fmtT(c.p50 ?? 0)} · {t('bk.range')} <Range c={c} /></div>
          </div>
          <div className="kpi kpi--sand" style={{ boxShadow: 'none' }}>
            <span className="kpi-label">{t('bk.backlog')}</span>
            <div className="kpi-value" style={{ fontSize: 30 }}>{Math.round(total).toLocaleString('en-US')} t</div>
            <div className="kpi-sub">{t('bk.backlogSub', { n: b.cancelled.length })}</div>
          </div>
          <div className="kpi kpi--sky" style={{ boxShadow: 'none' }}>
            <span className="kpi-label">{t('bk.bottleneck')}</span>
            <div className="kpi-value" style={{ fontSize: 30 }}>{placeName(lanes.reduce((a, x) => ((x.clear.p50 ?? 1e9) > (a.clear.p50 ?? 0) ? x : a)).lane, locale)}</div>
            <div className="kpi-sub">{t('bk.bottleneckSub')}</div>
          </div>
        </div>
        <FanChart fan={b.fan} />
        <div className="band-legend" style={{ marginTop: 6 }}>
          <span><span className="swatch swatch--tint" />{t('bk.band')}</span>
          <span><span className="swatch" style={{ width: 18, height: 2, background: 'var(--green)' }} />{t('bk.median')}</span>
        </div>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="table table--compact">
            <thead><tr><th>{t('bk.lane')}</th><th className="right">{t('bk.cancelled')}</th><th className="right">{t('bk.start')}</th><th>{t('bk.p50short')}</th><th>{t('bk.rangeShort')}</th><th className="right">{t('bk.within')}</th></tr></thead>
            <tbody>
              {lanes.map((l) => (
                <tr key={l.lane}>
                  <td>{t('to', { a: 'HKG', b: l.lane })}<span className="sub">{placeName(l.lane, locale)}</span></td>
                  <td className="right num">{l.cancelledFlights}</td>
                  <td className="right num">{Math.round(l.initialBacklogTonnes.p50)} t</td>
                  <td className="nowrap"><b>{day(l.clear.p50, locale)}</b><span className="sub">{fmtT(l.clear.p50 ?? 0)}</span></td>
                  <td className="nowrap"><Range c={l.clear} /></td>
                  <td className="right num">{Math.round(l.clear.clearedWithinSchedule * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted" style={{ marginTop: 10 }}>{t('bk.note', { share: Math.round(b.assumptions.normalWhenBacklogBelowShare * 100), end: day(b.scheduleEnd, locale) })}</p>
      </div>
    </section>
  );
}
