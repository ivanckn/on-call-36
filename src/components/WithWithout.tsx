// With and without: three policies from compare.json, then an ablation that removes one part of the model at a time.
import { compare } from '../model/data';
import type { PolicyResult } from '../model/types';
import { useT } from '../i18n';
import { fmtKgNum } from '../lib/time';

const POLICY_KEY: Record<string, string> = {
  'Backlog first': 'ww.backlog', 'Original bookings first': 'ww.original', 'On Call 36': 'ww.ours',
  'Median-capacity optimiser': 'ww.median', 'Without neural risk': 'ww.noNeural',
};
const MAIN = ['Backlog first', 'Original bookings first', 'On Call 36'];

type Metric = { key: keyof PolicyResult; label: string; fmt: (p: PolicyResult) => string; better: 'low' | 'high' };
const n0 = (v?: number) => (v === undefined ? '—' : Math.round(v).toLocaleString('en-US'));

export function WithWithout() {
  const { t } = useT();
  const main = compare.filter((p) => MAIN.includes(p.policy));
  const ablations = compare.filter((p) => !MAIN.includes(p.policy));
  const ours = compare.find((p) => p.policy === 'On Call 36')!;
  const n = ours?.shipments ?? 0;
  const head: Metric[] = [
    { key: 'expectedCostIndex', label: 'ww.cost', fmt: (p) => n0(p.expectedCostIndex), better: 'low' },
    { key: 'promisesKept', label: 'ww.promises', fmt: (p) => `${Math.round(p.promisesKept)} / ${p.shipments}`, better: 'high' },
    { key: 'avgHoursLatePRSandPR1', label: 'ww.late', fmt: (p) => `${p.avgHoursLatePRSandPR1.toFixed(1)}h`, better: 'low' },
  ];
  const rest: Metric[] = [
    { key: 'perishableInShelfLife', label: 'ww.perishable', fmt: (p) => `${p.perishableInShelfLife} / ${p.perishableTotal}`, better: 'high' },
    { key: 'downstreamDeadlineMisses', label: 'ww.downstream', fmt: (p) => (p.downstreamDeadlineMisses ?? 0).toFixed(1), better: 'low' },
    { key: 'bumpedAtAircraft', label: 'ww.bumped', fmt: (p) => p.bumpedAtAircraft.toFixed(2), better: 'low' },
    { key: 'emptyKgOnFirstFlightsOut', label: 'ww.empty', fmt: (p) => `${fmtKgNum(p.emptyKgOnFirstFlightsOut)} kg`, better: 'low' },
    { key: 'p95CostIndex', label: 'ww.p95', fmt: (p) => n0(p.p95CostIndex), better: 'low' },
    { key: 'unplaced', label: 'ww.unplaced', fmt: (p) => String(p.unplaced), better: 'low' },
  ];
  const best = (m: Metric) => {
    const vals = main.map((p) => p[m.key] as number);
    return m.better === 'low' ? Math.min(...vals) : Math.max(...vals);
  };
  const isOurs = (p: PolicyResult) => p.policy === 'On Call 36';
  const beatsOurs = (m: Metric, p: PolicyResult) => !isOurs(p) && (m.better === 'low' ? (p[m.key] as number) < (ours[m.key] as number) : (p[m.key] as number) > (ours[m.key] as number));
  /** Cost after removing the part, minus ours: positive means the part lowers cost. */
  const delta = (p: PolicyResult) => p.expectedCostIndex - ours.expectedCostIndex;
  return (
    <section className="card" aria-label={t('ww.title')}>
      <div className="card-head"><div><h2>{t('ww.title')}</h2><p>{t('ww.intro', { n })}</p></div></div>
      <div className="grid grid--3">
        {main.map((p) => (
          <div key={p.policy} className={`policy ${isOurs(p) ? 'policy--ours' : ''}`}>
            <div className="policy-name">{t(POLICY_KEY[p.policy] ?? p.policy)}</div>
            <p className="xs muted">{t(`${POLICY_KEY[p.policy]}.note`)}</p>
            <dl className="policy-metrics">
              {head.map((m) => (
                <div key={m.key}>
                  <dt>{t(m.label)}</dt>
                  <dd className={(p[m.key] as number) === best(m) ? 'is-best' : ''}>{m.fmt(p)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table className="table table--compact">
          <thead><tr><th>{t('th.otherMetrics')}</th>{main.map((p) => <th key={p.policy} className={`right ${isOurs(p) ? 'hl' : ''}`}>{t(POLICY_KEY[p.policy] ?? p.policy)}</th>)}</tr></thead>
          <tbody>
            {rest.map((m) => (
              <tr key={m.key}>
                <td>{t(m.label)}</td>
                {main.map((p) => {
                  const v = p[m.key] as number;
                  return <td key={p.policy} className={`right num ${isOurs(p) ? 'hl' : ''}`} style={{ fontWeight: v === best(m) ? 700 : 400, color: v === best(m) ? 'var(--green)' : undefined }}>{m.fmt(p)}{beatsOurs(m, p) ? ` · ${t('ww.refBetter')}` : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ablations.length > 0 && (
        <div className="ablation">
          <div><b>{t('ww.ablation')}</b><p className="xs muted">{t('ww.ablationIntro')}</p></div>
          <div className="ablation-row xs muted"><span /><span>{t('ww.cost')}</span><span>{t('ww.promises')}</span><span>{t('ww.bumped')}</span></div>
          {[ours, ...ablations].map((p) => (
            <div key={p.policy} className="ablation-row">
              <span>{t(POLICY_KEY[p.policy] ?? p.policy)}<span className="xs muted" style={{ display: 'block' }}>{t(`${POLICY_KEY[p.policy]}.note`)}</span></span>
              <b>{n0(p.expectedCostIndex)}</b>
              <b>{Math.round(p.promisesKept)} / {p.shipments}</b>
              <b>{p.bumpedAtAircraft.toFixed(2)}</b>
            </div>
          ))}
          {ablations.map((p) => (
            <p key={p.policy} className="small">
              {t(delta(p) > 0 ? 'ww.ablationWorse' : delta(p) < 0 ? 'ww.ablationBetter' : 'ww.ablationSame', { part: t(`${POLICY_KEY[p.policy]}.part`), d: Math.abs(delta(p)).toLocaleString('en-US') })}
            </p>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 14 }}>{t('ww.foot')}</p>
    </section>
  );
}
