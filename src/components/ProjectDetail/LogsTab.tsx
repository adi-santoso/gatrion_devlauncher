import { useEffect, useMemo, useRef, useState } from 'react';
import { Fragment } from 'react';
import type { JSX } from 'react';
import Icon from '../Common/Icon';
import VirtualList from '../Common/VirtualList';
import type { ProcessLogLine } from '../../data/processes';
import { useDetailI18n } from './useDetailI18n';

const stripAnsi = (value: unknown): string => String(value ?? '')
  .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

export interface NormalizedLog {
  message: string;
  level: string;
  timestamp: string | number | null;
  commandName: string | null;
}

const normalizeLog = (log: unknown): NormalizedLog => {
  if (typeof log === 'string' || typeof log === 'number' || typeof log === 'boolean') {
    return { message: stripAnsi(log), level: 'info', timestamp: null, commandName: null };
  }
  if (!log || typeof log !== 'object') return { message: '', level: 'info', timestamp: null, commandName: null };

  const record = log as Record<string, unknown>;
  let message = record.message ?? record.text ?? record.data ?? record.output ?? '';
  if (message instanceof Error) message = message.message;
  if (typeof message === 'object') {
    try { message = JSON.stringify(message); } catch { message = String(message); }
  }
  return {
    message: stripAnsi(message),
    level: String(record.level ?? record.type ?? record.stream ?? 'info').toLowerCase(),
    timestamp: (record.timestamp as string | number | null | undefined) ?? (record.time as string | number | null | undefined) ?? null,
    commandName: (record.commandName as string | null | undefined) ?? null,
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
const HighlightedMessage = ({ text, query }: { text: string; query: string }): JSX.Element => {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {parts.map((part, index) => (
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={index} className="bg-yellow-500/30 text-inherit rounded-[2px] px-0.5">{part}</mark>
          : <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
};

interface LogsTabProps {
  logs?: ProcessLogLine[] | ProcessLogLine | string;
  autoScroll?: boolean;
  onAutoScrollChange?: (value: boolean) => void;
  onClear?: () => void;
  fontSize?: number;
}

export default function LogsTab({ logs = [], autoScroll = true, onAutoScrollChange, onClear, fontSize }: LogsTabProps) {
  const t = useDetailI18n();
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [source, setSource] = useState('all');
  const [copyNotice, setCopyNotice] = useState('');
  // When the user scrolls up to read older lines, stop forcing the view to the
  // bottom; offer a "jump to latest" affordance instead.
  const [stickToBottom, setStickToBottom] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const normalizedLogs = useMemo(() => (Array.isArray(logs) ? logs : [logs]).map(normalizeLog), [logs]);
  const query = filter.trim().toLowerCase();

  const visibleLogs = useMemo(() => normalizedLogs.filter((log) => {
    if (source !== 'all' && log.commandName !== source) return false;
    if (typeFilter !== 'all' && log.level !== typeFilter && !(typeFilter === 'warn' && (log.level === 'warning' || log.level === 'warn'))) {
      return false;
    }
    if (!query) return true;
    const text = `${log.commandName || ''} ${log.level} ${log.message}`.toLowerCase();
    return text.includes(query);
  }), [normalizedLogs, query, typeFilter, source]);

  const handleScroll = (): void => {
    const el = outputRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop || 0);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setStickToBottom(atBottom);
  };

  const jumpToLatest = (): void => {
    setStickToBottom(true);
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  };

  useEffect(() => {
    if (autoScroll && stickToBottom && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [autoScroll, stickToBottom, visibleLogs.length, filter, typeFilter]);

  const getLogColor = (level: string): string => ({ ready: 'text-success', warn: 'text-warning', warning: 'text-warning', error: 'text-danger', stderr: 'text-danger' }[level] || 'text-ink-soft');

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('Search logs...')} aria-label={t('Search logs')} className="bg-surface-3 border border-border rounded-md px-2.5 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none w-44"/>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label={t('Filter log type')} className="bg-surface-3 border border-border rounded-md px-2 py-1 text-xs text-ink-soft focus:outline-none">
            {LOG_TYPES.map((type) => <option key={type.value} value={type.value}>{t(type.label)}</option>)}
          </select>
          <select aria-label={t('Log source')} value={source} onChange={event => setSource(event.target.value)} className="bg-surface-3 text-xs rounded-md px-2 py-1"><option value="all">{t('All commands')}</option>{[...new Set(normalizedLogs.map(log => log.commandName).filter(Boolean))].map(name => <option key={name} value={name!}>{name}</option>)}</select>
          {(query || typeFilter !== 'all') && (
            <span className="font-mono text-[10px] text-ink-faint" aria-live="polite">
              {t('{count} of {total}', { count: visibleLogs.length, total: normalizedLogs.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs" onClick={async () => { try { await navigator.clipboard.writeText(visibleLogs.map(log => `${log.timestamp || ''} [${log.commandName || log.level}] ${log.message}`).join('\n')); setCopyNotice('Copied filtered output'); } catch { setCopyNotice('Could not copy output'); } }}>{t('Copy output')}</button>
          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint"><input type="checkbox" checked={autoScroll} onChange={(event) => onAutoScrollChange?.(event.target.checked)} className="w-3 h-3 accent-accent"/>{t('Auto-scroll')}</label>
          <button type="button" onClick={onClear} disabled={!onClear} className="inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><Icon name="trash" size={12} /> {t('Clear')}</button>
        </div>
      </div>
      {copyNotice && <p role="status" className="text-xs px-3">{t(copyNotice)}</p>}
      <div className="relative">
        {autoScroll && !stickToBottom && visibleLogs.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-white text-[11px] font-semibold shadow-glow hover:bg-accent-hover transition-colors"
          >
            <Icon name="arrowDown" size={12} />
            {t('Jump to latest')}
          </button>
        )}
        <div ref={outputRef} onScroll={handleScroll} style={{ fontSize: fontSize ? `${fontSize}px` : undefined, resize: 'vertical', minHeight: 160 }} className="scan-line bg-[#08090C] px-4 py-3 font-mono text-[12.5px] leading-relaxed h-64 overflow-auto">
        {visibleLogs.length === 0 ? <p className="text-ink-faint italic">{t(normalizedLogs.length === 0 ? 'No logs captured yet.' : 'No logs match this filter.')}</p>
          : <VirtualList
              items={visibleLogs}
              scrollRef={outputRef}
              scrollTop={scrollTop}
              estimatedHeight={20}
              renderItem={(log) => {
                const parsedTime = log.timestamp ? new Date(log.timestamp) : null;
                const time = parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime.toLocaleTimeString() : '';
                return <p className={`whitespace-pre-wrap break-words ${getLogColor(log.level)}`}>
                  {time && <span className="text-ink-faint mr-1.5">{time}</span>}
                  {log.commandName && <span className="text-accent mr-1.5">[{log.commandName}]</span>}
                  {log.level !== 'info' && <span className="mr-1.5">[{log.level.toUpperCase()}]</span>}<HighlightedMessage text={log.message} query={filter.trim()} />
                </p>;
              }}
              getKey={(log, index) => `${log.timestamp || 'log'}-${index}`}
            />}
        </div>
      </div>
    </div>
  );
}
