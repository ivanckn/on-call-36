// Where the disruption comes from. The demo runs on a simulated event; HKO and OAG are read live alongside it.
import { useCallback, useEffect, useState } from 'react';
import { readHko, readOagStatus, hkoTriggers, type HkoReading, type Lang, type OagStatus } from '../model/sources';
import { fmtFlight, modelText } from '../model/text';
import { useT } from '../i18n';
import { fmtClock, fmtT } from '../lib/time';
import { useDemo } from '../state/demo';
import { IconCloud, IconPlane, IconRefresh, IconWarn } from './Icons';
import { Status } from './Status';

type Tab = 'scenario' | 'hko' | 'oag';

/** One HKO reading per language per page load, shared by the card and the toast watcher. */
const hkoCache = new Map<Lang, Promise<HkoReading | null>>();
export function useHko() {
  const { locale } = useT();
  const lang: Lang = locale === 'zh' ? 'tc' : 'en';
  const [reading, setReading] = useState<HkoReading | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback((force = false) => {
    if (force || !hkoCache.has(lang)) hkoCache.set(lang, readHko(lang));
    setLoading(true);
    let alive = true;
    hkoCache.get(lang)!.then((r) => { if (alive) { setReading(r); setLoading(false); } });
    return () => { alive = false; };
  }, [lang]);
  useEffect(() => load(), [load]);
  return { reading, loading, refresh: () => load(true) };
}

/** A live HKO warning that would open an incident raises one toast per page load. */
let hkoToasted = false;
export function HkoWatcher() {
  const { reading } = useHko();
  const { dispatch } = useDemo();
  useEffect(() => {
    if (hkoToasted || !reading || reading.cached || !hkoTriggers(reading)) return;
    hkoToasted = true;
    const w = reading.warnings[0];
    dispatch({ type: 'toast', tone: w.impact === 'severe' ? 'alert' : 'caution', key: 'toast.hko', params: { name: w.name } });
  }, [reading, dispatch]);
  return null;
}

const impactTone = { severe: 'alert', high: 'alert', watch: 'caution', info: 'none' } as const;
const fmtWhen = (iso: string, locale: string) => new Date(iso).toLocaleString(locale === 'zh' ? 'zh-HK' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export function SourcesCard() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('scenario');
  return (
    <section className="card" aria-label={t('src.title')}>
      <div className="card-head">
        <div><h2><span className="card-icon"><IconWarn /></span>{t('src.title')}</h2><p>{t('src.intro')}</p></div>
        <div className="segmented" role="group" aria-label={t('src.title')}>
          {(['scenario', 'hko', 'oag'] as Tab[]).map((k) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{t(`src.tab.${k}`)}</button>
          ))}
        </div>
      </div>
      {tab === 'scenario' && <ScenarioSource />}
      {tab === 'hko' && <HkoSource />}
      {tab === 'oag' && <OagSource />}
    </section>
  );
}

function SourceTag({ live }: { live: boolean }) {
  const { t } = useT();
  return <Status tone={live ? 'ok' : 'caution'}>{t(live ? 'src.liveTag' : 'src.simTag')}</Status>;
}

function ScenarioSource() {
  const { state } = useDemo();
  const { t, locale } = useT();
  const sc = state.plan.scenario;
  const trig = sc.flights.find((f) => f.id === sc.ripple.trigger.flight);
  const [open, close] = sc.closure;
  const steps = [
    { at: open, k: 'src.sc.signal', tone: 'alert' },
    { at: open, k: 'src.sc.closed', tone: 'alert' },
    { at: close, k: 'src.sc.reopen', tone: 'ok' },
    { at: close, k: 'src.sc.delay', tone: 'alert', p: { flight: fmtFlight(trig?.id), status: modelText(trig?.status, locale).toLowerCase(), cause: modelText(trig?.cause, locale) } },
    { at: sc.now, k: 'src.sc.engine', tone: 'ok' },
  ];
  return (
    <div className="src-body">
      <div className="src-head"><SourceTag live={false} /><span className="small muted">{t('src.sc.note')}</span></div>
      <ol className="src-steps">
        {steps.map((s, i) => (
          <li key={i} className={`src-step src-step--${s.tone}`}>
            <span className="src-when num">{fmtClock(s.at, locale)}<span className="sub">{fmtT(s.at)}</span></span>
            <span>{t(s.k, s.p)}</span>
          </li>
        ))}
      </ol>
      <p className="xs muted">{t('src.sc.live')}</p>
    </div>
  );
}

