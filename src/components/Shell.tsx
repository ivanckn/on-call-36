// App shell: left sidebar and a sticky top bar. Every page except the forwarder phone sits inside it.
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BATTERIES, CHERRIES, GARMENTS, baseScenario } from '../model/data';
import { commodityName } from '../model/text';
import { useT } from '../i18n';
import { fmtClock, fmtT } from '../lib/time';
import { useDemo } from '../state/demo';
import { IconCherry, IconGlobe, IconGrid, IconLayers, IconPhone, IconRefresh, IconSearch, IconBox, IconWarn } from './Icons';
import { Status } from './Status';
import { IncidentBanner, IncidentDialog, Toasts } from './Alerts';
import { HkoWatcher } from './Sources';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <IncidentBanner />
        {children}
      </div>
      <IncidentDialog />
      <Toasts />
      <HkoWatcher />
    </div>
  );
}

function Sidebar() {
  const { t } = useT();
  const { state, dispatch } = useDemo();
  const queue = state.plan.shipments.filter((s) => s.status === 'Needs a person' || s.status === 'Placed, promise missed').length;
  return (
    <aside className="sidebar" aria-label="Navigation">
      <NavLink to="/" className="logo">
        <span className="logo-mark" aria-hidden>36</span>
        <span>
          <span className="logo-name" style={{ display: 'block' }}>On Call 36</span>
          <span className="logo-sub">{t('side.product')}</span>
        </span>
      </NavLink>
      <p className="tagline">{t('app.tagline')}</p>
      <nav className="side-group">
        <div className="side-label">{t('side.menu')}</div>
        <NavLink to="/" end className="side-link"><IconGrid />{t('nav.monitor')}</NavLink>
        <NavLink to="/recovery" className="side-link"><IconLayers />{t('nav.recovery')}{queue > 0 && <span className="count" title={t('side.attention')}>{queue}</span>}</NavLink>
      </nav>
      <nav className="side-group">
        <div className="side-label">{t('side.demo')}</div>
        <NavLink to={`/shipment/${CHERRIES}`} className="side-link"><IconCherry />{t('side.cherries')}</NavLink>
        <NavLink to={`/shipment/${GARMENTS}`} className="side-link"><IconBox />{t('side.garments')}</NavLink>
        <NavLink to={`/shipment/${BATTERIES}`} className="side-link"><IconWarn />{t('side.batteries')}</NavLink>
        <NavLink to={`/forwarder/${CHERRIES}`} className="side-link"><IconPhone />{t('side.forwarder')}</NavLink>
      </nav>
      <div className="side-foot">
        <div className="side-card">
          <h3>{t('side.simTitle')}</h3>
          <ul>
            <li>{t('side.sim1')}</li>
            <li>{t('side.sim2')}</li>
            <li>{t('side.sim3')}</li>
          </ul>
          <p>{t('app.note')}</p>
        </div>
        <button className="side-link" onClick={() => dispatch({ type: 'reset' })}><IconRefresh />{t('nav.reset')}</button>
      </div>
    </aside>
  );
}

export function ServiceBadge() {
  const { t } = useT();
  const { state } = useDemo();
  if (state.mode === 'checking') return <Status tone="none">{t('mode.checking')}</Status>;
  return state.mode === 'live'
    ? <span title={t('mode.liveNote')}><Status tone="ok">{t('mode.live')}</Status></span>
    : <span title={t('mode.offlineNote')}><Status tone="caution">{t('mode.offline')}</Status></span>;
}

function Topbar() {
  const { t, locale } = useT();
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [miss, setMiss] = useState(false);
  const ships = state.plan.shipments;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = q.trim();
    if (!raw) return;
    const needle = raw.toLowerCase().replace(/[\s-]/g, '');
    const hit = ships.find((s) => s.awb.replace('-', '').includes(needle))
      ?? ships.find((s) => s.commodity.toLowerCase().includes(raw.toLowerCase()) || commodityName(s.commodity, 'zh').includes(raw));
    if (hit) { setMiss(false); setQ(''); navigate(`/shipment/${hit.awb}`); } else setMiss(true);
  };

  return (
    <header className="topbar">
      <form className="search" onSubmit={submit} role="search">
        <IconSearch />
        <input value={q} onChange={(e) => { setQ(e.target.value); setMiss(false); }} placeholder={t('top.search')} aria-label={t('top.search')} list="awb-list" />
        <datalist id="awb-list">
          {ships.map((s) => <option key={s.awb} value={s.awb}>{commodityName(s.commodity, locale)}</option>)}
        </datalist>
        {miss && <span className="search-hint">{t('top.noMatch')}</span>}
      </form>
      <div className="spacer" />
      <ServiceBadge />
      <div className="clock">
        <span>{t('top.phase')}</span>
        <b>{fmtClock(baseScenario.now, locale)} · {fmtT(baseScenario.now)}</b>
      </div>
      <button className="pill-btn" onClick={() => dispatch({ type: 'setLocale', locale: locale === 'en' ? 'zh' : 'en' })}><IconGlobe />{t('nav.lang')}</button>
      <div className="user">
        <span className="avatar" aria-hidden>HK</span>
        <span className="user-text"><b>{t('top.desk')}</b><span>{t('top.hub')}</span></span>
      </div>
    </header>
  );
}
