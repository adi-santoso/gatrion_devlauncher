import { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import { translations, LANGUAGES } from './translations';

/** Interpolation variables accepted by `t(key, vars)`. */
export type TranslateVars = Record<string, string | number | undefined>;

export interface I18nValue {
  lang: string;
  t: (key: string, vars?: TranslateVars) => string;
}

const I18nContext = createContext<I18nValue>({ lang: 'en', t: (key) => key });

/**
 * Look up a translation key for a language. Falls back to English, then to
 * the raw key so a missing translation never crashes the UI.
 */
const TABLES = translations as Record<string, Record<string, string>>;

/**
 * Look up a translation key for a language. Falls back to English, then to
 * the raw key so a missing translation never crashes the UI.
 */
export function translate(lang: string, key: string, vars?: TranslateVars): string {
  const table = TABLES[lang] || TABLES.en || {};
  let text = table[key];
  if (text === undefined) {
    text = TABLES.en?.[key];
  }
  if (text === undefined) return key;
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
}

interface I18nProviderProps {
  language?: string;
  children: ReactNode;
}

export function I18nProvider({ language = 'en', children }: I18nProviderProps) {
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const t = useCallback(
    (key: string, vars?: TranslateVars) => translate(lang, key, vars),
    [lang]
  );
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the current language and its `t(key, vars)` helper. */
export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export default I18nContext;
