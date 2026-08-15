import { useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import Icon from '../Common/Icon';
import { formatCost } from '../../utils/costEstimate';
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
    setTemplateOpen(false);
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((template) => template.id !== id);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    setTemplates(next);
  };

  const insertTemplate = (template: PromptTemplate) => {
    setInput(template.content);
    setTemplateOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="shrink-0 border-t border-border bg-base px-5 py-3.5">
      <div className="relative max-w-[760px] mx-auto">
        {busy && (
          <p className="text-[11px] text-accent mb-1.5 flex items-center gap-1.5">
            <Icon name="bolt" size={11} />
            Agent is working — type a message to steer it mid-task.
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
                  if (event.key === 'Enter') { event.preventDefault(); runBash(bashCommand); }
                  if (event.key === 'Escape') setBashInputOpen(false);
                }}
                placeholder="Run command in project…"
                className="flex-1 min-w-0 bg-transparent text-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                type="button"
                onClick={() => runBash(bashCommand)}
                disabled={!bashCommand.trim()}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Run
              </button>
            </div>
          )}
          <div className="flex items-end gap-2.5">
            <button
              type="button"
              onClick={() => setBashInputOpen((value) => !value)}
              disabled={busy || notConfigured || !project}
              className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Run command in project"
              aria-label="Run command in project"
            >
              <Icon name="terminal" size={14} />
            </button>
            <button
              type="button"
              onClick={() => { setTemplateOpen((value) => !value); if (!templateOpen) setTimeout(() => templateInputRef.current?.focus(), 0); }}
              disabled={busy || notConfigured || !project}
              className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Prompt templates"
              aria-label="Prompt templates"
            >
              <Icon name="fileText" size={14} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || notConfigured || !project}
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
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                saveDraftRef.current?.(event.target.value);
                resizeInput(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              onPaste={(event) => {
                const pasted = Array.from(event.clipboardData?.files || []).filter((file) => file.type?.startsWith('image/'));
                if (pasted.length > 0) {
                  event.preventDefault();
                  handleFiles(pasted);
                }
              }}
              rows={1}
              placeholder={notConfigured ? 'Configure a provider to start chatting…' : 'Describe a task, ask a question…'}
              disabled={notConfigured || !project}
              className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none resize-none max-h-[130px] py-1 disabled:opacity-50"
              style={{ overflowY: 'auto' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && attachments.length === 0) || notConfigured || !project}
              className="w-[34px] h-[34px] shrink-0 rounded-lg bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Icon name="upload" size={14} />
            </button>
          </div>
        </div>
        {templateOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-64 overflow-auto rounded-xl border border-border bg-surface shadow-card z-30 py-1.5 px-1.5 dropdown-menu">
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
                  if (event.key === 'Enter') { event.preventDefault(); saveCurrentAsTemplate(); }
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
        {slashOpen && slashMatches.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-56 overflow-auto rounded-xl border border-border bg-surface shadow-card z-30 py-1 dropdown-menu">
            {slashMatches.map((command) => (
              <button
                key={command.name}
                type="button"
                onClick={() => insertSlashCommand(command)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
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
        <div className="text-center text-[11px] font-mono text-ink-faint mt-2 flex items-center justify-center gap-2 flex-wrap">
          <span><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[10px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[10px]">Shift+Enter</kbd> newline</span>
          {lastTurn && (lastTurn.tokens > 0 || lastTurn.cost > 0) && (
            <span className="tabular-nums text-ink-soft" title="Estimated from the active model's list price">
              last turn · {lastTurn.tokens.toLocaleString()} tokens · ≈{formatCost(lastTurn.cost)}
            </span>
          )}
          {input.length > 0 && <span className="tabular-nums">{input.length.toLocaleString()} chars</span>}
        </div>
        <div className="text-center text-[10px] text-ink-faint mt-1">Sessions &amp; context are stored by omp locally</div>
      </div>
    </div>
  );
}
