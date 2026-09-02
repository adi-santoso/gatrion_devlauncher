import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import Icon from '../Common/Icon';
import type { LaravelLogFile } from '../../data/projects';

const stripAnsi = (value: string): string => value
  .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

// Highlight case-insensitive matches in a line.
const HighlightedLine = ({ text, query }: { text: string; query: string }): JSX.Element => {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {parts.map((part, index) => (
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={index} className="bg-yellow-500/30 text-inherit rounded-[2px] px-0.5">{part}</mark>
          : <span key={index}>{part}</span>
      ))}
    </>
  );
};

// Laravel log lines follow "[2024-01-01 12:00:00] production.ERROR: message".
// Render the leading timestamp/level in muted accent colors so the stream is
// scannable; errors/warnings get a colored level chip.
const LaravelLine = ({ line, query }: { line: string; query: string }): JSX.Element => {
  const match = line.match(/^\[([^\]]+)\]\s+(\S+\.)?(ERROR|CRITICAL|ALERT|EMERGENCY|WARNING|NOTICE|INFO|DEBUG)\s*:/);
  if (!match) {
    return <span className="text-ink-soft"><HighlightedLine text={line} query={query} /></span>;
  }
  const [, timestamp, , level] = match;
  const levelColor: Record<string, string> = {
    ERROR: 'text-danger',
    CRITICAL: 'text-danger',
    ALERT: 'text-danger',
    EMERGENCY: 'text-danger',
    WARNING: 'text-warning',
    NOTICE: 'text-accent',
    INFO: 'text-accent',
    DEBUG: 'text-ink-faint',
  };
  return (
    <span className="whitespace-pre-wrap break-words">
      <span className="text-ink-faint">[{timestamp}]</span>{' '}
      <span className={levelColor[level] || 'text-accent'}>{level}:</span>{' '}
      <HighlightedLine text={line.slice(match[0].length)} query={query} />
    </span>
  );
};

const TAIL_DEFAULT = 5000;

interface LaravelLogsTabProps {
  projectPath: string;
}

export default function LaravelLogsTab({ projectPath }: LaravelLogsTabProps) {
  const [files, setFiles] = useState<LaravelLogFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [content, setContent] = useState('');
  const [lineCount, setLineCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [stickToBottom, setStickToBottom] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);

  const refreshFiles = useCallback(async (): Promise<void> => {
    const result = await ipc.listLaravelLogs(projectPath);
    if (result.success) {
      const list = result.files || [];
      setFiles(list);
      setSelectedFile((current) => (current && list.some((f) => f.name === current) ? current : list[0]?.name || ''));
    } else {
      setError(result.error || 'Failed to list log files');
    }
  }, [projectPath]);

  const loadFile = useCallback(async (fileName: string, stick = true): Promise<void> => {
    if (!fileName) return;
    setLoading(true);
    setError(null);
    const result = await ipc.readLaravelLog(projectPath, fileName, TAIL_DEFAULT);
    setLoading(false);
    if (result.success) {
      setContent(result.content || '');
      setLineCount(result.lineCount ?? 0);
      if (stick) setStickToBottom(true);
    } else {
      setError(result.error || 'Failed to read log file');
    }
  }, [projectPath]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    if (selectedFile) loadFile(selectedFile);
  }, [selectedFile, loadFile]);

  // Scroll to bottom when content (re)loads while stuck to bottom.
  useEffect(() => {
    if (stickToBottom && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [stickToBottom, content, filter]);

  const handleScroll = (): void => {
    const el = outputRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setStickToBottom(atBottom);
  };

  const jumpToLatest = (): void => {
    setStickToBottom(true);
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  };

  const lines = useMemo(() => {
    const raw = stripAnsi(content).split('\n');
    const query = filter.trim().toLowerCase();
    return query ? raw.filter((line) => line.toLowerCase().includes(query)) : raw;
  }, [content, filter]);

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon name="fileText" size={14} className="text-ink-faint" />
          <select
            value={selectedFile}
            onChange={(event) => setSelectedFile(event.target.value)}
            aria-label="Select Laravel log file"
            className="bg-surface-3 border border-border rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none"
          >
            {files.length === 0 ? <option value="">No log files</option> : files.map((file) => <option key={file.name} value={file.name}>{file.name}</option>)}
          </select>
          {files.length > 0 && (
            <span className="font-mono text-[10px] text-ink-faint">
              {formatBytes(files.find((f) => f.name === selectedFile)?.size || 0)}
            </span>
          )}
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search logs..."
            aria-label="Search Laravel logs"
            className="bg-surface-3 border border-border rounded-md px-2.5 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none w-44"
          />
        </div>
        <div className="flex items-center gap-3">
          {lineCount > 0 && <span className="font-mono text-[10px] text-ink-faint">tail {lineCount} lines</span>}
          <button
            type="button"
            onClick={() => loadFile(selectedFile, true)}
            disabled={!selectedFile || loading}
            title="Reload log file"
            aria-label="Reload Laravel log"
            className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink disabled:opacity-40 transition-colors"
          >
            <Icon name="refreshCw" size={12} /> Reload
          </button>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-danger">{error}</p>}

      <div className="relative">
        {!stickToBottom && lines.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-white text-[11px] font-semibold shadow-glow hover:bg-accent-hover transition-colors"
          >
            <Icon name="arrowDown" size={12} />
            Jump to latest
          </button>
        )}
        <div
          ref={outputRef}
          onScroll={handleScroll}
          className="scan-line bg-[#08090C] px-5 py-4 font-mono text-[12.5px] leading-relaxed h-72 overflow-y-auto"
        >
          {loading ? (
            <p className="text-ink-faint italic">Loading log...</p>
          ) : lines.length === 0 ? (
            <p className="text-ink-faint italic">{content ? 'No lines match this filter.' : 'No log entries found. Logs appear in storage/logs after the app writes them.'}</p>
          ) : (
            lines.map((line, index) => (
              <p key={`${selectedFile}-${index}`} className="whitespace-pre-wrap break-words">
                <LaravelLine line={line} query={filter.trim()} />
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
