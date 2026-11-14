// Shipment: journey, what failed, the decision and its reason, both costs and the critical ratio, and every alternative.
import { Link, useParams } from 'react-router-dom';
import { IconBox, IconBuilding, IconCalendar, IconCherry, IconPhone, IconRoute, IconScale, IconTag, IconThermo } from '../components/Icons';
import { JourneyStrip, type Leg } from '../components/JourneyStrip';
import { KindChip, ModelStatusPill, Status, TierChip } from '../components/Status';
import { RegPill, RegulatoryCard, RiskCard } from '../components/Explain';
import { displacedFrom, flightMap, isMoved, isNotified } from '../model/plan';
import { commodityName, fmtFlight, modelText, placeName, ruleText } from '../model/text';
import { useT } from '../i18n';
import { fmtBoth, fmtClock, fmtHours, fmtKgNum, fmtT } from '../lib/time';
import { useDemo } from '../state/demo';

export function Shipment() {
  const { awb = '' } = useParams();
  const { state, run, canRun } = useDemo();
  const { t, locale } = useT();
  const plan = state.plan;
  const s = plan.shipments.find((x) => x.awb === awb);
  if (!s) {
    return (
      <main className="page">
        <h1>{t('ship.notFound')}</h1>
        <p style={{ marginTop: 16 }}><Link to="/recovery">{t('ship.back')}</Link></p>
      </main>
    );
  }
  const fl = flightMap(plan);
  const booked = s.booked ? fl[s.booked] : undefined;
  const assigned = s.assigned ? fl[s.assigned] : undefined;
  const ret = plan.scenario.returnFlight;
  const held = !!s.assigned && state.holds.includes(s.assigned);
  const notified = isNotified(s, state.holds);
  const kindLabel = (k: 'PAX' | 'FRT') => t(k === 'FRT' ? 'col.freighter' : 'col.passenger');

  // Journey: inbound leg (if any), the booked leg, and the new leg.
  const inbound: Leg | null = s.origin === 'PVG'
    ? { from: 'PVG', to: 'HKG', flight: ret.id, dep: ret.dep, arr: ret.arr, kindLabel: kindLabel('PAX'), state: 'delayed', text: `${modelText(ret.status, locale)} · ${modelText(ret.cause, locale)}` }
    : s.origin !== 'HKG'
      ? { from: s.origin, to: 'HKG', flight: null, dep: null, arr: s.ready - plan.scenario.minTransferHours, kindLabel: '', state: 'ok', text: t('journey.inboundOk') }
      : null;
  const bookedLeg: Leg | null = booked
    ? { from: 'HKG', to: booked.dest, flight: booked.id, dep: booked.dep, arr: booked.arr, kindLabel: kindLabel(booked.kind),
        state: booked.dep < s.ready ? 'missed' : booked.status !== 'On time' ? 'delayed' : 'ok',
        text: booked.dep < s.ready ? t('journey.missed', { ready: fmtT(s.ready) }) : booked.status !== 'On time' ? `${modelText(booked.status, locale)} · ${modelText(booked.cause, locale)}` : t('journey.onTime') }
    : null;
  const newLeg: Leg | null = assigned && assigned.id !== s.booked
    ? { from: 'HKG', to: assigned.dest, flight: assigned.id, dep: assigned.dep, arr: assigned.arr, kindLabel: kindLabel(assigned.kind), state: 'new', text: t('journey.new') }
    : null;
  const bookedLegs = [inbound, bookedLeg].filter(Boolean) as Leg[];
  const madeRoom = s.assigned && s.kind === 'RECOVERY' && isMoved(s) ? displacedFrom(plan, s.assigned) : [];
  const ratio = s.criticalRatio;

  return (
    <main className="page">
      <section className="card hero">
        <span className="hero-icon">{s.shc.includes('PER') ? <IconCherry /> : <IconBox />}</span>
        <div>
          <div className="crumb"><Link to="/recovery">{t('nav.recovery')}</Link> / {t('ship.crumb')}</div>
          <h1>{commodityName(s.commodity, locale)}</h1>
          <div className="chips">
            <TierChip tier={s.tier} />
            <KindChip kind={s.kind} />
            {s.shc.map((c) => <span key={c} className="code">{c}</span>)}
            <span>AWB {s.awb}</span>
          </div>
        </div>
        <div className="actions">
          <ModelStatusPill status={s.status} held={held} />
          {notified && <Status tone="ok">{t('status.notified')}</Status>}
          {s.status !== 'No action needed' && <Link to={`/forwarder/${s.awb}`} className="btn btn--primary"><IconPhone />{t('ship.forwarderView')}</Link>}
        </div>
      </section>

      <section className="grid grid--3" aria-label="Facts">
        <div className="card fact">
          <h3><span className="card-icon"><IconBox /></span>{t('ship.card')}</h3>
          <div className="meta">
            <div className="meta-row"><IconScale /><span>{fmtKgNum(s.kg)} kg{s.mainDeck ? ` · ${t('ship.mainDeck')}` : ''}{s.cool ? ` · ${t('ship.cool')}` : ''}</span></div>
            <div className="meta-row"><IconTag /><span>{s.tier} · {s.shc.join(' ') || t('ship.noShc')}<span className="muted">{t(`kind.${s.kind}.note`)}</span></span></div>
            <div className="meta-row"><IconBuilding /><span>{s.forwarder}</span></div>
          </div>
        </div>
        <div className="card fact">
          <h3><span className="card-icon" style={{ background: 'var(--sky)', color: 'var(--sky-ink)' }}><IconRoute /></span>{t('ship.journey')}</h3>
          <div className="meta">
            <div className="meta-row"><IconRoute /><span>{t('to', { a: placeName(s.origin, locale), b: placeName(s.dest, locale) })}<span className="muted">{modelText(s.note, locale)}</span></span></div>
            <div className="meta-row"><IconCalendar /><span>{t('ship.ready', { t: fmtBoth(s.ready, locale) })}</span></div>
          </div>
        </div>
        <div className="card fact">
          <h3><span className="card-icon" style={{ background: 'var(--sand)', color: 'var(--sand-ink)' }}><IconCalendar /></span>{t('ship.promise')}</h3>
          <div className="meta">
            <div className="meta-row"><IconCalendar /><span>{t('ship.deliverBy', { t: fmtBoth(s.promise, locale) })}{assigned && <span className="muted">{assigned.arr <= s.promise ? t('ship.kept', { h: fmtHours(s.promise - assigned.arr) }) : t('ship.missedBy', { h: fmtHours(assigned.arr - s.promise) })}</span>}</span></div>
            {s.shelf !== null && <div className="meta-row"><IconThermo /><span>{t('ship.shelf', { t: fmtBoth(s.shelf, locale) })}{assigned && <span className="muted">{assigned.arr <= s.shelf ? t('ship.shelfLeft', { h: fmtHours(s.shelf - assigned.arr) }) : t('ship.shelfOver')}</span>}</span></div>}
            {s.latestDep !== null && <div className="meta-row"><IconThermo /><span>{t('ship.latestDep', { t: fmtBoth(s.latestDep, locale) })}</span></div>}
          </div>
        </div>
      </section>

      <section className="card" aria-label={t('ship.bookedJourney')}>
        <div className="card-head"><h2>{t('ship.bookedJourney')}</h2><span className="muted small">{t('ship.mtt', { h: plan.scenario.minTransferHours })}</span></div>
        {bookedLegs.length > 0 ? <JourneyStrip legs={bookedLegs} /> : <p className="empty">{t('ship.noBooking')}</p>}
        {newLeg && (
          <>
            <div className="card-head" style={{ marginTop: 28 }}><h2 className="green">{t('ship.newItin')}</h2>{assigned && <Status tone={assigned.arr <= s.promise ? 'ok' : 'caution'}>{t('ship.arrives', { t: fmtBoth(assigned.arr, locale) })}</Status>}</div>
            <JourneyStrip legs={[newLeg]} />
          </>
        )}
      </section>

      <section className="decision" aria-label={t('ship.decision')}>
        <div className="card">
          <div className="card-head"><h2>{t('ship.decision')}</h2></div>
          <div className="stack">
            <p className={`reason-box ${s.status === 'Needs a person' ? 'reason-box--alert' : s.status === 'Placed, promise missed' ? 'reason-box--caution' : ''}`}>{modelText(s.reason, locale)}</p>
            {madeRoom.length > 0 && (
              <p className="small">{t('ship.madeRoom', { flight: fmtFlight(s.assigned), list: madeRoom.map((x) => `${commodityName(x.commodity, locale)} (${x.tier}, ${t('ship.to')} ${fmtFlight(x.assigned)})`).join(locale === 'zh' ? '、' : ', ') })}</p>
            )}
            {s.kind === 'BAU' && isMoved(s) && <p className="small">{t('ship.bauMoved')}</p>}
            {s.status === 'Placed, promise missed' && <p className="small caution">{t('ship.missedNote')}</p>}
            {held && <p className="caution small">{t('ship.heldNote')}</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>{t('ship.numbers')}</h2></div>
          {ratio !== undefined && s.underbookingCost !== undefined && s.overbookingCost !== undefined ? (
            <>
              <dl className="kv">
                <dt>{t('ship.fit')}</dt><dd className="big">{Math.round(s.fitProbability * 100)}%</dd>
                <dt>{t('ship.ratio')}</dt><dd>{Math.round(ratio * 100)}% <span className="muted small">= Co / (Cu + Co)</span></dd>
              </dl>
              <p className="small" style={{ marginTop: 8 }}>{t('ship.ratioLine')}</p>
              <div className="costbar" style={{ marginTop: 18 }}>
                <CostRow label={t('ship.cu')} value={s.underbookingCost} max={Math.max(s.underbookingCost, s.overbookingCost)} tone="cu" />
                <CostRow label={t('ship.co')} value={s.overbookingCost} max={Math.max(s.underbookingCost, s.overbookingCost)} tone="co" />
              </div>
              <p className="small muted" style={{ marginTop: 14 }}>{t('ship.costNote')}</p>
            </>
          ) : (
            <p className="empty">{t(s.status === 'Needs a person' ? 'ship.noCostQueue' : 'ship.noCost')}</p>
          )}
        </div>
      </section>

      <section className="grid grid--2" aria-label={t('reg.title')}>
        <RegulatoryCard s={s} />
        <RiskCard s={s} />
      </section>

      <section className="card" aria-label={t('ship.alts')}>
        <div className="card-head"><div><h2>{t('ship.alts')}</h2><p>{t('ship.altsNote')}</p></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('th.flight')}</th><th>{t('th.departure')}</th><th>{t('th.arrival')}</th><th>{t('th.aircraft')}</th><th>{t('reg.status')}</th><th>{t('th.outcome')}</th><th>{t('th.why')}</th><th className="right">{t('th.costIndex')}</th><th /></tr></thead>
            <tbody>
              {s.alternatives.map((a) => {
                const f = fl[a.flight];
                const ok = canRun({ forced: { [s.awb]: a.flight } });
                return (
                  <tr key={a.flight} className={a.chosen ? 'is-chosen' : ''}>
                    <td className="flightno">{fmtFlight(a.flight)}</td>
                    <td className="nowrap num">{f ? fmtClock(f.dep, locale) : '—'}<span className="sub">{f ? fmtT(f.dep) : ''}</span></td>
                    <td className="nowrap num">{fmtClock(a.arr, locale)}<span className="sub">{a.arr <= s.promise ? t('alt.inside') : t('alt.late', { h: fmtHours(a.arr - s.promise) })}</span></td>
                    <td>{f ? kindLabel(f.kind) : ''}</td>
                    <td><RegPill reg={a.regulatory} /></td>
                    <td>{a.chosen ? <Status tone="ok">{t('alt.chosen')}</Status> : a.eligible ? <Status tone="none">{t('alt.eligible')}</Status> : <Status tone="alert">{t('alt.blocked')}</Status>}</td>
                    <td className="reason">{a.eligible ? (a.chosen ? t('alt.chosenWhy') : t('alt.costlier')) : ruleText(a.reason, locale)}</td>
                    <td className="right num">{a.costIndex === null ? '—' : a.costIndex.toLocaleString('en-US')}</td>
                    <td className="right">{!a.chosen && a.eligible && (
                      <button className="linkbtn" disabled={state.solving || !ok} title={ok ? '' : t('col.needsLive')}
                        onClick={() => run({ forced: { [s.awb]: a.flight } }, `Moved ${s.commodity} ${s.awb} to ${fmtFlight(a.flight)} by hand.`)}>{t('alt.try')}</button>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(state.blocked || state.diff) && !state.solving && <p className="small" style={{ marginTop: 12 }}><Link to="/recovery">{t('alt.seeResult')}</Link></p>}
      </section>
    </main>
  );
}

function CostRow({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'cu' | 'co' }) {
  return (
    <div className="costbar-row">
      <span>{label}</span>
      <div className="costbar-track"><div className={`costbar-fill ${tone === 'co' ? 'costbar-fill--co' : ''}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} /></div>
      <span className="right num">{value.toLocaleString('en-US')}</span>
    </div>
  );
}
