import { useCallback, useRef } from 'react';
import { translate, useI18n, type TranslateVars } from '../../i18n/I18nContext';

export function useDetailI18n() {
  const { lang } = useI18n();
  const language = useRef(lang);
  language.current = lang;
  // Translation changes must not restart file requests or discard editor drafts.
  return useCallback((message: string, vars?: TranslateVars) => {
    const translated = translate(language.current, `detail.${message}`, vars);
    return translated === `detail.${message}` ? message.replace(/\{(\w+)\}/g, (match, key) => String(vars?.[key] ?? match)) : translated;
  }, []);
}
