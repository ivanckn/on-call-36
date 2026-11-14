// A side drawer, the model card, and the SHAP waterfall drawer.
import { useEffect, type ReactNode } from 'react';
import { modelCard, summary } from '../model/data';
import type { Flight } from '../model/types';
import { fmtFlight } from '../model/text';
import { useT } from '../i18n';
import { Waterfall } from './Waterfall';

export function Drawer({ title, onClose, children, narrow = false }: { title: string; onClose: () => void; children: ReactNode; narrow?: boolean }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className={`drawer ${narrow ? 'drawer--narrow' : ''}`} role="dialog" aria-label={title}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="linkbtn" onClick={onClose}>{t('drawer.close')}</button>
        </div>
        {children}
      </aside>
    </>
  );
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export function ModelCardDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const m = modelCard.metrics;
  const s = summary.solver;
  return (
    <Drawer title={t('mc.title')} onClose={onClose}>
      <p className="muted">{t('mc.intro', { name: modelCard.name, source: modelCard.dataSource, train: modelCard.trainingRows.toLocaleString('en-US'), held: modelCard.heldOutRows.toLocaleString('en-US') })}</p>
      <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
        <h3>{t('mc.method')}</h3>
        <p className="small">{modelCard.method}</p>
        <p className="small muted" style={{ marginTop: 6 }}>{t('mc.features')}: {modelCard.features.join(', ')}</p>
      </div>
      <div>
        <h3>{t('mc.metrics')}</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('th.model')}</th><th className="right">{t('mc.pinball', { q: 'P10' })}</th><th className="right">{t('mc.pinball', { q: 'P50' })}</th><th className="right">{t('mc.pinball', { q: 'P90' })}</th></tr></thead>
            <tbody>
              <tr><td>{t('mc.gbm')}</td><td className="right num">{m.pinball_P10_gbm}</td><td className="right num">{m.pinball_P50_gbm}</td><td className="right num">{m.pinball_P90_gbm}</td></tr>
              <tr><td>{t('mc.linear')}</td><td className="right num">{m.pinball_P10_linear}</td><td className="right num">{m.pinball_P50_linear}</td><td className="right num">{m.pinball_P90_linear}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>{t('mc.metricsNote', { cov: Math.round(m.coverage_P10_P90 * 100) })}</p>
      </div>
      <div>
        <h3>{t('mc.explain')}</h3>
        <ul className="stack small">
          <li><b>{t('mc.explainForecast')}</b> {modelCard.explanation?.forecast}</li>
          <li><b>{t('mc.explainDecisions')}</b> {modelCard.explanation?.decisions}</li>
        </ul>
      </div>
      {modelCard.timeSensitivity && (
        <div>
          <h3>{t('mc.risk')}</h3>
          <p className="small muted">{t('mc.riskIntro', { arch: modelCard.timeSensitivity.architecture, train: modelCard.timeSensitivity.trainingHistoriesPerOutcome.toLocaleString('en-US'), held: modelCard.timeSensitivity.heldOutHistoriesPerOutcome.toLocaleString('en-US') })}</p>
          <div className="table-wrap">
            <table className="table table--compact">
              <thead><tr><th>{t('mc.outcome')}</th><th className="right">12h {t('mc.neural')}</th><th className="right">12h {t('mc.logistic')}</th><th className="right">24h {t('mc.neural')}</th><th className="right">24h {t('mc.logistic')}</th><th className="right">48h {t('mc.neural')}</th><th className="right">48h {t('mc.logistic')}</th></tr></thead>
              <tbody>
                {Object.entries(modelCard.timeSensitivity.outcomes).map(([k, v]) => (
                  <tr key={k}>
                    <td>{t(`risk.${k}`)}</td>
                    {[12, 24, 48].flatMap((h) => [
                      <td key={`n${h}`} className="right num" style={{ fontWeight: v[`neuralBrier${h}h`] < v[`logisticBrier${h}h`] ? 700 : 400 }}>{v[`neuralBrier${h}h`]}</td>,
                      <td key={`l${h}`} className="right num" style={{ fontWeight: v[`logisticBrier${h}h`] < v[`neuralBrier${h}h`] ? 700 : 400 }}>{v[`logisticBrier${h}h`]}</td>,
                    ])}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="xs muted" style={{ marginTop: 6 }}>{modelCard.timeSensitivity.limits}</p>
        </div>
      )}
      {modelCard.regulatoryEligibility && (
        <div>
          <h3>{t('mc.reg')}</h3>
          <p className="small">{t('mc.regIntro', { v: modelCard.regulatoryEligibility.policyVersion, scope: modelCard.regulatoryEligibility.approvalScope, inputs: modelCard.regulatoryEligibility.inputs })}</p>
          <p className="xs muted" style={{ marginTop: 6 }}>{t('reg.note')}</p>
        </div>
      )}
      <div>
        <h3>{t('mc.solver')}</h3>
        <p className="small">{s.method}. {t('solver.line', { bin: s.binaryVariables.toLocaleString('en-US'), cons: s.constraints.toLocaleString('en-US'), sec: s.solveSeconds.toFixed(1), gap: pct(s.optimalityGap) })} {t('mc.scenarios', { n: s.scenarios })}</p>
      </div>
      <div>
        <h3>{t('mc.limits')}</h3>
        <p className="small">{modelCard.limits}</p>
        <p className="small muted" style={{ marginTop: 6 }}>{t('mc.realData')}</p>
      </div>
    </Drawer>
  );
}

export function ShapDrawer({ flight, onClose }: { flight: Flight; onClose: () => void }) {
  const { t } = useT();
  return (
    <Drawer title={t('shap.title', { flight: fmtFlight(flight.id) })} onClose={onClose} narrow>
      <Waterfall flight={flight} />
    </Drawer>
  );
}
