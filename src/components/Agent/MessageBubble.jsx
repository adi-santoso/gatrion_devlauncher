import React, { useState } from 'react';
import Icon from '../Common/Icon';
import Markdown from './Markdown';
import ThinkingBlock from './ThinkingBlock';

export function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy message"
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors ${copied ? 'text-success' : 'text-ink-faint hover:text-ink-soft'} ${className}`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// Memoized so streaming deltas (which re-render only the streaming block)
// never re-parse/re-render every historical message on each keystroke.
export const AssistantMessage = React.memo(function AssistantMessage({ message, isLast, busy, onRetry }) {
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
    <div className="group self-start max-w-[96%] w-full">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-5 h-5 rounded-md bg-accent/15 text-accent-hover flex items-center justify-center shrink-0">
          <Icon name="messageSquare" size={11} />
        </span>
        <span className="text-xs font-semibold text-ink-soft">Agent</span>
        {tokens != null && tokens > 0 && (
          <span
            className="text-[10px] font-mono text-ink-faint bg-surface-2 border border-border rounded-full px-2 py-0.5"
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
        <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {speechSupported && (
            <button
              type="button"
              onClick={speak}
              title={speaking ? 'Stop reading' : 'Read aloud'}
              className="p-1 rounded-md text-ink-faint hover:text-ink-soft hover:bg-surface-3 transition-colors"
            >
              <Icon name="volume" size={12} />
            </button>
          )}
          {isLast && !busy && (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              title="Retry — re-ask the last prompt"
              className="p-1 rounded-md text-ink-faint hover:text-ink-soft hover:bg-surface-3 transition-colors"
            >
              <Icon name="refreshCw" size={12} />
            </button>
          )}
          <CopyButton text={message.content} />
        </span>
      </div>
      {message.thinking && <ThinkingBlock content={message.thinking} />}
      <div className="text-sm text-ink leading-relaxed">
        <Markdown content={message.content} />
      </div>
      {message.stopped && (
        <p className="mt-1.5 text-[11px] text-ink-faint italic flex items-center gap-1.5">
          <Icon name="stop" size={10} />
          Generation stopped — partial reply kept
        </p>
      )}
    </div>
  );
});

// User bubble with attached image thumbnails, an inline edit mode (edit the
// last message and re-ask), and a fullscreen image viewer.
export function UserMessage({ message, isLast, busy, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [expandedImage, setExpandedImage] = useState(null);

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
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        {editing ? (
          <div className="bg-accent text-white text-sm rounded-2xl rounded-br-md shadow-sm overflow-hidden">
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitEdit(); }
                if (event.key === 'Escape') cancelEdit();
              }}
              rows={Math.min(6, Math.max(2, draft.split('\n').length))}
              className="w-full bg-transparent text-white placeholder:text-white/50 px-4 py-2.5 focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-1.5 px-2 pb-2">
              <button type="button" onClick={cancelEdit} className="px-2.5 py-1 rounded-lg text-[11px] text-white/70 hover:bg-white/10 transition-colors">Cancel</button>
              <button type="button" onClick={submitEdit} disabled={!draft.trim()} className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-white/15 hover:bg-white/25 disabled:opacity-50 transition-colors">Save &amp; send</button>
            </div>
          </div>
        ) : (
          <>
            {message.content && (
              <div className="group relative">
                <div className="bg-accent text-white text-sm leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md shadow-sm whitespace-pre-wrap break-words">
                  {message.content}
                </div>
                {isLast && !busy && (
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setDraft(message.content); }}
                    title="Edit and re-ask"
                    className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-surface border border-border shadow-card flex items-center justify-center text-ink-faint hover:text-accent hover:border-border-hover opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Icon name="edit" size={11} />
                  </button>
                )}
              </div>
            )}
            {message.images && message.images.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap justify-end">
                {message.images.map((image) => (
                  <button
                    key={image.dataUrl}
                    type="button"
                    onClick={() => setExpandedImage(image.dataUrl)}
                    className="rounded-lg overflow-hidden border border-border hover:border-border-hover transition-colors"
                    title="View image"
                  >
                    <img src={image.dataUrl} alt="Attachment" className="w-28 h-28 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
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
