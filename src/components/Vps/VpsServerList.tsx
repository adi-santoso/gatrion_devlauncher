/**
 * VPS server list — search, add, connect/disconnect, and per-server status.
 * Composition follows the existing Agent session sidebar.
 */
import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n/I18nContext'
import type { VpsServer, VpsServerStatus } from '../../types/vps'
import { connectionColor, connectionLabel, environmentBadge } from './vpsUtils'

interface VpsServerListProps {
  servers: VpsServer[]
  statuses: Record<string, VpsServerStatus | undefined>
  selectedId: string | null
  onSelect: (server: VpsServer) => void
  onAdd: () => void
  onEdit: (server: VpsServer) => void
  onConnect: (server: VpsServer) => void
  onDisconnect: (server: VpsServer) => void
}

export default function VpsServerList({
  servers,
  statuses,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onConnect,
  onDisconnect,
}: VpsServerListProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return servers
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.host.toLowerCase().includes(needle) ||
        s.tags.some((tag) => tag.toLowerCase().includes(needle)),
    )
  }, [servers, query])

  return (
    <aside className="w-[264px] shrink-0 border-r border-border bg-surface flex flex-col min-h-0" aria-label={t('vps.servers')}>
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-ink-faint">{t('vps.servers')}</span>
          <span className="text-[10px] font-mono text-ink-faint">{servers.length}</span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('vps.searchServers')}
          aria-label={t('vps.searchServers')}
          className="w-full rounded-lg bg-surface-2 border border-border px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-accent"
        />
        <button
          type="button"
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors"
        >
          <span aria-hidden="true">+</span> {t('vps.addServer')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-ink-faint">{t('vps.noServers')}</p>
        )}
        {filtered.map((server) => {
          const status = statuses[server.id]
          const state = status?.state || 'disconnected'
          const isSelected = selectedId === server.id
          const connected = state === 'connected'
          return (
            <div
              key={server.id}
              className={`rounded-lg border px-2.5 py-2 transition-colors ${isSelected ? 'border-accent/40 bg-accent/10' : 'border-transparent hover:bg-surface-3'}`}
            >
              <button type="button" onClick={() => onSelect(server)} className="w-full text-left">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-success' : state === 'error' ? 'bg-danger' : 'bg-ink-faint'}`} aria-hidden="true" />
                  <span className="flex-1 min-w-0 truncate text-xs font-semibold text-ink">{server.name}</span>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${environmentBadge(server.environment)}`}>
                    {server.environment.slice(0, 4)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-ink-faint">
                  <span className="truncate">{server.username}@{server.host}:{server.port}</span>
                  <span className={`ml-auto shrink-0 ${connectionColor(state)}`}>{connectionLabel(state)}</span>
                </div>
              </button>
              <div className="mt-1.5 flex items-center gap-1.5">
                {connected ? (
                  <button type="button" onClick={() => onDisconnect(server)} className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-surface-3">
                    {t('vps.disconnect')}
                  </button>
                ) : (
                  <button type="button" onClick={() => onConnect(server)} className="text-[10px] rounded border border-accent/40 text-accent px-1.5 py-0.5 hover:bg-accent/10">
                    {t('vps.connect')}
                  </button>
                )}
                <button type="button" onClick={() => onEdit(server)} className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-surface-3">
                  {t('vps.edit')}
                </button>
                <span className="ml-auto text-[9px] font-mono text-ink-faint">{server.tags.slice(0, 2).join(' · ')}</span>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
