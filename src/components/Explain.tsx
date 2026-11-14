// The regulatory screen and the learned time sensitivity for one shipment, both straight from the model output.
import type { Regulatory, Shipment } from '../model/types';
import { fmtFlight, regStatusName, ruleText, sourceText } from '../model/text';
import { useT } from '../i18n';
import { fmtClock, fmtT } from '../lib/time';
import { Status, type Tone } from './Status';

export const regTone = (st?: string): Tone => (st === 'BLOCKED' ? 'alert' : st === 'NEEDS_DG_REVIEW' ? 'caution' : st ? 'ok' : 'none');

export function RegPill({ reg }: { reg?: Regulatory | null }) {
  const { locale } = useT();
  if (!reg) return null;
  return <Status tone={regTone(reg.status)}>{regStatusName(reg.status, locale)}</Status>;
}

/** Findings for one shipment and leg: the deciding status first. */
export function Findings({ reg, compact = false }: { reg: Regulatory; compact?: boolean }) {
  const { locale } = useT();
  const order = { BLOCKED: 0, NEEDS_DG_REVIEW: 1, ELIGIBLE_FOR_PLANNING: 2 } as const;
  const list = [...reg.findings].sort((a, b) => order[a.status] - order[b.status]);
  if (list.length === 0) return null;
  return (
    <ul className={`findings ${compact ? 'findings--compact' : ''}`}>
      {list.map((f, i) => (
        <li key={i}>
          <span className={`dot dot--${regTone(f.status)}`} />
          <span>{ruleText(f.message, locale)}<span className="finding-src">{f.code} · {sourceText(f.source, locale)}</span></span>
        </li>
      ))}
    </ul>
  );
}

export function RegulatoryCard({ s }: { s: Shipment }) {
  const { t, locale } = useT();
  const legs = s.alternatives.filter((a) => a.regulatory);
  const declared = legs[0]?.regulatory?.declaredUNs ?? [];
  const items = s.regulatedItems ?? [];
  const screened = items.length > 0 || legs.some((a) => (a.regulatory?.findings.length ?? 0) > 0);
  const version = legs[0]?.regulatory?.policyVersion;
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>{t('reg.title')}</h2><p>{t('reg.intro')}</p></div>
        {version && <span className="code">{version}</span>}
      </div>
      {!screened ? <p className="empty">{t('reg.none')}</p> : (
        <>
          {declared.length > 0 && (
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="small muted">{t('reg.declared')}</span>
              {declared.map((u) => <span key={u} className="code">{u}</span>)}
              {items.map((it) => <span key={it.entryId} className="xs muted">{t('reg.package', { n: it.packageCount, q: it.netPerPackage, unit: it.unit })}</span>)}
            </div>
          )}
          <div className="table-wrap">
            <table className="table table--compact">
              <thead><tr><th>{t('th.flight')}</th><th>{t('reg.status')}</th><th>{t('reg.findings')}</th></tr></thead>
              <tbody>
                {legs.map((a) => (
                  <tr key={a.flight} className={a.chosen ? 'is-chosen' : ''}>
                    <td className="flightno">{fmtFlight(a.flight)}{a.chosen && <span className="sub">{t('alt.chosen')}</span>}</td>
                    <td><RegPill reg={a.regulatory} /></td>
                    <td>{a.regulatory && a.regulatory.findings.length > 0 ? <Findings reg={a.regulatory} compact /> : <span className="muted small">{t('reg.clean')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="xs muted" style={{ marginTop: 10 }}>{t('reg.note')}</p>
        </>
      )}
      {locale === 'zh' && screened && <p className="xs muted" style={{ marginTop: 4 }}>{t('reg.zhNote')}</p>}
    </div>
  );
}

const pctTxt = (p?: number) => (p === undefined ? '—' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);

export function RiskCard({ s }: { s: Shipment }) {
  const { t, locale } = useT();
  const ts = s.timeSensitivity;
  const opts = ts?.flightOptions ?? [];
  const covered = opts.some((o) => Object.keys(o.risk).length > 0);
  const kinds = covered ? Object.keys(opts.find((o) => Object.keys(o.risk).length > 0)!.risk) : [];
  const max = Math.max(0.0001, ...opts.flatMap((o) => Object.values(o.risk)));
  return (
    <div className="card">
      <div className="card-head"><div><h2>{t('risk.title')}</h2><p>{t('risk.intro')}</p></div></div>
      {!covered ? <p className="empty">{t('risk.none')}</p> : (
        <>
          <div className="table-wrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>{t('th.flight')}</th><th>{t('th.arrival')}</th>
                  {kinds.map((k) => <th key={k}>{t(`risk.${k}`)}</th>)}
                  <th className="right">{t('risk.charge')}</th>
                </tr>
              </thead>
              <tbody>
                {opts.map((o) => (
                  <tr key={o.flight} className={o.flight === s.assigned ? 'is-chosen' : ''}>
                    <td className="flightno">{fmtFlight(o.flight)}</td>
                    <td className="nowrap num">{fmtClock(o.arrival, locale)}<span className="sub">{fmtT(o.arrival)}</span></td>
                    {kinds.map((k) => (
                      <td key={k}>
                        <div className="riskbar"><i style={{ width: `${(o.risk[k] / max) * 100}%` }} /></div>
                        <span className="xs num">{pctTxt(o.risk[k])}{o.increaseVsEarliestPercentagePoints[k] > 0.05 ? ` · +${o.increaseVsEarliestPercentagePoints[k].toFixed(1)} ${t('risk.pts')}` : ''}</span>
                      </td>
                    ))}
                    <td className="right num">{o.riskChargeInObjective.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="xs muted" style={{ marginTop: 10 }}>{t('risk.note', { dl: ts?.downstreamDeadline != null ? fmtT(ts.downstreamDeadline) : '—' })}</p>
        </>
      )}
    </div>
  );
}
