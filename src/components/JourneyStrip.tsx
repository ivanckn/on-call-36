import { placeName, fmtFlight } from '../model/text';
import { useT } from '../i18n';
import { fmtClock } from '../lib/time';

export interface Leg { from: string; to: string; flight: string | null; dep: number | null; arr: number | null; kindLabel: string; state: 'ok' | 'delayed' | 'missed' | 'new' | 'flown'; text: string }

export function JourneyStrip({ legs }: { legs: Leg[] }) {
  const { t, locale } = useT();
  if (legs.length === 0) return null;
  return (
    <div className="journey">
      {legs.map((leg, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div className="node">
            <div className="node-place">{leg.from}</div>
            <div className="node-time">{placeName(leg.from, locale)}</div>
            {leg.dep !== null && <div className="node-time">{t('journey.dep', { t: fmtClock(leg.dep, locale) })}</div>}
          </div>
          <div className={`leg leg--${leg.state}`}>
            <div className="leg-top">
              <span>{leg.flight ? fmtFlight(leg.flight) : t('journey.inbound')}</span>
              <span>{leg.kindLabel}</span>
            </div>
            <div className="leg-line" />
            <div className="leg-status">{leg.text}</div>
          </div>
          {i === legs.length - 1 && (
            <div className="node">
              <div className="node-place">{leg.to}</div>
              <div className="node-time">{placeName(leg.to, locale)}</div>
              {leg.arr !== null && <div className="node-time">{t('journey.arr', { t: fmtClock(leg.arr, locale) })}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