function HkoSource() {
  const { t, locale } = useT();
  const { reading, loading, refresh } = useHko();
  const triggers = hkoTriggers(reading);
  return (
    <div className="src-body">
      <div className="src-head">
        <SourceTag live />
        <span className="small muted">{reading ? t(reading.cached ? 'src.hko.cached' : 'src.hko.read', { at: fmtWhen(reading.fetchedAt, locale) }) : loading ? t('src.loading') : t('src.hko.down')}</span>
        <button className="btn btn--secondary btn--small" onClick={refresh} disabled={loading}><IconRefresh />{t('src.refresh')}</button>
      </div>
      {reading && (
        <>
          <div className={`src-verdict ${triggers ? 'src-verdict--alert' : ''}`}>
            <span className="card-icon"><IconCloud /></span>
            <div>
              <b>{triggers ? t('src.hko.would') : reading.warnings.length ? t('src.hko.minor', { n: reading.warnings.length }) : t('src.hko.none')}</b>
              <p className="small muted">{t('src.hko.rule')}</p>
            </div>
          </div>
          {reading.warnings.length > 0 && (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('src.hko.warning')}</th><th>{t('src.hko.impact')}</th><th>{t('src.hko.effect')}</th></tr></thead>
              <tbody>{reading.warnings.map((w) => (
                <tr key={w.group}><td><b>{w.name}</b><span className="sub">{w.code}{w.issued ? ` · ${fmtWhen(w.issued, locale)}` : ''}</span></td>
                  <td><Status tone={impactTone[w.impact]}>{t(`src.impact.${w.impact}`)}</Status></td><td className="small">{t(w.effect)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          <h3 className="src-sub">{t('src.hko.ahead')}</h3>
          <div className="src-days">
            {reading.forecast.map((d) => (
              <div key={d.date} className={`src-day ${d.watch ? 'src-day--watch' : ''}`} title={d.weather}>
                <span className="xs muted">{d.week.slice(0, 3)} {d.date.slice(6, 8)}</span>
                <b className="num">{d.min ?? '—'}–{d.max ?? '—'}°</b>
                <span className="xs">{d.watch ? t('src.hko.watchDay') : t('src.hko.okDay')}</span>
              </div>
            ))}
          </div>
          <p className="xs muted">{t('src.hko.credit')}</p>
        </>
      )}
    </div>
  );
}

function OagSource() {
  const { t, locale } = useT();
  const [res, setRes] = useState<OagStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); readOagStatus().then((r) => { setRes(r); setLoading(false); }); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="src-body">
      <div className="src-head">
        <SourceTag live />
        <span className="small muted">{loading ? t('src.loading') : res?.ok ? t('src.oag.read', { at: fmtWhen(res.fetchedAt, locale), n: res.flights.length, s: res.withStatus }) : ''}</span>
        <button className="btn btn--secondary btn--small" onClick={load} disabled={loading}><IconRefresh />{t('src.refresh')}</button>
      </div>
      {res && !res.ok && <div className="src-verdict src-verdict--caution"><span className="card-icon"><IconPlane /></span><div><b>{t(`src.oag.err.${res.reason}`) }</b><p className="small muted">{t('src.oag.how')}</p></div></div>}
      {res?.ok && (
        <>
          <div className={`src-verdict ${res.incidents.length ? 'src-verdict--alert' : ''}`}>
            <span className="card-icon"><IconPlane /></span>
            <div>
              <b>{res.incidents.length ? t('src.oag.would', { list: res.incidents.map(fmtFlight).join(', ') }) : res.withStatus ? t('src.oag.none') : t('src.oag.noStatus')}</b>
              <p className="small muted">{t('src.oag.rule', { m: res.incidentMinutes })}</p>
            </div>
          </div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('th.flight')}</th><th>{t('th.route')}</th><th>{t('th.sched')}</th><th>{t('src.oag.state')}</th><th className="right">{t('src.oag.delay')}</th></tr></thead>
            <tbody>{res.flights.map((f) => (
              <tr key={f.flight + f.schedLocal}>
                <td className="flightno">{fmtFlight(f.flight)}<span className="sub">{f.aircraft}{f.freighter ? ` · ${t('src.oag.frt')}` : ''}</span></td>
                <td className="nowrap">{t('to', { a: f.origin, b: f.dest })}</td>
                <td className="nowrap num">{f.schedLocal.slice(11)}</td>
                <td>{f.hasStatus ? (f.state ?? '—') : <span className="muted">{t('src.oag.noStatusRow')}</span>}</td>
                <td className="right num">{f.delayMinutes === null ? '—' : <b className={f.delayMinutes >= res.incidentMinutes ? 'alert' : ''}>{f.delayMinutes > 0 ? '+' : ''}{f.delayMinutes} {t('src.oag.min')}</b>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}
