/**
 * Chat pane for a VPS target. Reuses the existing agent chat surface (sessions,
 * streaming, tool cards, approval modal) by running omp in the server's managed
 * local context dir with the target id namespaced as `vps:<serverId>`.
 *
 * Before the first message the pane asks the main process to create a scoped
 * MCP endpoint for (server, session) and to write the project-scoped omp config
 * into that context dir, so this session can only ever reach its own server.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nContext'
import AgentChat from '../Agent/AgentChat'
import type { AgentSession } from '../../types/shared'
import type { OmpStatusResult } from '../../data/agent'
import type { VpsServer, VpsServerStatus } from '../../types/vps'
import * as ipc from '../../utils/ipcRenderer'
import { prepareVpsScope } from '../../data/vps'
import { vpsPseudoProject, vpsTargetId } from './vpsUtils'
import { useElectronConfig } from '../../hooks/useElectronConfig'

interface VpsChatProps {
  server: VpsServer
  status: OmpStatusResult | null
  draftsRef: React.RefObject<Record<string, string>>
  onOpenSettings?: () => void
  visible?: boolean
  connection?: VpsServerStatus
}

export default function VpsChat({ server, status, draftsRef, onOpenSettings, visible = true, connection }: VpsChatProps) {
  const { t } = useI18n()
  const { config, loading: configLoading, updateConfig } = useElectronConfig()
  const targetId = vpsTargetId(server.id)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [active, setActive] = useState<AgentSession | null>(null)
  const activeId = active?.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const creatingRef = useRef(false)
  const currentTarget = useRef(targetId)
  currentTarget.current = targetId
  const canCreate = !loading && !configLoading && config.agent.controlEnabled
    && connection?.state === 'connected' && !creating && !busy && !deleting
  const [prepared, setPrepared] = useState<{ targetId: string; sessionId: string; connectedAt: string | null; path: string } | null>(null)
  const contextDir = prepared?.targetId === targetId && prepared.sessionId === active?.id
    && prepared.connectedAt === connection?.connectedAt && connection?.state === 'connected'
    && config.agent.controlEnabled ? prepared.path : null

  useEffect(() => {
    let cancelled = false
    setSessions([])
    setActive(null)
    setLoading(true)
    setError(null)
    setPrepared(null)
    setConfirmDelete(false)
    setBusy(false)
    ipc.ompListSessions(targetId).then((result) => {
      if (cancelled) return
      if (result?.success) {
        setSessions(result.sessions || [])
        const first = (result.sessions || [])[0]
        if (first) setActive(first)
      } else {
        setError(result?.error || t('vps.sessionsFailed'))
      }
    }).catch(() => { if (!cancelled) setError(t('vps.sessionsFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [targetId, t])

  // Prepare (or re-prepare) the scoped agent endpoint for the active session.
  // The session's context dir comes from the main process, so the chat never
  // guesses a path the backend would reject.
  useEffect(() => {
    setPrepared(null)
    if (!activeId || connection?.state !== 'connected' || !config.agent.controlEnabled) {
      setBusy(false)
      return
    }
    let cancelled = false
    setError(null)
    prepareVpsScope(server.id, activeId).then((result) => {
      if (cancelled) return
      if (result?.contextDir) setPrepared({ targetId, sessionId: activeId, connectedAt: connection.connectedAt, path: result.contextDir })
      else setError(result?.error || t('vps.sessionsFailed'))
    }).catch(() => { if (!cancelled) setError(t('vps.sessionsFailed')) })
    return () => { cancelled = true }
  }, [activeId, server.id, targetId, connection?.state, connection?.connectedAt, config.agent.controlEnabled, retry, t])

  const updateSession = useCallback((id: string, session?: AgentSession): void => {
    if (!session || currentTarget.current !== targetId) return
    setSessions((previous) => previous.map((item) => item.id === id ? { ...item, ...session } : item))
    setActive((previous) => previous?.id === id ? { ...previous, ...session } : previous)
  }, [targetId])

  const deleteSession = async (): Promise<void> => {
    if (!active || busy || deleting) return
    const sessionId = active.id
    setDeleting(true)
    try {
      const result = await ipc.ompDeleteSession(targetId, sessionId)
      if (currentTarget.current !== targetId) return
      if (!result.success) { setError(result.error || t('vps.sessionsFailed')); return }
      const remaining = sessions.filter((item) => item.id !== sessionId)
      setSessions(remaining)
      setActive(remaining[0] || null)
      delete draftsRef.current[`${targetId}:${sessionId}`]
      setConfirmDelete(false)
    } catch { setError(t('vps.sessionsFailed')) }
    finally { setDeleting(false) }
  }

  const createSession = useCallback(async (): Promise<void> => {
    if (!canCreate || creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    setError(null)
    try {
      const result = await ipc.ompCreateSession(targetId, `${server.name} session`)
      if (currentTarget.current !== targetId) return
      const created: AgentSession | undefined = result?.session
      if (result?.success && created) {
        setSessions((prev) => [...prev, created])
        setActive(created)
      } else setError(result?.error || t('vps.sessionsFailed'))
    } catch {
      if (currentTarget.current === targetId) setError(t('vps.sessionsFailed'))
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }, [canCreate, server.name, targetId, t])

  const enableAgent = async (): Promise<void> => {
    setEnabling(true)
    setError(null)
    try {
      const result = await updateConfig({ agent: { controlEnabled: true } })
      if (!result.success) setError(result.error || t('vps.sessionsFailed'))
    } catch { setError(t('vps.sessionsFailed')) }
    finally { setEnabling(false) }
  }

  if (!status?.installed) {
    return <p className="p-4 text-xs text-ink-faint">{t('vps.agentNotInstalled')}</p>
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-faint">{t('vps.agentChat')}</span>
        <span className="text-[10px] text-ink-faint">· {server.environment}</span>
        <select
          className="ml-auto rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-ink-soft"
          value={active?.id || ''}
          onChange={(event) => setActive(sessions.find((session) => session.id === event.target.value) || null)}
          aria-label={t('vps.session')}
          disabled={busy || deleting}
        >
          {sessions.length === 0 && <option value="">{t('vps.noSessions')}</option>}
          {sessions.map((session, index) => (
            <option key={session.id} value={session.id}>{session.title || session.id.slice(0, 8)} · {index + 1}</option>
          ))}
        </select>
        <button type="button" disabled={!canCreate} onClick={() => void createSession()} className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-surface-3 disabled:opacity-50">
          {t('vps.newSession')}
        </button>
        <button type="button" disabled={!active || busy || deleting} onClick={() => setConfirmDelete(true)} className="text-[10px] rounded border border-danger/40 text-danger px-1.5 py-0.5 disabled:opacity-50">
          {t('vps.deleteSession')}
        </button>
      </div>

      {confirmDelete && active && (
        <div role="alertdialog" aria-label={t('vps.deleteSession')} className="px-3 py-3 border-b border-border bg-surface-2">
          <p className="text-xs text-ink-soft">{t('vps.deleteSessionConfirm', { name: active.title || active.id.slice(0, 8) })}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={deleting} onClick={() => void deleteSession()} className="text-xs text-danger rounded border border-danger/40 px-2 py-1">{t('vps.confirmDeleteSession')}</button>
            <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} className="text-xs rounded border border-border px-2 py-1">{t('vps.cancel')}</button>
          </div>
        </div>
      )}

      {error && <p className="px-3 py-2 text-[11px] text-danger" role="alert">{error}</p>}

      {active && contextDir ? (
        <AgentChat
          key={`${server.id}:${active.id}`}
          status={status}
          project={vpsPseudoProject(server, contextDir)}
          session={active}
          draftsRef={draftsRef}
          onOpenSettings={onOpenSettings}
          visible={visible}
          onSessionCreated={updateSession}
          onBusyChange={setBusy}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-xs text-ink-faint">{
            loading || configLoading ? t('vps.loadingSessions')
              : !config.agent.controlEnabled ? t('vps.agentControlRequired')
                : connection?.state !== 'connected' ? t('vps.connectForChat')
                  : active ? t(error ? 'vps.prepareFailed' : 'vps.preparingChat')
                    : t('vps.noSessionsHint')
          }</p>
          {!loading && !configLoading && !config.agent.controlEnabled && (
            <button type="button" disabled={enabling} onClick={() => void enableAgent()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {t('vps.enableAgentControl')}
            </button>
          )}
          {active && error && config.agent.controlEnabled && connection?.state === 'connected' && (
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded border border-border px-3 py-1.5 text-xs">
              {t('vps.retryChat')}
            </button>
          )}
          {!active && canCreate && (
            <button type="button" onClick={() => void createSession()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
              {t('vps.newSession')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
