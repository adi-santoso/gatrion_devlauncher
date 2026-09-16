import { formatCost } from '../../utils/costEstimate';
import type { LastTurnInfo } from './agentChatTypes';

export default function ComposerFooter({ busy, lastTurn, inputLength }: { busy: boolean; lastTurn: LastTurnInfo | null; inputLength: number }) {
  return (
    <div className="text-center text-[10px] text-ink-faint mt-1.5 flex items-center justify-center gap-x-3 gap-y-0.5 flex-wrap">
      <span className="font-mono flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[9.5px]">Enter</kbd> {busy ? 'steer' : 'send'} · <kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[9.5px]">Shift+Enter</kbd> newline</span>
      {lastTurn && (lastTurn.tokens > 0 || lastTurn.cost > 0) && (
        <span className="tabular-nums text-ink-soft" title="Estimated from the active model's list price">
          last turn · {lastTurn.tokens.toLocaleString()} tok · ≈{formatCost(lastTurn.cost)}
        </span>
      )}
      {inputLength > 0 && <span className="tabular-nums">{inputLength.toLocaleString()} chars</span>}
      <span className="text-ink-faint/80">Sessions stored locally by omp</span>
    </div>
  );
}
