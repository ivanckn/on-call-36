// Disruption alerts: a dialog that must be acknowledged, a banner on every page, and toasts for new exceptions.
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backlog } from '../model/data';
import { counts, isAffected } from '../model/plan';
import { commodityName, fmtFlight, modelText, placeName } from '../model/text';
import { useT } from '../i18n';
import { fmtClock, fmtLocal, toDate } from '../lib/time';
import { useDemo, type Toast } from '../state/demo';
import { IconWarn } from './Icons';

function useIncident() {
  const { state } = useDemo();
  const { t, locale } = useT();
  const plan = state.plan;
  const sc = plan.scenario;
  const trig = sc.flights.find((f) => f.id === sc.ripple.trigger.flight);
  const c = counts(plan);
  const affected = plan.shipments.filter(isAffected).length;
  const sensitive = plan.shipments.filter((s) => isAffected(s) && s.shc.some((x) => ['PER', 'COL', 'AVI', 'PIL'].includes(x))).length;
  const p50 = backlog.overall.p50;
  const normal = p50 === null ? '—' : (() => { const d = toDate(p50); return locale === 'zh' ? `${d.getMonth() + 1}月${d.getDate()}日` : `${fmtClock(p50, locale).split(' ')[0]} ${d.getDate()} Nov`; })();
  return {
    title: t('alert.title', { flight: fmtFlight(trig?.id), from: placeName(trig?.origin ?? '', locale), to: placeName(trig?.dest ?? '', locale), status: modelText(trig?.status, locale).toLowerCase() }),
    cause: modelText(sc.ripple.trigger.cause, locale),
    facts: [
      { v: affected, k: 'alert.affected', tone: '' },
      { v: c['Needs a person'], k: 'alert.needs', tone: 'alert' },
      { v: c['Placed, promise missed'], k: 'alert.late', tone: 'caution' },
      { v: sensitive, k: 'alert.sensitive', tone: '' },
    ],
    chain: sc.ripple.chain,
    normal,
    severe: c['Needs a person'] > 0,
  };
}

export function IncidentDialog() {
  const { state, dispatch } = useDemo();
  const { t, locale } = useT();
  const navigate = useNavigate();
  const inc = useIncident();
  if (state.alertAck) return null;
  const ack = (go?: string) => { dispatch({ type: 'ack' }); if (go) navigate(go); };
  return (
    <>
      <div className="alert-backdrop" />
      <div className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
        <div className="alert-dialog-head">
          <span className="alert-icon"><IconWarn /></span>
          <div>
            <div className="alert-kicker"><span className="pulse" />{t('alert.kicker')}</div>
            <h2 id="alert-title">{inc.title}</h2>
            <p>{inc.cause}</p>
          </div>
        </div>
        <div className="alert-facts">
          {inc.facts.map((f) => (
            <div key={f.k} className={`alert-fact ${f.tone ? `alert-fact--${f.tone}` : ''}`}><b>{f.v}</b><span>{t(f.k)}</span></div>
          ))}
        </div>
        <div className="alert-chain">
          {inc.chain.map((l, i) => (
            <div key={i} className="alert-link">
              <span className="xs muted">{modelText(l.label, locale)}</span>
              <b>{fmtFlight(l.flight)}</b>
              <span className="xs">{t('alert.chain', { n: l.shipments, r: l.needReplan })}</span>
            </div>
          ))}
        </div>
        <p className="small">{t('alert.auto', { normal: inc.normal })}</p>
        <p className="xs muted">{t('alert.source')} {t('alert.sim')}</p>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={() => ack()}>{t('alert.ack')}</button>
          <button className="btn btn--danger" onClick={() => ack('/recovery')} autoFocus>{t('alert.ackOpen')}</button>
        </div>
      </div>
    </>
  );
}

export function IncidentBanner() {
  const { state, dispatch } = useDemo();
  const { t } = useT();
  const inc = useIncident();
  const acked = !!state.alertAck;
  return (
    <div className={`incident ${acked ? 'incident--acked' : ''} ${inc.severe ? '' : 'incident--caution'}`} role="alert">
      <span className="incident-icon"><IconWarn /></span>
      <div className="incident-text">
        <b>{inc.title}</b>
        <span>
          {inc.facts.slice(0, 3).map((f) => <span key={f.k} className="incident-fact">{f.v} {t(f.k)}</span>)}
          <span className="incident-fact">{t('alert.normal', { normal: inc.normal })}</span>
        </span>
      </div>
      <div className="incident-actions">
        <Link to="/recovery#queue" className="incident-link">{t('alert.queue')}</Link>
        <Link to="/recovery" className="incident-link">{t('monitor.open')}</Link>
        {acked
          ? <span className="incident-ack">{t('alert.acked', { t: fmtLocal(state.alertAck!) })}</span>
          : <button className="btn btn--small btn--light" onClick={() => dispatch({ type: 'ack' })}>{t('alert.ack')}</button>}
      </div>
    </div>
  );
}

function ToastItem({ x }: { x: Toast }) {
  const { dispatch } = useDemo();
  const { t, locale } = useT();
  useEffect(() => {
    const id = setTimeout(() => dispatch({ type: 'dismissToast', id: x.id }), x.tone === 'ok' ? 6000 : 12000);
    return () => clearTimeout(id);
  }, [x.id, x.tone, dispatch]);
  const params = { ...x.params, name: commodityName(String(x.params.name ?? ''), locale), flight: fmtFlight(String(x.params.flight ?? '')), reason: modelText(String(x.params.reason ?? ''), locale) };
  return (
    <div className={`toast toast--${x.tone}`} role="status">
      <span className="dot" />
      <div>
        <b>{t(`${x.key}.title`, params)}</b>
        <p>{t(`${x.key}.body`, params)}</p>
        {x.awb && <Link to={`/shipment/${x.awb}`} className="xs">{t('toast.open')}</Link>}
      </div>
      <button className="toast-x" aria-label={t('drawer.close')} onClick={() => dispatch({ type: 'dismissToast', id: x.id })}>×</button>
    </div>
  );
}

export function Toasts() {
  const { state } = useDemo();
  return <div className="toasts" aria-live="polite">{state.toasts.map((x) => <ToastItem key={x.id} x={x} />)}</div>;
}
