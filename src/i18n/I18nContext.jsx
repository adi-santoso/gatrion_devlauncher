import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { translations, LANGUAGES } from './translations';

const I18nContext = createContext({ lang: 'en', t: (key) => key });

/**
 * Look up a translation key for a language. Falls back to English, then to
 * the raw key so a missing translation never crashes the UI.
 */
export function translate(lang, key, vars) {
  const table = translations[lang] || translations.en || {};
  let text = table[key];
  if (text === undefined) {
    text = translations.en?.[key];
  }
  if (text === undefined) return key;
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
}

export function I18nProvider({ language = 'en', children }) {
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const t = useCallback(
    (key, vars) => translate(lang, key, vars),
    [lang]
  );
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the current language and its `t(key, vars)` helper. */
export function useI18n() {
  return useContext(I18nContext);
}

export default I18nContext;
