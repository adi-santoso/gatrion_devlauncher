import Icon from '../Common/Icon';
import type { ChatMessage } from './agentChatTypes';
import { useAgentI18n } from './useAgentI18n';

export default function MessageDelivery({ message, onRetry }: { message: ChatMessage; onRetry?: (message: ChatMessage) => void }) {
  const t = useAgentI18n();
  if (!message.delivery) return null;
  const failed = message.delivery === 'failed';
  const sending = message.delivery === 'sending';
  return <div className="mt-1.5 text-[11px]">
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" aria-live="polite" aria-atomic="true" className={failed ? 'text-danger' : 'text-ink-soft'} title={message.delivery === 'sent' ? t('Accepted by the agent backend; not a read receipt.') : undefined}>
        <span key={message.delivery} className="agent-status-in inline-flex items-center gap-1.5">
          <Icon name={sending ? 'spinner' : failed ? 'warn' : 'check'} size={12} className={sending ? 'animate-spin' : ''} />
          {t(sending ? 'Sending…' : failed ? 'Failed to send' : 'Sent to agent')}
        </span>
      </span>
      {failed && <button type="button" className="rounded px-2 py-1 text-accent hover:bg-accent/10" onClick={() => onRetry?.(message)}>{t('Try again')}</button>}
    </div>
    {failed && message.deliveryError && <p className="text-danger break-words mt-1">{message.deliveryError}</p>}
  </div>;
}
