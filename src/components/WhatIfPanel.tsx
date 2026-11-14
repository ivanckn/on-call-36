// "What if I override?": five pre computed cases from overrides.json. Offline, no solver call.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { basePlan, overrides } from '../model/data';
import { overrideRequest, shipmentMap } from '../model/plan';
import { commodityName, fmtFlight, modelText, statusName } from '../model/text';
import { useT } from '../i18n';
import { useDemo } from '../state/demo';
import { Deltas } from './LivePanel';
import { Status, TierChip, toneOf } from './Status';
import { Findings } from './Explain';

export function WhatIfPanel() {
  const { t, locale } = useT();
  const { runExact } = useDemo();
  const [pick, setPick] = useState(0);
  const o = overrides[pick];
  const by = shipmentMap(basePlan);
  const target = by[o.awb];
  return (
    <section className="card" aria-label={t('wi.title')}>
      <div className="card-head"><div><h2>{t('wi.title')}</h2><p>{t('wi.intro')}</p></div></div>
      <div className="wi">
        <div className="wi-list" role="tablist">
          {overrides.map((x, i) => (
            <button key={x.label} role="tab" aria-selected={i === pick} className={`wi-case ${i === pick ? 'wi-case--on' : ''}`} onClick={() => setPick(i)}>
              <span>{modelText(x.label, locale)}</span>
              {x.feasible ? <Status tone="ok">{t('wi.allowed')}</Status> : <Status tone="alert">{t('wi.blocked')}</Status>}
            </button>
          ))}
        </div>
        <div className="wi-detail">
          <p className="small muted">{t('wi.force', { name: commodityName(target?.commodity ?? '', locale), flight: fmtFlight(o.flight) })}</p>
          {!o.feasible ? (
            <div className="blocked" style={{ marginTop: 12 }}><Status tone="alert">{t('wi.blocked')}</Status><span>{modelText(o.reason, locale)}</span>{o.regulatory && <div style={{ flexBasis: '100%' }}><Findings reg={o.regulatory} compact /></div>}</div>
          ) : (
            <>
              <Deltas diff={{ costIndexChange: o.costIndexChange ?? 0, promisesKeptChange: o.promisesKeptChange ?? 0, perishableChange: o.perishableChange ?? 0 }} />
              <table className="table table--compact">
                <thead><tr><th>{t('th.shipment')}</th><th>{t('wi.before')}</th><th>{t('wi.after')}</th><th>{t('th.status')}</th></tr></thead>
                <tbody>
                  {(o.changed ?? []).map((c) => (
                    <tr key={c.awb}>
                      <td><TierChip tier={c.tier} /> <Link to={`/shipment/${c.awb}`}>{commodityName(c.commodity, locale)}</Link><span className="sub">{modelText(c.reason, locale)}</span></td>
                      <td className="nowrap">{c.was ? fmtFlight(c.was) : t('col.newBooking')}</td>
                      <td className="nowrap"><b>{c.now ? fmtFlight(c.now) : t('live.toPerson')}</b></td>
                      <td><Status tone={toneOf(c.statusNow)}>{statusName(c.statusNow, locale)}</Status></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btn--secondary btn--small" onClick={() => runExact(overrideRequest(o), `What if: ${o.label}`)}>{t('wi.show')}</button>
                <span className="xs muted">{t('wi.showNote')}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
