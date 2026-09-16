import { useCallback, useRef } from 'react';
import { useI18n, type TranslateVars } from '../../i18n/I18nContext';
import { agentIndonesian } from '../../i18n/agentMessages';

/** Stable translation callback: language changes must not restart a live turn. */
export function useAgentI18n() {
  const { lang } = useI18n();
  const language = useRef(lang);
  language.current = lang;
  return useCallback((source: string, vars?: TranslateVars) => {
    const text = language.current === 'id' ? agentIndonesian[source] || source : source;
    return text.replace(/\{(\w+)\}/g, (match, key) => String(vars?.[key] ?? match));
  }, []);
}
