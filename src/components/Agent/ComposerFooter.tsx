import { formatCost } from '../../utils/costEstimate';
import type { LastTurnInfo } from './agentChatTypes';
import { useAgentI18n } from './useAgentI18n';

export default function ComposerFooter({ busy, lastTurn, inputLength }: { busy: boolean; lastTurn: LastTurnInfo | null; inputLength: number }) {
  const t = useAgentI18n();
  return (
    <div className="text-center text-[10px] text-ink-faint mt-1.5 flex items-center justify-center gap-x-3 gap-y-0.5 flex-wrap">
      <span className="font-mono flex items-center gap-1" title={t(busy ? 'Send to working agent' : 'Send message')}><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[9.5px]">Enter</kbd> {t('send')} · <kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[9.5px]">Shift+Enter</kbd> {t('newline')}</span>
      {lastTurn && (lastTurn.tokens > 0 || lastTurn.cost > 0) && (
        <span className="tabular-nums text-ink-soft" title={t("Estimated from the active model's list price")}>
          {t('last turn')} · {lastTurn.tokens.toLocaleString()} tok · ≈{formatCost(lastTurn.cost)}
        </span>
      )}
      {inputLength > 0 && <span className="tabular-nums">{inputLength.toLocaleString()} {t('chars')}</span>}
      <span className="text-ink-faint/80">{t('Sessions stored locally by omp')}</span>
    </div>
  );
}
