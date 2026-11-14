// Live controls status: re optimising line, the change list with three deltas, the solver line, and offline playback.
import { Link } from 'react-router-dom';
import { allSnapshots } from '../model/live';
import { commodityName, fmtFlight, modelText, statusName } from '../model/text';
import type { Diff, SolverStats } from '../model/types';
import { useT } from '../i18n';
import { useDemo } from '../state/demo';
import { ServiceBadge } from './Shell';
import { Status, TierChip, toneOf } from './Status';
import { Findings } from './Explain';

export function Deltas({ diff }: { diff: Pick<Diff, 'costIndexChange' | 'promisesKeptChange' | 'perishableChange'> }) {
  const { t } = useT();
  const sign = (v: number, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;
  return (
    <div className="deltas">
      <div className={`delta ${diff.costIndexChange > 0 ? 'delta--bad' : diff.costIndexChange < 0 ? 'delta--good' : ''}`}><b>{sign(diff.costIndexChange)}</b><span>{t('delta.cost')}</span></div>
      <div className={`delta ${diff.promisesKeptChange < 0 ? 'delta--bad' : diff.promisesKeptChange > 0 ? 'delta--good' : ''}`}><b>{sign(diff.promisesKeptChange)}</b><span>{t('delta.promises')}</span></div>
      <div className={`delta ${diff.perishableChange < 0 ? 'delta--bad' : diff.perishableChange > 0 ? 'delta--good' : ''}`}><b>{sign(diff.perishableChange)}</b><span>{t('delta.perishable')}</span></div>
    </div>
  );
}

export function SolverLine({ solver, seconds }: { solver: SolverStats; seconds?: number | null }) {
  const { t } = useT();
  return <p className="solver-line">{t('solver.line', { bin: solver.binaryVariables.toLocaleString('en-US'), cons: solver.constraints.toLocaleString('en-US'), sec: (seconds ?? solver.solveSeconds).toFixed(1), gap: `${(solver.optimalityGap * 100).toFixed(2)}%` })}</p>;
}

export function LivePanel() {
  const { t, locale } = useT();
  const { state, dispatch, runExact } = useDemo();
  const offline = state.mode === 'offline';
  const changed = state.diff?.changed ?? [];
  return (
    <section className="card live" aria-label={t('live.title')}>
      <div className="card-head">
        <div>
          <h2>{t('live.title')}</h2>
          <p>{t(offline ? 'live.introOffline' : 'live.intro')}</p>
        </div>
        <div className="actions">
          <ServiceBadge />
          {state.source !== 'base' && <button className="btn btn--secondary btn--small" onClick={() => dispatch({ type: 'resetPlan' })}>{t('live.reset')}</button>}
        </div>
      </div>

      {state.solving && (
        <div className="solving"><span>{t('live.solving')}</span><div className="solving-bar"><i /></div></div>
      )}

      {state.blocked && !state.solving && (
        <div className="blocked"><Status tone="alert">{t('live.blocked')}</Status><span>{modelText(state.blocked, locale)}</span>{state.blockedRule && <div style={{ flexBasis: '100%' }}><Findings reg={state.blockedRule} compact /></div>}</div>
      )}

      {!state.solving && state.diff && (
        <div className="change">
          <div className="change-head">
            <b>{state.lastLabel ? modelText(state.lastLabel, locale) : t('live.result')}</b>
            <span className="xs muted">{t(state.source === 'live' ? 'live.fromLive' : 'live.fromSnapshot')}</span>
          </div>
          <Deltas diff={state.diff} />
          {changed.length === 0 ? <p className="small muted">{t('live.noMoves')}</p> : (
            <ul className="change-list">
              {changed.map((c) => (
                <li key={c.awb}>
                  <TierChip tier={c.tier} />
                  <Link to={`/shipment/${c.awb}`}>{commodityName(c.commodity, locale)}</Link>
                  <span className="move">{c.was ? fmtFlight(c.was) : t('col.newBooking')} <span aria-hidden>→</span> {c.now ? fmtFlight(c.now) : t('live.toPerson')}</span>
                  <Status tone={toneOf(c.statusNow)}>{statusName(c.statusNow, locale)}</Status>
                  <span className="xs muted change-reason">{modelText(c.reason, locale)}</span>
                </li>
              ))}
            </ul>
          )}
          <SolverLine solver={state.plan.solver} seconds={state.seconds} />
        </div>
      )}

      {offline && (
        <div className="snapshots">
          <span className="xs muted">{t('live.snapshots')}</span>
          <div className="row">
            {allSnapshots().map((s) => (
              <button key={s.label} className="chip-btn" onClick={() => runExact(s.request, `Played back: ${s.label}`)}>{modelText(s.label, locale)}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
