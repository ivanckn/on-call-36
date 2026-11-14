// Recovery: the allocation board with live controls, the override panel, batches, the queue, and with and without.
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { BandLegend, CapacityBand } from '../components/CapacityBand';
import { ModelCardDrawer, ShapDrawer } from '../components/Drawers';
import { IconArrow, IconBox, IconCheck, IconClock, IconCompare, IconInfo, IconLayers, IconPerson, IconWarn } from '../components/Icons';
import { LivePanel } from '../components/LivePanel';
import { KindChip, ModelStatusPill, Status, TierChip } from '../components/Status';
import { WhatIfPanel } from '../components/WhatIfPanel';
import { WithWithout } from '../components/WithWithout';
import { counts, delayOf, displacedFrom, flightsInOrder, freedFrom, isAffected, isMoved, isNotified, onFlight, shipmentMap } from '../model/plan';
import { commodityName, fmtFlight, modelText, placeName, ruleText } from '../model/text';
import type { Flight, Plan, Shipment } from '../model/types';
import { useT } from '../i18n';
import { fmtClock, fmtKgNum, fmtLocal, fmtT } from '../lib/time';
import { useDemo } from '../state/demo';

export function Recovery() {
  const { state, dispatch } = useDemo();
  const { t, locale } = useT();
  const plan = state.plan;
  const [drawer, setDrawer] = useState<'model' | Flight | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#queue') setTimeout(() => document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [hash]);
  const c = counts(plan);
  const affected = plan.shipments.filter(isAffected);
  const placedPct = affected.length ? Math.round((c['Placed automatically'] / affected.length) * 100) : 0;
  const notified = plan.shipments.filter((s) => isNotified(s, state.holds)).length;
  const heldCount = plan.shipments.filter((s) => s.status !== 'No action needed' && !isNotified(s, state.holds)).length;
  const flights = flightsInOrder(plan);
  const held = new Set(state.holds);
  const attention = plan.shipments.filter((s) => s.status === 'Placed, promise missed' || s.status === 'Needs a person');

  const batches = flights.map((f) => ({ f, items: plan.shipments.filter((s) => s.assigned === f.id && isMoved(s)) })).filter((b) => b.items.length > 0);
  const autoLog = useMemo(() => plan.shipments.filter((s) => isMoved(s) || s.status === 'Needs a person')
    .map((s) => ({ awb: s.awb, text: `${commodityName(s.commodity, locale)} ${s.awb}: ${modelText(s.reason, locale)}` })), [plan, locale]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t('recovery.title')}</h1>
          <p>{t('recovery.intro')}</p>
        </div>
        <div className="actions">
          <button className="btn btn--secondary" onClick={() => setDrawer('model')}><IconInfo />{t('recovery.modelCard')}</button>
          <button className="btn btn--primary" onClick={() => setShowCompare((v) => !v)}><IconCompare />{t(showCompare ? 'recovery.compareHide' : 'recovery.compare')}</button>
        </div>
      </div>

      <section className="grid grid--4" aria-label="Progress">
        <div className="kpi kpi--sky">
          <div className="kpi-top"><span className="kpi-label">{t('recovery.affected')}</span><span className="kpi-icon"><IconBox /></span></div>
          <div className="kpi-value">{affected.length}</div>
          <div className="kpi-sub">{t('recovery.affectedSub', { n: plan.shipments.length })}</div>
        </div>
        <div className="kpi kpi--solid">
          <div className="kpi-top"><span className="kpi-label">{t('recovery.placedAuto')}</span><span className="kpi-icon"><IconCheck /></span></div>
          <div className="kpi-value">{c['Placed automatically']}</div>
          <div className="progress"><span style={{ width: `${placedPct}%` }} /></div>
          <div className="kpi-sub">{t('recovery.placedSub', { pct: placedPct, missed: c['Placed, promise missed'] })}</div>
        </div>
        <div className="kpi kpi--rose">
          <div className="kpi-top"><span className="kpi-label">{t('recovery.needsPerson')}</span><span className="kpi-icon"><IconWarn /></span></div>
          <div className="kpi-value">{c['Needs a person']}</div>
          <div className="kpi-sub">{t('recovery.needsSub')}</div>
        </div>
        <div className="kpi kpi--violet">
          <div className="kpi-top"><span className="kpi-label">{t('recovery.notified')}</span><span className="kpi-icon"><IconPerson /></span></div>
          <div className="kpi-value">{notified}</div>
          <div className="kpi-sub">{t('recovery.notifiedSub')}{heldCount > 0 ? ` · ${t('recovery.notifiedHeld', { n: heldCount })}` : ''}</div>
        </div>
      </section>

      {showCompare && <WithWithout />}

      <LivePanel />

      <section className="card" aria-label={t('recovery.board')} style={{ paddingRight: 8 }}>
        <div className="card-head" style={{ paddingRight: 16 }}>
          <div><h2><span className="card-icon"><IconLayers /></span>{t('recovery.board')}</h2><p>{t('recovery.boardNote')}</p></div>
          <BandLegend />
        </div>
        <div className={`board board--well ${state.solving ? 'board--solving' : ''}`}>
          {flights.map((f) => (
            <FlightColumn key={f.id} f={f} plan={plan} held={held.has(f.id)} onShap={() => setDrawer(f)} />
          ))}
        </div>
        <p className="xs muted" style={{ padding: '10px 16px 0 0' }}>{t('recovery.dragHint')}</p>
      </section>

      <WhatIfPanel />

      <section className="grid grid--main" aria-label="Batches and queue">
        <div className="card">
          <div className="card-head"><div><h2>{t('batches.title')}</h2><p>{t('batches.note')}</p></div></div>
          <p className="policy-note">{t('batches.policy')}</p>
          {batches.map(({ f, items }) => {
            const isHeld = held.has(f.id);
            return (
              <div key={f.id} className="batch">
                <span className={`batch-badge ${isHeld ? 'batch-badge--held' : ''}`}>{items.length}</span>
                <div>
                  <div className="batch-title">
                    <h3>{fmtFlight(f.id)}</h3>
                    {isHeld ? <Status tone="caution">{t('batches.heldStatus')}</Status> : <Status tone="ok">{t('batches.released')}</Status>}
                  </div>
                  <div className="batch-meta">{t('batches.meta', { n: items.length, kg: fmtKgNum(items.reduce((s, x) => s + x.kg, 0)), t: fmtClock(f.dep, locale) })} · {t('to', { a: f.origin, b: f.dest })}</div>
                </div>
                <div className="batch-actions">
                  <button className="linkbtn" onClick={() => setReview(review === f.id ? null : f.id)}>{t(review === f.id ? 'batches.closeReview' : 'batches.review')}</button>
                  {isHeld
                    ? <button className="linkbtn" onClick={() => dispatch({ type: 'release', flight: fmtFlight(f.id) })}>{t('batches.release')}</button>
                    : <button className="linkbtn" onClick={() => dispatch({ type: 'hold', flight: f.id })}>{t('batches.hold')}</button>}
                </div>
                {review === f.id && (
                  <div className="batch-list table-wrap">
                    <table className="table table--compact">
                      <thead><tr><th>{t('th.shipment')}</th><th>{t('th.from')}</th><th className="right">{t('th.kg')}</th><th className="right">{t('th.fit')}</th><th>{t('th.reason')}</th></tr></thead>
                      <tbody>
                        {items.map((s) => (
                          <tr key={s.awb}>
                            <td><TierChip tier={s.tier} /> <Link to={`/shipment/${s.awb}`}>{commodityName(s.commodity, locale)}</Link><span className="sub">{s.awb}</span></td>
                            <td className="nowrap">{s.booked ? fmtFlight(s.booked) : t('col.newBooking')}</td>
                            <td className="right num">{fmtKgNum(s.kg)}</td>
                            <td className="right num">{Math.round(s.fitProbability * 100)}%</td>
                            <td className="reason">{modelText(s.reason, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="card" id="queue" style={{ alignSelf: 'start', scrollMarginTop: 90 }}>
          <div className="card-head"><div><h2>{t('queue.title')}</h2><p>{t('queue.note')}</p></div><Status tone="alert">{attention.length}</Status></div>
          {attention.length === 0 ? <p className="empty">{t('queue.empty')}</p> : (
            <div className="queue">
              {attention.map((s) => (
                <div key={s.awb} className={`queue-item ${s.status === 'Placed, promise missed' ? 'queue-item--caution' : ''}`}>
                  <div className="head">
                    <TierChip tier={s.tier} />
                    <Link to={`/shipment/${s.awb}`}>{commodityName(s.commodity, locale)}</Link>
                    <ModelStatusPill status={s.status} />
                  </div>
                  <div className="xs muted">{s.awb} · {fmtKgNum(s.kg)} kg · {placeName(s.dest, locale)} · {s.shc.join(' ') || t('noCodes')}</div>
                  <p className="small">{modelText(s.reason, locale)}</p>
                  {s.status === 'Placed, promise missed' && (
                    <div className="notice-box xs">{t('queue.notice', { name: commodityName(s.commodity, locale), awb: s.awb, flight: fmtFlight(s.assigned), t: fmtClock(plan.scenario.flights.find((f) => f.id === s.assigned)?.arr ?? 0, locale) })} <Link to={`/forwarder/${s.awb}`}>{t('queue.open')}</Link></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid--2" aria-label="Audit log">
        <div className="card">
          <div className="card-head"><h2>{t('log.auto')}</h2><span className="muted small">{t('log.autoCount', { n: autoLog.length, at: fmtT(plan.scenario.now) })}</span></div>
          <div className="log">
            {autoLog.map((row) => (
              <div key={row.awb} className="log-row"><span className="when">{fmtT(plan.scenario.now)}</span><span><span className="who">{t('log.engine')}</span>{row.text}</span></div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>{t('log.ops')}</h2><span className="muted small">{t('log.opsCount', { n: state.log.length })}</span></div>
          <div className="log">
            {state.log.length === 0 && <p className="empty">{t('log.none')}</p>}
            {[...state.log].reverse().map((e, i) => (
              <div key={i} className="log-row"><span className="when">{fmtLocal(e.at)}</span><span><span className="who who--ops">{t('log.operations')}</span>{modelText(e.text, locale)}</span></div>
            ))}
          </div>
        </div>
      </section>

      {drawer === 'model' && <ModelCardDrawer onClose={() => setDrawer(null)} />}
      {drawer && drawer !== 'model' && <ShapDrawer flight={drawer} onClose={() => setDrawer(null)} />}
    </main>
  );
}

function FlightColumn({ f, plan, held, onShap }: { f: Flight; plan: Plan; held: boolean; onShap: () => void }) {
  const { t, locale } = useT();
  const { state, run, canRun } = useDemo();
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const rows = [...onFlight(plan, f)].reverse(); // last to come off at the top
  const freed = freedFrom(plan, f.id);
  const displaced = displacedFrom(plan, f.id);
  const by = shipmentMap(plan);
  const delay = delayOf(f);
  const moved = new Set(state.movedAwbs);
  const scale = f.capacityScale;

  const capChange = (k: number) => ({ capScale: { [f.id]: k } });
  const delayChange = (h: number) => ({ delays: { [f.id]: delay + h } });
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const awb = e.dataTransfer.getData('text/awb');
    const s = by[awb];
    if (!s || s.assigned === f.id) return;
    void run({ forced: { [awb]: f.id } }, `Moved ${s.commodity} ${awb} to ${fmtFlight(f.id)} by hand.`);
  };

  return (
    <article className={`col ${rows.length === 0 ? 'col--empty' : ''} ${held ? 'col--held' : ''} ${over ? 'col--over' : ''}`} aria-label={fmtFlight(f.id)}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="col-top">
        <h3>{fmtFlight(f.id)}</h3>
        <span className={`kind ${f.kind === 'FRT' ? 'kind--freighter' : ''}`} title={f.oagCargoTonnes ? t('col.oag', { t: f.oagCargoTonnes }) : undefined}>{t(f.kind === 'FRT' ? 'col.freighter' : 'col.passenger')}{f.aircraftType ? ` · ${f.aircraftType}` : ''}</span>
      </div>
      <div className="col-route">
        <span className="ap">{f.origin}<span>{placeName(f.origin, locale)}</span></span>
        <IconArrow />
        <span className="ap" style={{ textAlign: 'right' }}>{f.dest}<span>{placeName(f.dest, locale)}</span></span>
      </div>
      <div className="col-when"><IconClock />{t('col.departs', { t: fmtClock(f.dep, locale) })} · {fmtT(f.dep)}</div>
      {delay > 0 && <Status tone="alert">{modelText(f.status, locale)}</Status>}
      <div className="band-head">
        <span className="xs muted">{t('col.forecast')}{scale !== 1 ? ` · ${t('col.scaled', { pct: Math.round(scale * 100) })}` : ''}</span>
        <button className="linkbtn xs" onClick={onShap}><IconInfo width={14} height={14} />{t('col.why')}</button>
      </div>
      <CapacityBand p10={f.forecastKg.p10} p50={f.forecastKg.p50} p90={f.forecastKg.p90} plannedKg={f.plannedKg} />
      <div className="col-stats">
        <div className="col-stat"><b>{fmtKgNum(f.plannedKg)} kg</b><span>{t('col.plannedShort', { pct: Math.round(f.plannedVsMedian * 100) })}</span></div>
        <div className="col-stat"><b>{rows.length}</b><span>{t('col.shipments', { cool: rows.filter((s) => s.cool).length, cap: f.coolPositions })}</span></div>
      </div>

      <div className="col-controls">
        <span className="xs muted">{t('col.capacity')}</span>
        {[0.9, 0.8].map((k) => (
          <button key={k} className={`ctl ${scale === k ? 'ctl--on' : ''}`} disabled={state.solving || !canRun(capChange(k))} title={canRun(capChange(k)) ? '' : t('col.needsLive')}
            onClick={() => run(capChange(k), `Capacity on ${fmtFlight(f.id)} set to ${Math.round(k * 100)}%.`)}>−{Math.round((1 - k) * 100)}%</button>
        ))}
        {scale !== 1 && <button className="ctl" disabled={state.solving || !canRun(capChange(1))} onClick={() => run(capChange(1), `Capacity on ${fmtFlight(f.id)} back to forecast.`)}>{t('col.resetCap')}</button>}
        <span className="xs muted" style={{ marginLeft: 6 }}>{t('col.delay')}</span>
        {[3, 6].map((h) => (
          <button key={h} className="ctl" disabled={state.solving || !canRun(delayChange(h))} title={canRun(delayChange(h)) ? '' : t('col.needsLive')}
            onClick={() => run(delayChange(h), `${fmtFlight(f.id)} delayed ${h}h more.`)}>+{h}h</button>
        ))}
      </div>

      {held && <Status tone="caution">{t('col.held')}</Status>}
      {freed.map((s) => (
        <div key={s.awb} className="col-marker col-marker--freed">
          <span className="dot" />
          <span>{t('col.freedLabel')} <Link to={`/shipment/${s.awb}`}>{commodityName(s.commodity, locale)}</Link>{t('col.freedRest', { kg: fmtKgNum(s.kg), to: s.assigned ? fmtFlight(s.assigned) : t('live.toPerson') })}</span>
        </div>
      ))}
      {rows.length > 0 && (
        <div className="col-list">
          <div className="bump-caption">{t('col.last')}</div>
          {rows.map((s) => <ShipmentItem key={s.awb} s={s} f={f} open={open === s.awb} toggle={() => setOpen(open === s.awb ? null : s.awb)} moved={moved.has(s.awb)} />)}
          <div className="bump-caption">{t('col.first')}</div>
        </div>
      )}
      {displaced.map((s) => (
        <div key={s.awb} className="col-marker col-marker--moved">
          <span className="dot" />
          <span>{t('col.movedTo', { flight: fmtFlight(s.assigned), kg: fmtKgNum(s.kg) })} <Link to={`/shipment/${s.awb}`}>{commodityName(s.commodity, locale)}</Link></span>
        </div>
      ))}
      <div className="col-foot"><p>{modelText(f.reason, locale)}</p></div>
    </article>
  );
}

function ShipmentItem({ s, f, open, toggle, moved }: { s: Shipment; f: Flight; open: boolean; toggle: () => void; moved: boolean }) {
  const { t, locale } = useT();
  const { state, run, canRun } = useDemo();
  const others = s.alternatives.filter((a) => a.flight !== f.id);
  return (
    <div className={`col-item ${open ? 'col-item--open' : ''} ${isMoved(s) ? 'col-item--displaced' : ''} ${moved ? 'col-item--moved' : ''}`}
      draggable onDragStart={(e) => { e.dataTransfer.setData('text/awb', s.awb); e.dataTransfer.effectAllowed = 'move'; }}>
      <button className="col-item-main" onClick={toggle} aria-expanded={open}>
        <TierChip tier={s.tier} />
        <span className="name">{commodityName(s.commodity, locale)}</span>
        <span className="kg">{fmtKgNum(s.kg)} kg</span>
        <span className="tag">
          <KindChip kind={s.kind} />
          {isMoved(s) && (s.booked ? <span className="tag-moved">{t('col.from', { flight: fmtFlight(s.booked) })}</span> : <span className="tag-moved">{t('col.newBooking')}</span>)}
          {s.status === 'Placed, promise missed' && <span className="tag-missed">{t('col.lateTag')}</span>}
        </span>
      </button>
      {open && (
        <div className="col-reason">
          <p>{modelText(s.reason, locale)}</p>
          <div className="alts">
            <span className="xs muted">{t('col.tryOther')}</span>
            {others.map((a) => (
              <button key={a.flight} className="ctl" disabled={!a.eligible || state.solving || !canRun({ forced: { [s.awb]: a.flight } })}
                title={a.eligible ? (canRun({ forced: { [s.awb]: a.flight } }) ? '' : t('col.needsLive')) : ruleText(a.reason, locale)}
                onClick={() => run({ forced: { [s.awb]: a.flight } }, `Moved ${s.commodity} ${s.awb} to ${fmtFlight(a.flight)} by hand.`)}>
                {fmtFlight(a.flight)}{!a.eligible ? ' ✕' : ''}
              </button>
            ))}
          </div>
          <Link to={`/shipment/${s.awb}`} className="xs">{t('col.open')}</Link>
        </div>
      )}
    </div>
  );
}
