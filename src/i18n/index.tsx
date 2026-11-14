import { createContext, useCallback, useContext, type ReactNode } from 'react';
import type { Locale } from '../model/text';
import { en } from './en';
import { zh } from './zh';

const DICT: Record<Locale, Record<string, string>> = { en, zh };
export type Params = Record<string, string | number>;

export function translate(locale: Locale, key: string, params?: Params): string {
  const template = DICT[locale][key] ?? DICT.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

interface I18n {
  locale: Locale;
  t: (key: string, params?: Params) => string;
}

const I18nContext = createContext<I18n>({ locale: 'en', t: (k, p) => translate('en', k, p) });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useCallback((key: string, params?: Params) => translate(locale, key, params), [locale]);
  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  return useContext(I18nContext);
}

/** Renders a translated string whose template contains <b>…</b>. */
export function Rich({ k, params }: { k: string; params?: Params }) {
  const { t } = useT();
  const text = t(k, params);
  const parts = text.split(/<b>|<\/b>/);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p))}</>;
}
