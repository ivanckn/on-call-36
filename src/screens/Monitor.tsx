// Monitor: one delayed flight, the ripple it causes, and what is at stake.
import { Link } from 'react-router-dom';
import { BacklogCard } from '../components/Backlog';
import { SourcesCard } from '../components/Sources';
import { BarChart, Donut, TierBars } from '../components/Charts';
import { IconArrow, IconBox, IconCherry, IconPlane, IconThermo, IconWarn, IconClock } from '../components/Icons';
import { ModelStatusPill, Status, TierChip } from '../components/Status';
import { CHERRIES } from '../model/data';
import { counts, flightMap, flightsInOrder, isAffected, tierCounts } from '../model/plan';
import { commodityName, fmtFlight, modelText, placeName } from '../model/text';
import { TIER_ORDER } from '../model/types';
import { useT } from '../i18n';
import { fmtClock, fmtT } from '../lib/time';
import { useDemo } from '../state/demo';

const sensitive = (shc: string[]) => shc.some((c) => ['PER', 'COL', 'AVI', 'PIL'].includes(c));

export function Monitor() {
  const { state } = useDemo();
  const { t, locale } = useT();
  const plan = state.plan;
  const sc = plan.scenario;
  const fl = flightMap(plan);
  const c = counts(plan);
  const affected = plan.shipments.filter(isAffected);
  const trigger = fl[sc.ripple.trigger.flight];
  const placed = c['Placed automatically'];
  const attention = plan.shipments.filter((s) => s.status === 'Placed, promise missed' || s.status === 'Needs a person');

  // Disrupted flights: the delayed flight, the knock on return flight, and the onward flight whose connections break.
  const ret = sc.returnFlight;
  const disrupted = [
    ...flightsInOrder(plan).filter((f) => f.status !== 'On time').map((f) => {
      const booked = plan.shipments.filter((s) => s.booked === f.id);
      return { id: f.id, from: f.origin, to: f.dest, sched: f.schedDep, dep: f.dep, kind: f.kind, status: f.status, cause: f.cause, booked: booked.length, replan: booked.filter((s) => s.assigned !== f.id).length, sens: booked.filter((s) => sensitive(s.shc)).length };
    }),
    { id: ret.id, from: ret.origin, to: ret.dest, sched: ret.schedDep, dep: ret.dep, kind: 'PAX' as const, status: ret.status, cause: ret.cause,
      booked: sc.ripple.chain[1]?.shipments ?? 0, replan: sc.ripple.chain[1]?.needReplan ?? 0, sens: 0 },
  ];
  const conn = sc.ripple.chain[2];
  const connFlight = conn ? fl[conn.flight] : undefined;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t('monitor.title')}</h1>
          <p>{t('monitor.intro', { now: fmtT(sc.now), flight: fmtFlight(trigger?.id), status: modelText(trigger?.status, locale), cause: modelText(trigger?.cause, locale) })}</p>
        </div>
        <div className="actions"><Link to="/recovery" className="btn btn--primary">{t('monitor.open')}</Link></div>
      </div>

      <section className="grid grid--4" aria-label="At stake">
        <div className="kpi kpi--jade">
          <div className="kpi-top"><span className="kpi-label">{t('monitor.affected')}</span><span className="kpi-icon"><IconBox /></span></div>
          <div className="kpi-value">{affected.length}</div>
          <div className="kpi-sub">{TIER_ORDER.map((tier) => <span key={tier} className="kpi-chip">{tierCounts(affected)[tier]} {tier}</span>)}</div>
        </div>
        <div className="kpi kpi--sky">
          <div className="kpi-top"><span className="kpi-label">{t('monitor.sensitive')}</span><span className="kpi-icon"><IconThermo /></span></div>
          <div className="kpi-value">{affected.filter((s) => sensitive(s.shc)).length}</div>
          <div className="kpi-sub">{t('monitor.sensitiveSub')}</div>
        </div>
        <div className="kpi kpi--sand">
          <div className="kpi-top"><span className="kpi-label">{t('monitor.missed')}</span><span className="kpi-icon"><IconClock /></span></div>
          <div className="kpi-value">{c['Placed, promise missed']}</div>
          <div className="kpi-sub">{t('monitor.missedSub')}</div>
        </div>
        <div className="kpi kpi--rose">
          <div className="kpi-top"><span className="kpi-label">{t('monitor.needPerson')}</span><span className="kpi-icon"><IconWarn /></span></div>
          <div className="kpi-value">{c['Needs a person']}</div>
          <div className="kpi-sub"><span className="kpi-chip">{t('monitor.placedOf', { placed, affected: affected.length })}</span></div>
        </div>
      </section>

      <section className="card" aria-label={t('ripple.title')}>
        <div className="card-head"><div><h2><span className="card-icon"><IconPlane /></span>{t('ripple.title')}</h2><p>{t('ripple.intro')}</p></div></div>
        <div className="ripple">
          <div className="ripple-node ripple-node--trigger">
            <span className="xs">{t('ripple.trigger')}</span>
            <b>{fmtFlight(trigger?.id)}</b>
            <span>{t('to', { a: placeName(trigger?.origin ?? '', locale), b: placeName(trigger?.dest ?? '', locale) })}</span>
            <Status tone="alert">{modelText(trigger?.status, locale)}</Status>
            <span className="xs">{modelText(trigger?.cause, locale)}</span>
          </div>
          {sc.ripple.chain.map((link, i) => (
            <div key={link.flight + i} style={{ display: 'contents' }}>
              <div className="ripple-arrow" aria-hidden><IconArrow /></div>
              <div className="ripple-node">
                <span className="xs muted">{i + 1}. {modelText(link.label, locale)}</span>
                <b>{fmtFlight(link.flight)}</b>
                {i === 1 && <span className="small">{t('ripple.ret', { sched: fmtClock(ret.schedDep, locale), dep: fmtClock(ret.dep, locale) })}</span>}
                {i === 2 && connFlight && <span className="small">{t('ripple.conn', { dest: placeName(connFlight.dest, locale), dep: fmtClock(connFlight.dep, locale), arr: fmtClock(ret.arr, locale) })}</span>}
                {i === 0 && <span className="small">{t('ripple.onDelayed', { dep: fmtClock(trigger?.dep ?? 0, locale) })}</span>}
                <div className="ripple-counts">
                  <span><b>{link.shipments}</b> {t('ripple.shipments')}</span>
                  <span className={link.needReplan > 0 ? 'alert' : ''}><b>{link.needReplan}</b> {t('ripple.replan')}</span>
                </div>
                {link.status && <span className="xs muted">{modelText(link.status, locale)} · {modelText(link.cause, locale)}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <SourcesCard />

      <BacklogCard />

      <section className="grid grid--main">
        <div className="card">
          <div className="card-head"><div><h3>{t('chart.loadTitle')}</h3><p>{t('chart.loadNote')}</p></div></div>
          <BarChart format={(v) => `${Math.round(v)}%`} data={flightsInOrder(plan).map((f) => ({ key: f.id, label: f.id.replace('CX', ''), value: f.plannedVsMedian * 100, tip: `${fmtFlight(f.id)} · ${Math.round(f.plannedVsMedian * 100)}% · ${f.plannedKg.toLocaleString('en-US')} kg` }))} />
        </div>
        <div className="card">
          <div className="card-head"><div><h3>{t('chart.statusTitle')}</h3><p>{t('chart.statusNote', { n: plan.shipments.length })}</p></div></div>
          <Donut total={plan.shipments.length} unit={t('chart.shipments')} slices={[
            { key: 'placed', label: t('st.placed'), value: c['Placed automatically'], color: 'var(--ok)' },
            { key: 'missed', label: t('st.missed'), value: c['Placed, promise missed'], color: '#d99a2b' },
            { key: 'needs', label: t('st.needs'), value: c['Needs a person'], color: 'var(--alert)' },
            { key: 'none', label: t('st.none'), value: c['No action needed'], color: '#b9c6c6' },
          ]} />
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>{t('monitor.disrupted')}</h3><p>{t('monitor.disruptedNote')}</p></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('th.flight')}</th><th>{t('th.route')}</th><th>{t('th.sched')}</th><th>{t('th.newDep')}</th><th>{t('th.status')}</th><th className="right">{t('th.booked')}</th><th className="right">{t('th.replan')}</th><th className="right">{t('th.sensitive')}</th></tr>
            </thead>
            <tbody>
              {disrupted.map((d) => (
                <tr key={d.id}>
                  <td className="flightno">{fmtFlight(d.id)}</td>
                  <td className="nowrap">{t('to', { a: d.from, b: d.to })}<span className="sub">{placeName(d.to, locale)}</span></td>
                  <td className="nowrap num">{fmtClock(d.sched, locale)}<span className="sub">{fmtT(d.sched)}</span></td>
                  <td className="nowrap num"><b>{fmtClock(d.dep, locale)}</b><span className="sub">{fmtT(d.dep)}</span></td>
                  <td><Status tone="alert">{modelText(d.status, locale)}</Status><span className="sub">{modelText(d.cause, locale)}</span></td>
                  <td className="right num">{d.booked}</td>
                  <td className="right num"><b>{d.replan}</b></td>
                  <td className="right num">{d.sens}</td>
                </tr>
              ))}
              {conn && connFlight && (
                <tr>
                  <td className="flightno">{fmtFlight(conn.flight)}</td>
                  <td className="nowrap">{t('to', { a: connFlight.origin, b: connFlight.dest })}<span className="sub">{placeName(connFlight.dest, locale)}</span></td>
                  <td className="nowrap num">{fmtClock(connFlight.schedDep, locale)}<span className="sub">{fmtT(connFlight.schedDep)}</span></td>
                  <td className="nowrap num">{fmtClock(connFlight.dep, locale)}<span className="sub">{fmtT(connFlight.dep)}</span></td>
                  <td><Status tone="caution">{t('status.connBreak')}</Status><span className="sub">{t('status.connBreakNote', { flight: fmtFlight(ret.id) })}</span></td>
                  <td className="right num">{conn.shipments}</td>
                  <td className="right num"><b>{conn.needReplan}</b></td>
                  <td className="right num">0</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid--main">
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head"><div><h3><span className="card-icon" style={{ background: 'var(--alert-bg)', color: 'var(--alert)' }}><IconWarn /></span>{t('monitor.attention')}</h3><p>{t('monitor.attentionNote')}</p></div><Status tone="alert">{attention.length}</Status></div>
          <div className="queue">
            {attention.map((s) => (
              <div key={s.awb} className={`queue-item ${s.status === 'Placed, promise missed' ? 'queue-item--caution' : ''}`}>
                <div className="head">
                  <TierChip tier={s.tier} />
                  <Link to={`/shipment/${s.awb}`}>{commodityName(s.commodity, locale)}</Link>
                  <ModelStatusPill status={s.status} />
                  {s.shc.map((code) => <span key={code} className="code">{code}</span>)}
                </div>
                <p className="small muted">{modelText(s.reason, locale)}</p>
                {s.status === 'Placed, promise missed' && <Link to={`/forwarder/${s.awb}`} className="xs">{t('monitor.seeNotice')}</Link>}
              </div>
            ))}
          </div>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="banner">
            <h3>{t('monitor.ranTitle')}</h3>
            <p>{t('monitor.ranBody', { placed, queue: c['Needs a person'] })}</p>
            <div className="progress" style={{ background: 'rgba(255,255,255,0.18)', position: 'relative', zIndex: 1 }}><span style={{ width: `${affected.length ? (placed / affected.length) * 100 : 0}%`, background: '#fff' }} /></div>
            <div className="row" style={{ position: 'relative', zIndex: 1 }}>
              <Link to="/recovery" className="btn btn--light">{t('monitor.open')}</Link>
              <Link to={`/shipment/${CHERRIES}`} className="btn" style={{ color: '#fff' }}><IconCherry />{t('side.cherries')}</Link>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div><h3>{t('chart.tierTitle')}</h3><p>{t('chart.tierNote')}</p></div></div>
            <TierBars rows={TIER_ORDER.map((tier) => ({ tier, value: tierCounts(affected)[tier] }))} />
          </div>
        </div>
      </section>
    </main>
  );
}
