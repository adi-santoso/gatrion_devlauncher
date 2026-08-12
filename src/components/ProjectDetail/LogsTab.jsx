import React, { useEffect, useMemo, useRef, useState } from 'react';

const stripAnsi = (value) => String(value ?? '')
  .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

const normalizeLog = (log) => {
  if (typeof log === 'string' || typeof log === 'number' || typeof log === 'boolean') {
    return { message: stripAnsi(log), level: 'info', timestamp: null, commandName: null };
  }
  if (!log || typeof log !== 'object') return { message: '', level: 'info', timestamp: null, commandName: null };

  let message = log.message ?? log.text ?? log.data ?? log.output ?? '';
  if (message instanceof Error) message = message.message;
  if (typeof message === 'object') {
    try { message = JSON.stringify(message); } catch { message = String(message); }
  }
  return {
    message: stripAnsi(message),
    level: String(log.level ?? log.type ?? log.stream ?? 'info').toLowerCase(),
    timestamp: log.timestamp ?? log.time ?? null,
    commandName: log.commandName ?? null
  };
};

const LOG_TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'stdout', label: 'stdout' },
  { value: 'stderr', label: 'stderr' },
  { value: 'error', label: 'error' },
  { value: 'warn', label: 'warn' },
  { value: 'system', label: 'system' },
];

// Render message with <mark> around case-insensitive matches
const HighlightedMessage = ({ text, query }) => {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return parts.map((part, index) => (
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={index} className="bg-yellow-500/30 text-inherit rounded-[2px] px-0.5">{part}</mark>
      : <React.Fragment key={index}>{part}</React.Fragment>
  ));
};

export default function LogsTab({ logs = [], autoScroll = true, onAutoScrollChange, onClear, fontSize }) {
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  // When the user scrolls up to read older lines, stop forcing the view to the
  // bottom; offer a "jump to latest" affordance instead.
  const [stickToBottom, setStickToBottom] = useState(true);
  const outputRef = useRef(null);
  const normalizedLogs = useMemo(() => (Array.isArray(logs) ? logs : [logs]).map(normalizeLog), [logs]);
  const query = filter.trim().toLowerCase();

  const visibleLogs = useMemo(() => normalizedLogs.filter((log) => {
    if (typeFilter !== 'all' && log.level !== typeFilter && !(typeFilter === 'warn' && (log.level === 'warning' || log.level === 'warn'))) {
      return false;
    }
    if (!query) return true;
    const levelMatch = typeFilter === 'all' || log.level === typeFilter;
    const text = `${log.commandName || ''} ${log.level} ${log.message}`.toLowerCase();
    return levelMatch && text.includes(query);
  }), [normalizedLogs, query, typeFilter]);

  const handleScroll = () => {
    const el = outputRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setStickToBottom(atBottom);
  };

  const jumpToLatest = () => {
    setStickToBottom(true);
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  };

  useEffect(() => {
    if (autoScroll && stickToBottom && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [autoScroll, stickToBottom, visibleLogs.length, filter, typeFilter]);

  const getLogColor = (level) => ({ ready: 'text-success', warn: 'text-warning', warning: 'text-warning', error: 'text-danger', stderr: 'text-danger' }[level] || 'text-ink-soft');

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search logs..." aria-label="Search logs" className="bg-surface-3 border border-border rounded-md px-2.5 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none w-44"/>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter log type" className="bg-surface-3 border border-border rounded-md px-2 py-1 text-xs text-ink-soft focus:outline-none">
            {LOG_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          {(query || typeFilter !== 'all') && (
            <span className="font-mono text-[10px] text-ink-faint" aria-live="polite">
              {visibleLogs.length} of {normalizedLogs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint"><input type="checkbox" checked={autoScroll} onChange={(event) => onAutoScrollChange?.(event.target.checked)} className="w-3 h-3 accent-accent"/>Auto-scroll</label>
          <button type="button" onClick={onClear} disabled={!onClear} className="text-[11px] text-ink-faint hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed">Clear</button>
        </div>
      </div>
      <div className="relative">
        {autoScroll && !stickToBottom && visibleLogs.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-accent text-white text-[11px] font-semibold shadow-glow hover:bg-accent-hover transition-colors"
          >
            ↓ Jump to latest
          </button>
        )}
        <div ref={outputRef} onScroll={handleScroll} style={fontSize ? { fontSize: `${fontSize}px` } : undefined} className="scan-line bg-[#08090C] px-5 py-4 font-mono text-[12.5px] leading-relaxed h-72 overflow-y-auto">
        {visibleLogs.length === 0 ? <p className="text-ink-faint italic">{normalizedLogs.length === 0 ? 'No logs captured yet.' : 'No logs match this filter.'}</p>
          : visibleLogs.map((log, index) => {
            const parsedTime = log.timestamp ? new Date(log.timestamp) : null;
            const time = parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime.toLocaleTimeString() : '';
            return <p key={`${log.timestamp || 'log'}-${index}`} className={`whitespace-pre-wrap break-words ${getLogColor(log.level)}`}>
              {time && <span className="text-ink-faint mr-1.5">{time}</span>}
              {log.commandName && <span className="text-accent mr-1.5">[{log.commandName}]</span>}
              {log.level !== 'info' && <span className="mr-1.5">[{log.level.toUpperCase()}]</span>}<HighlightedMessage text={log.message} query={filter.trim()} />
            </p>;
          })}
        </div>
      </div>
    </div>
  );
}
