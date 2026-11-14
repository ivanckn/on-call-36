// The signature visual: track, P10 to P90 range in green tint, median tick, planned load marker.
import { useT } from '../i18n';
import { fmtKgNum } from '../lib/time';

export function CapacityBand({ p10, p50, p90, plannedKg }: { p10: number; p50: number; p90: number; plannedKg: number }) {
  const { t } = useT();
  const max = Math.max(p90, plannedKg) * 1.12;
  const x = (kg: number) => `${Math.min(100, Math.max(0, (kg / max) * 100))}%`;
  return (
    <div className="band" aria-label={`P10 ${fmtKgNum(p10)} kg, P50 ${fmtKgNum(p50)} kg, P90 ${fmtKgNum(p90)} kg, planned ${fmtKgNum(plannedKg)} kg`}>
      <div className="band-track">
        <div className="band-range" style={{ left: x(p10), width: `calc(${x(p90)} - ${x(p10)})` }} />
        <div className="band-median" style={{ left: x(p50) }} />
        {plannedKg > 0 && <div className={`band-planned ${plannedKg > p90 ? 'band-planned--over' : ''}`} style={{ left: x(plannedKg) }} />}
      </div>
      <div className="band-labels">
        <span>{t('band.p10', { v: fmtKgNum(p10) })}</span>
        <span>{t('band.p50', { v: fmtKgNum(p50) })}</span>
        <span>{t('band.p90', { v: fmtKgNum(p90) })}</span>
      </div>
    </div>
  );
}

export function BandLegend() {
  const { t } = useT();
  return (
    <div className="band-legend">
      <span><span className="swatch swatch--tint" />{t('band.legend')}</span>
      <span><span className="swatch swatch--median" />{t('band.median')}</span>
      <span><span className="swatch swatch--green" />{t('band.planned')}</span>
    </div>
  );
}
