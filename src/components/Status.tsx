import type { Kind, Status as ModelStatus, Tier } from '../model/types';
import { statusName } from '../model/text';
import { useT } from '../i18n';

export type Tone = 'ok' | 'caution' | 'alert' | 'none';

export function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`status status--${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function TierChip({ tier }: { tier: Tier }) {
  return <span className={`tier tier--${tier}`}>{tier}</span>;
}

export function KindChip({ kind }: { kind: Kind }) {
  const { t } = useT();
  return <span className={`kindchip kindchip--${kind}`} title={t(`kind.${kind}.note`)}>{t(`kind.${kind}`)}</span>;
}

export function toneOf(s: ModelStatus, held = false): Tone {
  if (held) return 'caution';
  switch (s) {
    case 'Placed automatically': return 'ok';
    case 'Placed, promise missed': return 'caution';
    case 'Needs a person': return 'alert';
    default: return 'none';
  }
}

export function ModelStatusPill({ status, held = false }: { status: ModelStatus; held?: boolean }) {
  const { t, locale } = useT();
  if (held) return <Status tone="caution">{t('status.held')}</Status>;
  return <Status tone={toneOf(status)}>{statusName(status, locale)}</Status>;
}
