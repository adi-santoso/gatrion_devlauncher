import React, { useEffect, useRef, useState } from 'react';

const stripAnsi = (value) => String(value ?? '')
  .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

const normalizeLog = (log) => {
  if (typeof log === 'string' || typeof log === 'number' || typeof log === 'boolean') {
    return { message: stripAnsi(log), level: 'info', timestamp: null };
  }
  if (!log || typeof log !== 'object') return { message: '', level: 'info', timestamp: null };

  let message = log.message ?? log.text ?? log.data ?? log.output ?? '';
  if (message instanceof Error) message = message.message;
  if (typeof message === 'object') {
    try { message = JSON.stringify(message); } catch { message = String(message); }
  }
  return {
    message: stripAnsi(message),
    level: String(log.level ?? log.type ?? log.stream ?? 'info').toLowerCase(),
    timestamp: log.timestamp ?? log.time ?? null
  };
};

export default function LogsTab({ logs = [], autoScroll = true, onAutoScrollChange, onClear }) {
  const [filter, setFilter] = useState('');
  const outputRef = useRef(null);
  const normalizedLogs = (Array.isArray(logs) ? logs : [logs]).map(normalizeLog);
  const query = filter.trim().toLowerCase();
  const visibleLogs = normalizedLogs.filter((log) => !query || `${log.level} ${log.message}`.toLowerCase().includes(query));

  useEffect(() => {
    if (autoScroll && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [autoScroll, logs, filter]);

  const getLogColor = (level) => ({ ready: 'text-success', warn: 'text-warning', warning: 'text-warning', error: 'text-danger', stderr: 'text-danger' }[level] || 'text-ink-soft');

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter logs..." aria-label="Filter logs" className="bg-surface-3 border border-border rounded-md px-2.5 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none w-48"/>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint"><input type="checkbox" checked={autoScroll} onChange={(event) => onAutoScrollChange?.(event.target.checked)} className="w-3 h-3 accent-accent"/>Auto-scroll</label>
          <button type="button" onClick={onClear} disabled={!onClear} className="text-[11px] text-ink-faint hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed">Clear</button>
        </div>
      </div>
      <div ref={outputRef} className="scan-line bg-[#08090C] px-5 py-4 font-mono text-[12.5px] leading-relaxed h-72 overflow-y-auto">
        {visibleLogs.length === 0 ? <p className="text-ink-faint italic">{normalizedLogs.length === 0 ? 'No logs captured yet.' : 'No logs match this filter.'}</p>
          : visibleLogs.map((log, index) => {
            const parsedTime = log.timestamp ? new Date(log.timestamp) : null;
            const time = parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime.toLocaleTimeString() : '';
            return <p key={`${log.timestamp || 'log'}-${index}`} className={`whitespace-pre-wrap break-words ${getLogColor(log.level)}`}>
              {time && <span className="text-ink-faint mr-1.5">{time}</span>}
              {log.level !== 'info' && <span className="mr-1.5">[{log.level.toUpperCase()}]</span>}{log.message}
            </p>;
          })}
      </div>
    </div>
  );
}
