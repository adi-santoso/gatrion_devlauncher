import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';
import type { ProjectRuntime } from '../../hooks/useProjects';
import { useDetailI18n } from './useDetailI18n';

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border`;

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatDate(iso: string | number | Date | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const date = new Date(iso);
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface CrashRecord {
  message?: string;
  timestamp?: string | number;
  code?: number | string | null;
  [key: string]: unknown;
}

interface RunRecord {
  start: string | number;
  uptimeMs: number;
  code?: number | string | null;
  [key: string]: unknown;
}

interface DailySample {
  date: string;
  avgCpu?: number;
  avgMem?: number;
  [key: string]: unknown;
}

interface HealthStatsView {
  totalRuns: number;
  totalUptimeMs: number;
  avgUptimeMs: number;
  lastRun: { end: string } | null;
  crashes: CrashRecord[];
  runs: RunRecord[];
  daily: DailySample[];
}

interface BarChartProps {
  daily: DailySample[];
  valueKey: 'avgCpu' | 'avgMem';
  color: string;
  label: string;
}

// Simple bar chart drawn with divs — no chart dependency needed.
function BarChart({ daily, valueKey, color, label }: BarChartProps) {
  const t = useDetailI18n();
  if (!daily || daily.length === 0) return <p className="py-6 text-center text-sm text-ink-faint">{t('No resource samples yet — run the project to collect data.')}</p>;
  const values = daily.map((day) => day[valueKey] ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div>
      <p className="text-xs text-ink-soft mb-2">{t('Scale: 0–{max} {label}', { max: max.toFixed(1), label })}</p>
      <div className="flex items-end gap-1 h-24">
        {daily.map((day) => {
          const value = day[valueKey] ?? 0;
          const height = Math.max(4, Math.round((value / max) * 88));
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center justify-end group" title={`${day.date}: avg ${day[valueKey]}${label}`}>
              <div className={`w-full max-w-[18px] rounded-t ${color} transition-[height] duration-300`} style={{ height: `${height}px` }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-ink-faint font-mono">
        <span>{daily[0]?.date?.slice(5)}</span>
        <span>{daily[daily.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

interface AnalyticsTabProps {
  project: ProjectRuntime | null;
  active?: boolean;
}

export default function AnalyticsTab(props: AnalyticsTabProps) {
  return <ProjectAnalytics key={props.project?.id} {...props} />;
}
function ProjectAnalytics({ project, active = true }: AnalyticsTabProps) {
  const t = useDetailI18n();
  const [stats, setStats] = useState<HealthStatsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const requestRef = useRef(0);
  const [updated, setUpdated] = useState('');
  useEffect(() => () => { requestRef.current++; }, []);

  const refresh = useCallback(async () => {
    if (!project?.id) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.getHealth(project.id);
      if (request !== requestRef.current) return;
      if (!result.success) throw new Error(result.error || t('Failed to load analytics'));
      setStats(result.stats as unknown as HealthStatsView);
      setUpdated(new Date().toLocaleTimeString());
    } catch (cause) { if (request === requestRef.current) setError(String(cause)); }
    finally { if (request === requestRef.current) setLoading(false); }
  }, [project?.id, t]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh, active, project?.status]);

  const handleClear = async (): Promise<void> => {
    setConfirmClear(false);
    try {
      const result = await ipc.clearHealth(project!.id);
      if (!result.success) throw new Error(result.error || t('Failed to clear history'));
      await refresh();
    } catch (cause) { setError(String(cause)); }
  };

  if (loading && !stats) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-4 space-y-3">
        <div className="skeleton h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
        </div>
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  if (error) return <div><p role="alert" className="text-sm text-danger">{error}</p><button onClick={refresh} className={btnSecondary}>{t('Retry')}</button></div>;
  if (!stats) return null;

  const hasData = stats.totalRuns > 0 || stats.crashes.length > 0 || stats.daily.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3"><p className="text-xs text-ink-soft">{t('Retained history: up to 200 completed runs and 100 crashes. Updated {time}', { time: updated })}</p><button disabled={loading} onClick={refresh} className={btnSecondary}>{t('Refresh')}</button></div>
      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-surface border border-border rounded-xl shadow-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint">{t('Total runs')}</p>
          <p className="text-2xl font-display font-bold text-ink mt-1">{stats.totalRuns}</p>
          <p className="text-[10px] text-ink-faint mt-0.5">{t('avg {duration} / run', { duration: formatDuration(stats.avgUptimeMs) })}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl shadow-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint">{t('Total uptime')}</p>
          <p className="text-2xl font-display font-bold text-ink mt-1">{formatDuration(stats.totalUptimeMs)}</p>
          <p className="text-[10px] text-ink-faint mt-0.5">{t('last {date}', { date: stats.lastRun ? formatDate(new Date(stats.lastRun.end)) : '—' })}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl shadow-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint">{t('Crashes')}</p>
          <p className={`text-2xl font-display font-bold mt-1 ${stats.crashes.length > 0 ? 'text-danger' : 'text-ink'}`}>{stats.crashes.length}</p>
          <p className="text-[10px] text-ink-faint mt-0.5">{stats.crashes.length > 0 ? t('{count} unexpected exit(s)', { count: stats.crashes.length }) : t('no unexpected exits')}</p>
        </div>
      </div>

      {!hasData && (
        <div className="bg-surface border border-border rounded-xl shadow-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-ink-soft mx-auto mb-3">
            <Icon name="chart" size={20} />
          </div>
          <h3 className="font-display font-bold text-base text-ink">{t('No analytics yet')}</h3>
          <p className="text-xs text-ink-faint mt-1.5 leading-relaxed max-w-md mx-auto">
            {t('Run this project to start collecting run history, uptime, crash data, and daily CPU/memory trends.')}
          </p>
        </div>
      )}

      {/* Daily resource trends */}
      {stats.daily.length > 0 && (
        <div className="bg-surface border border-border rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-ink">{t('Daily resource trends')}</p>
            <span className="text-[10px] text-ink-faint">{t('{count} day(s) tracked', { count: stats.daily.length })}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] text-ink-faint mb-1">{t('CPU — daily average (%)')}</p>
              <BarChart daily={stats.daily} valueKey="avgCpu" color="bg-accent" label="% CPU" />
            </div>
            <div>
              <p className="text-[10px] text-ink-faint mb-1">{t('Memory — daily average (MB)')}</p>
              <BarChart daily={stats.daily} valueKey="avgMem" color="bg-success" label=" MB" />
            </div>
          </div>
        </div>
      )}

      {/* Crash history */}
      {stats.crashes.length > 0 && (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2">
            <p className="text-xs font-semibold text-ink">{t('Crash history')}</p>
          </div>
          <ul className="divide-y divide-border/50">
            {stats.crashes.slice(0, 10).map((crash, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className="w-6 h-6 rounded-full bg-danger/10 text-danger flex items-center justify-center shrink-0">
                  <Icon name="warn" size={12} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-ink truncate">{crash.message || t('Unexpected exit')}</p>
                  <p className="text-[10px] text-ink-faint mt-0.5">
                    {formatDate(crash.timestamp)}
                    {crash.code != null && <> · exit code {crash.code}</>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent runs */}
      {stats.runs.length > 0 && (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2">
            <p className="text-xs font-semibold text-ink">{t('Recent runs')}</p>
          </div>
          <ul className="divide-y divide-border/50">
            {stats.runs.slice(0, 10).map((run, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  run.code ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                }`}>
                  <Icon name={run.code ? 'warn' : 'check'} size={12} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-ink">{formatDate(run.start)}</p>
                  <p className="text-[10px] text-ink-faint mt-0.5">
                    {t('ran for {duration}', { duration: formatDuration(run.uptimeMs) })}
                    {run.code != null && ` · exit code ${run.code}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasData && (
        <div className="flex items-center justify-end">
          <button onClick={() => setConfirmClear(true)} className={`${btnSecondary} text-danger border-danger/25`}>
            <Icon name="trash" size={13} />
            {t('Clear history')}
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClear}
        title={t('Clear Analytics')}
        message={t('Delete all crash history, run records, and resource samples for this project? This cannot be undone.')}
        confirmLabel={t('Clear')}
        confirmVariant="danger"
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
