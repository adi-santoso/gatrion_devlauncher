import React, { useState } from 'react';
import Icon from '../Common/Icon';
import Markdown from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import ToolCard from './ToolCard';
import type { ChatMessage } from './agentChatTypes';

const formatTime = (iso?: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const actionBtnCls = 'inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink px-2 py-1 rounded-md hover:bg-surface-3 transition-colors';

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" onClick={handleCopy} title="Copy message" className={`${actionBtnCls} ${copied ? 'text-success' : ''} ${className}`}>
      <Icon name={copied ? 'check' : 'copy'} size={12} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

interface AssistantMessageProps {
  message: ChatMessage;
  isLast: boolean;
  busy: boolean;
  onRetry?: (message: ChatMessage) => void;
  onBranch?: (entryId: string) => void;
}

// Memoized so streaming deltas (which re-render only the streaming block)
// never re-parse/re-render every historical message on each keystroke.
export const AssistantMessage = React.memo(function AssistantMessage({ message, isLast, busy, onRetry, onBranch }: AssistantMessageProps) {
  const [speaking, setSpeaking] = useState(false);
  const speechSupported = 'speechSynthesis' in window;

  const speak = () => {
    if (!speechSupported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const hasTokens = message.promptTokens != null || message.completionTokens != null || message.totalTokens != null;
  const tokens = hasTokens
    ? (message.totalTokens ?? (message.promptTokens || 0) + (message.completionTokens || 0))
    : null;

  return (
    <div className="group flex gap-[13px]">
      <div className="w-7 h-7 rounded-[7px] bg-accent text-white shadow-[0_0_10px_rgba(109,94,245,.35)] flex items-center justify-center shrink-0 mt-0.5">
        <Icon name="messageSquare" size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10.5px] font-semibold font-mono uppercase tracking-[0.07em] text-ink-faint">Assistant</span>
          {formatTime(message.createdAt) && <span className="text-[10px] text-ink-faint">{formatTime(message.createdAt)}</span>}
          {tokens != null && tokens > 0 && (
            <span
              className="text-[10px] text-ink-soft bg-surface-2 px-1.5 py-0.5 rounded"
              title={
                message.promptTokens != null && message.completionTokens != null
                  ? `${message.promptTokens.toLocaleString()} prompt · ${message.completionTokens.toLocaleString()} completion tokens`
                  : 'Tokens used'
              }
            >
              {message.promptTokens != null && message.completionTokens != null
                ? `${message.promptTokens.toLocaleString()} in · ${message.completionTokens.toLocaleString()} out`
                : `${tokens.toLocaleString()} tokens`}
            </span>
          )}
        </div>
        {message.segments && message.segments.length > 0 ? (
          <>
            {message.segments.map((segment, index) => {
              if (segment.kind === 'thinking') {
                return <ThinkingBlock key={index} content={segment.text || ''} />;
              }
              if (segment.kind === 'tool') {
                return <ToolCard key={index} tool={segment.tool || { name: 'tool' }} />;
              }
              return (
                <div key={index} className="text-sm text-ink leading-[1.7]">
                  <Markdown content={segment.text || ''} />
                </div>
              );
            })}
            {/* A turn that streamed no text (e.g. thinking-only) still carries
                canonical transcript text — render it below the blocks. */}
            {!message.segments.some((segment) => segment.kind === 'text') && message.content.trim() && (
              <div className="text-sm text-ink leading-[1.7]">
                <Markdown content={message.content} />
              </div>
            )}
          </>
        ) : (
          <>
            {message.thinking && <ThinkingBlock content={message.thinking} />}
            <div className="text-sm text-ink leading-[1.7]">
              <Markdown content={message.content} />
            </div>
          </>
        )}
        {message.stopped && (
          <p className="mt-1.5 text-[11px] text-ink-faint italic flex items-center gap-1.5">
            <Icon name="stop" size={10} />
            Generation stopped — partial reply kept
          </p>
        )}
        <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {speechSupported && (
            <button type="button" onClick={speak} title={speaking ? 'Stop reading' : 'Read aloud'} className={actionBtnCls}>
              <Icon name="volume" size={12} />
              {speaking ? 'Stop' : 'Read aloud'}
            </button>
          )}
          {isLast && !busy && (
            <button type="button" onClick={() => onRetry?.(message)} title="Retry — re-ask the last prompt" className={actionBtnCls}>
              <Icon name="refreshCw" size={12} />
              Retry
            </button>
          )}
          {message.entryId && (
            <button type="button" onClick={() => onBranch?.(message.entryId as string)} title="Branch the conversation from here" className={actionBtnCls}>
              <Icon name="gitBranch" size={12} />
              Branch
            </button>
          )}
          <CopyButton text={message.content} />
        </div>
      </div>
    </div>
  );
});

interface UserMessageProps {
  message: ChatMessage;
  isLast: boolean;
  busy: boolean;
  onSave?: (id: string, text: string) => void;
  onBranch?: (entryId: string) => void;
}

// User message in the same flat layout (avatar + content column). Images render
// as clickable thumbnails with a fullscreen viewer; the most recent user
// message can be edited inline and re-sent.
export function UserMessage({ message, isLast, busy, onSave, onBranch }: UserMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const cancelEdit = () => {
    setEditing(false);
    setDraft(message.content);
  };
  const submitEdit = () => {
    const text = draft.trim();
    if (!text) return;
    setEditing(false);
    onSave?.(message.id, text);
  };

  return (
    <div className="group flex gap-[13px]">
      <div className="w-7 h-7 rounded-[7px] bg-surface-2 text-ink-soft border border-border flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[11px] font-bold">You</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10.5px] font-semibold font-mono uppercase tracking-[0.07em] text-ink-faint">You</span>
          {formatTime(message.createdAt) && <span className="text-[10px] text-ink-faint">{formatTime(message.createdAt)}</span>}
        </div>
        {editing ? (
          <div className="border border-accent/40 rounded-xl bg-surface-2 overflow-hidden">
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitEdit(); }
                if (event.key === 'Escape') cancelEdit();
              }}
              rows={Math.min(6, Math.max(2, draft.split('\n').length))}
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint px-3.5 py-2.5 focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-1.5 px-2 pb-2">
              <button type="button" onClick={cancelEdit} className="px-2.5 py-1 rounded-lg text-[11px] text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors">Cancel</button>
              <button type="button" onClick={submitEdit} disabled={!draft.trim()} className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-50 transition-colors">Save &amp; send</button>
            </div>
          </div>
        ) : (
          <>
            {message.content && (
              <div className="text-sm text-ink leading-[1.7] whitespace-pre-wrap break-words">{message.content}</div>
            )}
            {message.images && message.images.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {message.images.map((image) => (
                  <button
                    key={image.dataUrl}
                    type="button"
                    onClick={() => setExpandedImage(image.dataUrl)}
                    className="relative group/thumb rounded-lg overflow-hidden border border-border hover:border-border-hover transition-colors"
                    title="View image"
                  >
                    <img src={image.dataUrl} alt="Attachment" className="w-32 h-32 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                      <Icon name="maximize" size={16} className="text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {!editing && (
          <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {isLast && !busy && (
              <button
                type="button"
                onClick={() => { setEditing(true); setDraft(message.content); }}
                title="Edit and re-ask"
                className={actionBtnCls}
              >
                <Icon name="edit" size={12} />
                Edit
              </button>
            )}
            {message.entryId && (
              <button type="button" onClick={() => onBranch?.(message.entryId as string)} title="Branch the conversation from here" className={actionBtnCls}>
                <Icon name="gitBranch" size={12} />
                Branch
              </button>
            )}
            {message.content && <CopyButton text={message.content} />}
          </div>
        )}
      </div>

      {expandedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-backdrop-in" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="Expanded" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-panel-in" />
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
            title="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
