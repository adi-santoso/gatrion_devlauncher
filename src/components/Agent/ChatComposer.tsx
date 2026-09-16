import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import Icon from '../Common/Icon';
import ComposerFooter from './ComposerFooter';
import { MAX_ATTACHMENTS } from './imageAttachment';
import type { ChatImage, LastTurnInfo, SlashCommand } from './agentChatTypes';
import type { Project } from '../../types/shared';

const TEMPLATES_KEY = 'devlauncher:promptTemplates';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

export type ComposerAttachment = ChatImage & { id: string };

const loadTemplates = (): PromptTemplate[] => {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

interface ChatComposerProps {
  busy: boolean;
  notConfigured: boolean;
  unavailableReason?: string;
  project: Project;
  attachments: ComposerAttachment[];
  setAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  bashInputOpen: boolean;
  setBashInputOpen: Dispatch<SetStateAction<boolean>>;
  bashCommand: string;
  setBashCommand: Dispatch<SetStateAction<string>>;
  runBash: (command: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  saveDraftRef: MutableRefObject<(text: string) => void>;
  resizeInput: (el: HTMLTextAreaElement) => void;
  handleSend: (preset?: string) => void;
  handleFiles: (fileList: FileList | File[] | null) => void;
  slashOpen: boolean;
  slashMatches: SlashCommand[];
  insertSlashCommand: (command: SlashCommand) => void;
  currentModelVision: boolean | null;
  lastTurn: LastTurnInfo | null;
}

/**
 * Chat input bar: attach images, inline bash command line, textarea with
 * draft persistence, slash-command suggestions, and the send button.
 * All state/handlers live in AgentChat — this stays a presentational slice.
 */
export default function ChatComposer({
  busy,
  notConfigured,
  unavailableReason,
  project,
  attachments,
  setAttachments,
  bashInputOpen,
  setBashInputOpen,
  bashCommand,
  setBashCommand,
  runBash,
  fileInputRef,
  inputRef,
  input,
  setInput,
  saveDraftRef,
  resizeInput,
  handleSend,
  handleFiles,
  slashOpen,
  slashMatches,
  insertSlashCommand,
  currentModelVision,
  lastTurn,
}: ChatComposerProps) {
  // Saved prompt templates (name + content), persisted in localStorage so
  // they survive restarts without touching the config/registry schema.
  const [templates, setTemplates] = useState<PromptTemplate[]>(loadTemplates);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const templatePanelRef = useRef<HTMLDivElement | null>(null);
  const templateButtonRef = useRef<HTMLButtonElement | null>(null);
  const [dismissedSlashInput, setDismissedSlashInput] = useState<string | null>(null);
  const showSlash = slashOpen && slashMatches.length > 0 && dismissedSlashInput !== input;
  const disabled = notConfigured || Boolean(unavailableReason) || !project;

  useEffect(() => {
    if (!templateOpen) return;
    templateInputRef.current?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!templatePanelRef.current?.contains(target) && !templateButtonRef.current?.contains(target)) setTemplateOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setTemplateOpen(false); templateButtonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [templateOpen]);

  useEffect(() => { if (inputRef.current) resizeInput(inputRef.current); }, [input, inputRef, resizeInput]);

  // Index of the highlighted slash-command suggestion (arrow-key navigable).
  const [slashIndex, setSlashIndex] = useState(0);
  // Reset the highlight whenever the visible list changes (open/close/filter).
  useEffect(() => {
    setSlashIndex(0);
  }, [slashOpen, input, slashMatches.length]);

  const saveCurrentAsTemplate = () => {
    const content = input.trim();
    if (!content) return;
    const name = templateName.trim() || content.slice(0, 42);
    const next = [
      ...templates.filter((template) => template.name !== name),
      { id: String(Date.now()), name, content },
    ];
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    setTemplates(next);
    setTemplateName('');
    setInput('');
    saveDraftRef.current?.('');
    setTemplateOpen(false);
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((template) => template.id !== id);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    setTemplates(next);
  };

  const insertTemplate = (template: PromptTemplate) => {
    setInput(template.content);
    saveDraftRef.current?.(template.content);
    setTemplateOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Elapsed time of the current agent turn, ticking every second while busy.
  const [workElapsed, setWorkElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return undefined;
    setWorkElapsed(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setWorkElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const formatElapsed = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className="shrink-0 border-t border-border bg-base px-5 py-3.5">
      <div className="relative max-w-[760px] mx-auto">
        {busy && (
          <p className="text-[11px] text-accent mb-1.5 flex items-center gap-1.5 tabular-nums">
            <Icon name="spinner" size={11} className="animate-spin" />
            working · {formatElapsed(workElapsed)}
          </p>
        )}
        <div className={`relative rounded-[13px] border bg-surface-2 px-4 py-2.5 transition-all ${busy ? 'border-border' : 'border-border hover:border-border-hover focus-within:border-border-hover'}`}>
          {attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-2.5">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="relative">
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.name || 'attachment'}
                    className="w-14 h-14 object-cover rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-border shadow-sm flex items-center justify-center text-ink-soft hover:text-danger transition-colors"
                    title="Remove image"
                    aria-label="Remove image"
                  >
                    <Icon name="x" size={10} />
                  </button>
                </div>
              ))}
              <span className="text-[11px] text-ink-faint ml-auto">{attachments.length}/{MAX_ATTACHMENTS}</span>
            </div>
          )}
          {bashInputOpen && (
            <div className="flex items-center gap-2 pb-2.5">
              <span className="text-xs font-mono text-accent shrink-0">$</span>
              <input
                autoFocus
                value={bashCommand}
                onChange={(event) => setBashCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter' && !busy && !disabled) { event.preventDefault(); runBash(bashCommand); }
                  if (event.key === 'Escape') setBashInputOpen(false);
                }}
                placeholder="Run command in project..."
                aria-label="Command to run in project"
                disabled={busy || disabled}
                className="flex-1 min-w-0 bg-transparent text-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                type="button"
                onClick={() => runBash(bashCommand)}
                disabled={busy || disabled || !bashCommand.trim()}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Run
              </button>
            </div>
          )}
          <div className="flex flex-col">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setDismissedSlashInput(null);
                saveDraftRef.current?.(event.target.value);
                resizeInput(event.target);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || disabled) return;
                // While the slash palette is open, arrow keys move the
                // highlight and Enter/Tab inserts the selected command.
                if (showSlash) {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setSlashIndex((index) => (index + 1) % slashMatches.length);
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSlashIndex((index) => (index - 1 + slashMatches.length) % slashMatches.length);
                    return;
                  }
                  if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
                    event.preventDefault();
                    insertSlashCommand(slashMatches[slashIndex] || slashMatches[0]);
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setDismissedSlashInput(input);
                    return;
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!busy || attachments.length === 0) handleSend();
                }
              }}
              onPaste={(event) => {
                if (busy || disabled) return;
                const pasted = Array.from(event.clipboardData?.files || []).filter((file) => file.type?.startsWith('image/'));
                if (pasted.length > 0) {
                  event.preventDefault();
                  handleFiles(pasted);
                }
              }}
              rows={1}
              aria-label="Message to agent"
              placeholder={unavailableReason || (notConfigured ? 'Configure a provider to start chatting...' : 'Describe a task, ask a question...')}
              disabled={disabled}
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none resize-none max-h-[130px] py-0.5 disabled:opacity-50"
              style={{ overflowY: 'auto' }}
            />
            <div className="flex items-center gap-1 pt-1.5">
              <button
                type="button"
                onClick={() => setBashInputOpen((value) => !value)}
                disabled={busy || disabled}
                className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Run command in project"
                aria-label="Run command in project"
              >
                <Icon name="terminal" size={14} />
              </button>
              <button
                type="button"
                ref={templateButtonRef}
                onClick={() => { setTemplateOpen((value) => !value); setDismissedSlashInput(input); }}
                disabled={busy || disabled}
                aria-expanded={templateOpen}
                className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Prompt templates"
                aria-label="Prompt templates"
              >
                <Icon name="fileText" size={14} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || disabled || attachments.length >= MAX_ATTACHMENTS}
                className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Attach image"
                aria-label="Attach image"
              >
                <Icon name="paperclip" size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <div className="flex-1" />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && attachments.length === 0) || disabled || (busy && attachments.length > 0)}
                className="w-[34px] h-[34px] shrink-0 rounded-lg bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={busy ? 'Steer agent' : 'Send message'}
                title={busy ? 'Send an instruction to the current turn (Enter)' : 'Send (Enter)'}
              >
                <Icon name="upload" size={14} />
              </button>
            </div>
          </div>
        </div>
        {templateOpen && (
          <div ref={templatePanelRef} role="region" aria-label="Prompt templates" className="absolute bottom-full left-0 right-0 mb-1.5 max-h-64 overflow-auto rounded-xl border border-border bg-surface shadow-card z-30 py-1.5 px-1.5 dropdown-menu">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Templates</p>
            {templates.length === 0 && (
              <p className="px-2 py-1.5 text-[11px] text-ink-faint">No templates yet — save the current prompt below.</p>
            )}
            {templates.map((template) => (
              <div key={template.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => insertTemplate(template)}
                  className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink rounded-md transition-colors"
                >
                  <span className="flex-1 min-w-0 truncate font-medium">{template.name}</span>
                  <span className="max-w-[40%] truncate text-[10px] text-ink-faint">{template.content}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(template.id)}
                  className="text-ink-faint hover:text-danger px-1 py-1 shrink-0 rounded-md transition-colors"
                  aria-label={`Delete template ${template.name}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-border">
              <input
                ref={templateInputRef}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); saveCurrentAsTemplate(); }
                }}
                placeholder="Template name (optional)"
                aria-label="Template name"
                className="flex-1 min-w-0 bg-surface-3 border border-border rounded-md px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50"
              />
              <button
                type="button"
                onClick={saveCurrentAsTemplate}
                disabled={!input.trim()}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="plus" size={11} />
                Save current prompt
              </button>
            </div>
          </div>
        )}
        {showSlash && !templateOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-56 overflow-auto rounded-xl border border-border bg-surface shadow-card z-30 py-1 dropdown-menu">
            {slashMatches.map((command, index) => (
              <button
                key={command.name}
                type="button"
                onClick={() => insertSlashCommand(command)}
                onMouseEnter={() => setSlashIndex(index)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  index === slashIndex ? 'bg-surface-3 text-ink' : 'text-ink-soft hover:bg-surface-3 hover:text-ink'
                }`}
              >
                <span className="font-mono text-accent shrink-0">/{command.name}</span>
                <span className="flex-1 min-w-0 truncate">{command.description || command.input?.hint || ''}</span>
              </button>
            ))}
          </div>
        )}
        {attachments.length > 0 && currentModelVision === false && (
          <p className="text-[11px] text-warning flex items-center gap-1.5 mt-2">
            <Icon name="warn" size={11} />
            The active model may not support images — switch to a vision-capable model from the header.
          </p>
        )}
        {busy && <p className="text-[11px] text-ink-soft mt-2">{attachments.length > 0 ? 'Images can be sent after the current turn finishes.' : 'Sending now adds an instruction to the running agent.'}</p>}
        <ComposerFooter busy={busy} lastTurn={lastTurn} inputLength={input.length} />
      </div>
    </div>
  );
}
