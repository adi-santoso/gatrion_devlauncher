/**
 * Server detail: Overview / Services / Logs / Terminal plus the remote job list.
 * Polling stops the moment the server is disconnected (D8) — no background
 * monitoring is promised while the desktop is away.
 */
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18nContext'
import type { VpsJob, VpsOverview, VpsServer, VpsServerStatus, VpsService } from '../../types/vps'
import { cancelVpsJob, getVpsLogs, getVpsOverview, listVpsJobs, listVpsServices, onVpsJobEvent, restartVpsService } from '../../data/vps'
import VpsTerminal from './VpsTerminal'
import { connectionColor, connectionLabel, formatMb, formatPercent, formatUptime } from './vpsUtils'

const TABS = ['overview', 'services', 'logs', 'terminal'] as const
type Tab = (typeof TABS)[number]

interface VpsDetailPanelProps {
  server: VpsServer
  status: VpsServerStatus | undefined
  terminalFontSize?: number
}

export default function VpsDetailPanel({ server, status, terminalFontSize }: VpsDetailPanelProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<VpsOverview | null>(null)
  const [services, setServices] = useState<VpsService[]>([])
  const [jobs, setJobs] = useState<VpsJob[]>([])
  const [logs, setLogs] = useState<{ service: string; output: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = status?.state || 'disconnected'
  const connected = state === 'connected'
  const terminalKey = `${server.id}:${status?.connectedAt}`
  const [openedTerminalKey, setOpenedTerminalKey] = useState<string | null>(null)

  // Open lazily, then retain the shell and scrollback until this connection ends.
  useEffect(() => {
    if (!connected) setOpenedTerminalKey(null)
    else if (tab === 'terminal') setOpenedTerminalKey(terminalKey)
  }, [connected, tab, terminalKey])

  const refreshJobs = useCallback(async (): Promise<void> => {
    const result = await listVpsJobs(server.id, 15)
    if (result?.success) setJobs(result.jobs)
  }, [server.id])

  useEffect(() => {
    setOverview(null)
    setServices([])
    setJobs([])
    setLogs(null)
    setError(null)
    setTab('overview')
    void refreshJobs()
  }, [server.id, refreshJobs])

  // Overview polling — only while connected.
  useEffect(() => {
    if (!connected) return
    let cancelled = false
    const tick = async (): Promise<void> => {
      const result = await getVpsOverview(server.id)
      if (cancelled) return
      if (result?.success) setOverview(result.overview)
      else setError(result?.error || null)
    }
    void tick()
    const timer = window.setInterval(tick, 10000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [connected, server.id])

  useEffect(() => {
    const unsub = onVpsJobEvent((event) => {
      if (event.serverId !== server.id) return
      setJobs((prev) => {
        const next = prev.filter((job) => job.id !== event.job.id)
        return [event.job, ...next].slice(0, 15)
      })
    })
    return unsub
  }, [server.id])

  const loadServices = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await listVpsServices(server.id)
      if (result?.success) setServices(result.services)
      else setError(result?.error || t('vps.loadFailed'))
    } finally {
      setBusy(false)
    }
  }

  const openLogs = async (service: string): Promise<void> => {
    setBusy(true)
    setError(null)
    setTab('logs')
    try {
      const result = await getVpsLogs(server.id, service, 300)
      setLogs({ service, output: result?.output || result?.error || '' })
    } finally {
      setBusy(false)
    }
  }

  const restart = async (service: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await restartVpsService(server.id, service)
      if (!result?.success || result.ok === false) setError(result?.detail || result?.error || t('vps.restartFailed'))
      else await loadServices()
      await refreshJobs()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <header className="px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-bold text-ink truncate">{server.name}</h2>
            <span className={`text-[10px] font-mono ${connectionColor(state)}`}>{connectionLabel(state)}</span>
          </div>
          <p className="mt-0.5 text-[11px] font-mono text-ink-faint truncate">
            {server.username}@{server.host}:{server.port} · {server.environment} · {server.policy}
          </p>
        </div>
      </header>

      <nav className="flex items-center gap-1 px-3 py-2 border-b border-border" aria-label={t('vps.detailTabs')}>
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => { setTab(item); if (item === 'services' && connected && services.length === 0) void loadServices() }}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${tab === item ? 'bg-accent/15 text-accent' : 'text-ink-soft hover:bg-surface-3'}`}
          >
            {t(`vps.tab.${item}`)}
          </button>
        ))}
        {busy && <span className="ml-2 text-[10px] text-ink-faint">{t('vps.loading')}</span>}
        {error && <span className="ml-auto text-[10px] text-danger truncate max-w-[40%]">{error}</span>}
      </nav>

      <div className="flex-1 min-h-0 overflow-hidden">
        {!connected && tab !== 'terminal' && (
          <p className="p-4 text-xs text-ink-faint">{t('vps.notConnectedHint')}</p>
        )}

        {tab === 'overview' && connected && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric label={t('vps.cpu')} value={formatPercent(overview?.metrics.cpuPercent ?? null)} stale={overview?.metrics.stale} />
              <Metric label={t('vps.memory')} value={overview ? `${formatMb(overview.metrics.memUsedMb)} / ${formatMb(overview.metrics.memTotalMb)}` : '—'} stale={overview?.metrics.stale} />
              <Metric label={t('vps.disk')} value={formatPercent(overview?.metrics.diskUsedPercent ?? null)} stale={overview?.metrics.stale} />
              <Metric label={t('vps.uptime')} value={formatUptime(overview?.metrics.uptimeSec ?? null)} stale={overview?.metrics.stale} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              <Row label={t('vps.hostname')} value={overview?.hostname} />
              <Row label={t('vps.os')} value={overview?.os} />
              <Row label={t('vps.kernel')} value={overview?.kernel} />
              <Row label={t('vps.workingDir')} value={overview?.cwd} />
              <Row label={t('vps.loadAvg')} value={overview?.metrics.loadAvg ? overview.metrics.loadAvg.join('  ') : null} />
              <Row label={t('vps.sampledAt')} value={overview?.metrics.sampledAt ? new Date(overview.metrics.sampledAt).toLocaleTimeString() : null} />
            </dl>
            {overview?.error && <p className="text-[11px] text-warning">{overview.error}</p>}
          </div>
        )}

        {tab === 'services' && connected && (
          <div className="h-full overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-surface-2 text-ink-faint">
                <tr>
                  <th className="text-left font-medium px-3 py-2">{t('vps.service')}</th>
                  <th className="text-left font-medium px-3 py-2">{t('vps.state')}</th>
                  <th className="text-left font-medium px-3 py-2">{t('vps.description')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.name} className="border-t border-border/60">
                    <td className="px-3 py-1.5 font-mono text-ink-soft truncate max-w-[240px]">{service.name}</td>
                    <td className="px-3 py-1.5">
                      <span className={service.active === 'active' ? 'text-success' : service.active === 'failed' ? 'text-danger' : 'text-ink-faint'}>
                        {service.active}/{service.sub}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-ink-faint truncate max-w-[280px]">{service.description}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => void openLogs(service.name)} className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-surface-3 mr-1">
                        {t('vps.viewLogs')}
                      </button>
                      <button type="button" onClick={() => void restart(service.name)} disabled={busy} className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-surface-3 disabled:opacity-50">
                        {t('vps.restart')}
                      </button>
                    </td>
                  </tr>
                ))}
                {services.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-faint">{t('vps.noServices')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'logs' && (
          <div className="h-full flex flex-col min-h-0">
            {logs && <p className="px-3 py-1 text-[10px] font-mono text-ink-faint border-b border-border">{logs.service}</p>}
            <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-ink-soft whitespace-pre-wrap">{logs?.output || t('vps.pickServiceForLogs')}</pre>
          </div>
        )}

        {connected && openedTerminalKey === terminalKey && (
          <div className={tab === 'terminal' ? 'h-full' : 'hidden'}>
            <VpsTerminal key={terminalKey} serverId={server.id} fontSize={terminalFontSize} />
          </div>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="border-t border-border max-h-40 overflow-y-auto">
          <p className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-ink-faint">{t('vps.recentJobs')}</p>
          {jobs.map((job) => (
            <div key={job.id} className="px-3 py-1 flex items-center gap-2 text-[11px] border-t border-border/50">
              <span className={`font-mono ${job.state === 'succeeded' ? 'text-success' : job.state === 'failed' ? 'text-danger' : job.state === 'unknown' || job.state === 'cancelled' ? 'text-warning' : 'text-ink-faint'}`}>{job.state}</span>
              <span className="font-mono text-ink-faint truncate flex-1">{job.command}</span>
              <span className="font-mono text-ink-faint">{job.exitCode === null ? '—' : `exit ${job.exitCode}`}</span>
              {(job.state === 'running' || job.state === 'queued') && (
                <button type="button" onClick={() => { void cancelVpsJob(job.id).then(refreshJobs) }} className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-surface-3">
                  {t('vps.cancelJob')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, stale }: { label: string; value: string; stale?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-lg font-bold ${stale ? 'text-ink-faint' : 'text-ink'}`}>{value}</p>
      {stale && <p className="text-[9px] text-warning">{'stale'}</p>}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <dt className="text-ink-faint shrink-0">{label}</dt>
      <dd className="font-mono text-ink-soft truncate">{value || '—'}</dd>
    </div>
  )
}
