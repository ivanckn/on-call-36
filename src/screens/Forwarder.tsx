// Forwarder: phone frame. What changed, why, the new flights, the hand over deadline, Accept.
import { Link, useParams } from 'react-router-dom';
import { IconCheck } from '../components/Icons';
import { flightMap, isMoved } from '../model/plan';
import { commodityName, fmtFlight, modelText, placeName } from '../model/text';
import { useT } from '../i18n';
import { fmtClock, fmtKgNum } from '../lib/time';
import { useDemo } from '../state/demo';

export function Forwarder() {
  const { awb = '' } = useParams();
  const { state } = useDemo();
  const { t, locale } = useT();
  const plan = state.plan;
  const s = plan.shipments.find((x) => x.awb === awb);
  if (!s) {
    return <div className="phone-wrap"><section className="phone"><div className="phone-body"><h1>{t('fwd.noShipment')}</h1><p className="muted">AWB {awb}</p><Link to="/">{t('nav.monitor')}</Link></div></section></div>;
  }
  const fl = flightMap(plan);
  const f = s.assigned ? fl[s.assigned] : undefined;
  const booked = s.booked ? fl[s.booked] : undefined;
  const held = !!s.assigned && state.holds.includes(s.assigned);
  const late = s.status === 'Placed, promise missed';
  const placed = (s.status === 'Placed automatically' || late) && !held;
  const title = held ? t('fwd.title.held') : s.status === 'Needs a person' ? t('fwd.title.decision') : late ? t('fwd.title.late')
    : s.kind === 'BAU' && isMoved(s) ? t('fwd.title.moved') : isMoved(s) ? t('fwd.title.rebooked') : t('fwd.title.none');
  const noteMentionsBooked = !!booked && s.note.includes(booked.id);
  const bookedLine = booked && booked.status !== 'On time' && !noteMentionsBooked ? `${fmtFlight(booked.id)}: ${modelText(booked.status, locale).toLowerCase()}.` : '';
  const what = [modelText(s.note, locale), bookedLine].filter(Boolean).join(' ');

  return (
    <div className="phone-wrap">
      <section className="phone" aria-label="Forwarder notice" lang={locale === 'zh' ? 'zh-Hant' : 'en'}>
        <div className={`phone-head ${late ? 'phone-head--late' : ''}`}>
          <div className="xs">{t('fwd.kicker')}</div>
          <h1>{title}</h1>
        </div>
        <div className="phone-body">
          <dl className="kv">
            <dt>{t('fwd.awb')}</dt><dd className="big">{s.awb}</dd>
            <dt>{t('fwd.shipment')}</dt><dd>{commodityName(s.commodity, locale)} · {fmtKgNum(s.kg)} kg · {s.tier}{s.shc.length ? ` · ${s.shc.join(' ')}` : ''}</dd>
            {what && <><dt>{t('fwd.changed')}</dt><dd>{what}</dd></>}
            <dt>{t('fwd.why')}</dt><dd className="small">{modelText(s.reason, locale)}</dd>
            {placed && f && (
              <>
                <dt>{t('fwd.newFlight')}</dt>
                <dd><div className="phone-flight"><b>{fmtFlight(f.id)} · {t('to', { a: f.origin, b: f.dest })}</b>{fmtClock(f.dep, locale)} → {fmtClock(f.arr, locale)}</div></dd>
                <dt>{t('fwd.newArrival')}</dt><dd className="big">{placeName(s.dest, locale)} · {fmtClock(f.arr, locale)}</dd>
                <dt>{t('fwd.handOver')}</dt><dd>{t('fwd.inCare')}<span className="xs muted" style={{ display: 'block' }}>{t('fwd.inCareNote')}</span></dd>
              </>
            )}
            {s.status === 'Needs a person' && <><dt>{t('fwd.next')}</dt><dd className="small">{t('fwd.contact')}</dd></>}
            {held && <><dt>{t('fwd.next')}</dt><dd className="small">{t('fwd.heldNote')}</dd></>}
          </dl>

          {!held && s.status !== 'No action needed' && (
            <p className="sent"><IconCheck />{t('fwd.sent', { t: fmtClock(plan.scenario.now, locale) })}</p>
          )}
          {placed && f && (
            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>{t('fwd.consigneePreview')}</div>
              <div className="notice-box">{t(late ? 'fwd.consigneeLate' : 'fwd.consigneeMsg', { name: commodityName(s.commodity, locale), awb: s.awb, city: placeName(s.dest, locale), t: fmtClock(f.arr, locale), flight: fmtFlight(f.id), forwarder: s.forwarder })}</div>
            </div>
          )}

          <div className="phone-foot">
            <div>{t('fwd.foot')}</div>
            <div><Link to={`/shipment/${awb}`}>{t('fwd.linkShipment')}</Link> · <Link to="/recovery">{t('fwd.linkRecovery')}</Link></div>
          </div>
        </div>
      </section>
    </div>
  );
}
