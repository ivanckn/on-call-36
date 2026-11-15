// The explainable layer in the UI: the language model's plain words, with a check that every number comes from the model.
import { useEffect, useMemo, useState } from 'react';
import { checkNumbers } from '../model/explainFacts';
import { useT } from '../i18n';
import { IconCheck, IconInfo, IconWarn } from './Icons';

type Kind = 'shipment' | 'incident' | 'change';
type Result = { text: string; model: string } | { error: string };
const cache = new Map<string, Result>();

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

async function ask(kind: Kind, locale: string, facts: unknown): Promise<Result> {
  try {
    const res = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, locale, facts }) });
    const body = (await res.json().catch(() => ({}))) as { text?: string; model?: string; error?: string };
    if (res.ok && body.text) return { text: body.text, model: body.model ?? '' };
    return { error: body.error ?? (res.status === 404 ? 'noApi' : 'upstream') };
  } catch {
    return { error: 'noApi' };
  }
}

/** Splits numbers the check could not trace so they can be marked. */
function Marked({ line, bad }: { line: string; bad: Set<number> }) {
  const parts = line.split(/(\d[\d,]*(?:\.\d+)?)/g);
  return <>{parts.map((p, i) => (i % 2 === 1 && bad.has(Number(p.replace(/,/g, ''))) ? <mark key={i} className="ai-unverified">{p}</mark> : p))}</>;
}

export function AiExplain({ kind, facts, title, inline }: { kind: Kind; facts: object; title?: string; inline?: boolean }) {
  const { t, locale } = useT();
  const key = useMemo(() => `${kind}:${locale}:${hash(JSON.stringify(facts))}`, [kind, locale, facts]);
  const [result, setResult] = useState<Result | null>(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setResult(cache.get(key) ?? null); }, [key]);

  const run = async () => {
    setLoading(true);
    const r = await ask(kind, locale, facts);
    if ('text' in r) cache.set(key, r);
    setResult(r);
    setLoading(false);
  };

  const check = result && 'text' in result ? checkNumbers(result.text, facts) : null;
  const bad = new Set(check?.unverified ?? []);
  const lines = result && 'text' in result ? result.text.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  const intro = lines.filter((l) => !l.startsWith('- '));
  const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));

  return (
    <section className={inline ? 'ai ai--inline' : 'card ai'} aria-label={title ?? t('ai.title')}>
      <div className="card-head">
        <div>{inline ? <h3><span className="card-icon ai-icon">AI</span>{title ?? t('ai.title')}</h3> : <h2><span className="card-icon ai-icon">AI</span>{title ?? t('ai.title')}</h2>}<p>{t(`ai.intro.${kind}`)}</p></div>
        <button className="btn btn--primary btn--small" onClick={run} disabled={loading}>{loading ? t('ai.loading') : result && 'text' in result ? t('ai.again') : t('ai.run')}</button>
      </div>
      {result && 'error' in result && (
        <div className="ai-note ai-note--caution"><IconInfo /><span>{t(`ai.err.${result.error}`, {})}{result.error === 'missingKey' ? ` ${t('ai.howKey')}` : ''}</span></div>
      )}
      {result && 'text' in result && (
        <>
          <div className="ai-text">
            {intro.map((l, i) => <p key={i}><Marked line={l} bad={bad} /></p>)}
            {bullets.length > 0 && <ul>{bullets.map((l, i) => <li key={i}><Marked line={l} bad={bad} /></li>)}</ul>}
          </div>
          {check && (check.unverified.length === 0
            ? <div className="ai-note ai-note--ok"><IconCheck /><span>{t('ai.checkOk', { n: check.total })}</span></div>
            : <div className="ai-note ai-note--caution"><IconWarn /><span>{t('ai.checkBad', { n: check.unverified.length, list: check.unverified.join(', ') })}</span></div>)}
          <p className="xs muted">{t('ai.foot', { model: result.model })}</p>
        </>
      )}
      <details className="ai-facts">
        <summary className="xs">{t('ai.facts')}</summary>
        <pre>{JSON.stringify(facts, null, 1)}</pre>
      </details>
    </section>
  );
}
