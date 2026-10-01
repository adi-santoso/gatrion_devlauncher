/**
 * VPS Command Center — server list + server detail + agent chat, matching the
 * approved mockup composition (docs/mockups/vps-command-center-v1.png).
 *
 * Manual (user-driven) actions work regardless of the per-server agent policy;
 * the policy gates what the *agent* may do. Host keys are always reviewed
 * explicitly — an unknown key shows a fingerprint prompt instead of connecting.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nContext'
import type { VpsHostKeyInfo, VpsServer, VpsServerStatus } from '../../types/vps'
import type { OmpStatusResult } from '../../data/agent'
import {
  addVpsServer,
  connectVps,
  deleteVpsServer,
  disconnectVps,
  getVpsStatus,
  listVpsServers,
  onVpsStatus,
  setVpsCredential,
  testVpsConnection,
  trustVpsHostKey,
  updateVpsServer,
} from '../../data/vps'
import * as ipc from '../../utils/ipcRenderer'
import VpsServerList from './VpsServerList'
import VpsServerModal, { type VpsServerFormResult } from './VpsServerModal'
import VpsDetailPanel from './VpsDetailPanel'
import VpsChat from './VpsChat'

interface VpsViewProps {
  visible?: boolean
  onOpenSettings?: () => void
  terminalFontSize?: number
}

export default function VpsView({ visible = true, onOpenSettings, terminalFontSize }: VpsViewProps) {
  const { t } = useI18n()
  const [servers, setServers] = useState<VpsServer[]>([])
  const [statuses, setStatuses] = useState<Record<string, VpsServerStatus>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; initial: VpsServer | null }>({ open: false, initial: null })
  const [hostKeyPrompt, setHostKeyPrompt] = useState<{ server: VpsServer; hostKey: VpsHostKeyInfo } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusChat, setFocusChat] = useState(false)
  const [ompStatus, setOmpStatus] = useState<OmpStatusResult | null>(null)
  const draftsRef = useRef<Record<string, string>>({})
  const layoutRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; width: number } | null>(null)
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('vps-chat-width'))
      return Number.isFinite(saved) && saved >= 320 ? Math.min(saved, 1000) : 460
    } catch { return 460 }
  })
  const [resizing, setResizing] = useState(false)
  const resizeChat = (width: number): void => {
    const max = Math.max(320, (layoutRef.current?.clientWidth || 1092) - 264 - 8 - 360)
    setChatWidth(Math.round(Math.max(320, Math.min(width, max, 1000))))
  }
  useEffect(() => {
    try { localStorage.setItem('vps-chat-width', String(chatWidth)) } catch { /* storage unavailable */ }
  }, [chatWidth])
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!dragRef.current) return
      const max = Math.max(320, (layoutRef.current?.clientWidth || 1092) - 632)
      setChatWidth(Math.round(Math.max(320, Math.min(dragRef.current.width + dragRef.current.x - event.clientX, max, 1000))))
    }
    const end = (): void => { dragRef.current = null; setResizing(false) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const result = await listVpsServers()
    if (result?.success) {
      setServers(result.servers)
      setSelectedId((current) => current || result.servers[0]?.id || null)
      const entries = await Promise.all(result.servers.map(async (server) => {
        const status = await getVpsStatus(server.id)
        return [server.id, status?.status] as const
      }))
      setStatuses((prev) => {
        const next = { ...prev }
        for (const [id, status] of entries) if (status) next[id] = status
        return next
      })
    } else {
      setError(result?.error || null)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    void refresh()
    void ipc.ompStatus().then((result) => { if (result?.success) setOmpStatus(result) })
  }, [visible, refresh])

  useEffect(() => {
    const unsub = onVpsStatus((status) => {
      setStatuses((prev) => ({ ...prev, [status.serverId]: status }))
    })
    return unsub
  }, [])

  const selected = servers.find((server) => server.id === selectedId) || null

  const handleConnect = useCallback(async (server: VpsServer): Promise<void> => {
    setError(null)
    const result = await connectVps(server.id)
    if (!result?.success) {
      const status = await getVpsStatus(server.id)
      const pending = status?.status?.pendingHostKey
      if (pending) setHostKeyPrompt({ server, hostKey: pending })
      else setError(result?.error || t('vps.connectFailed'))
    }
  }, [t])

  const handleTrust = async (): Promise<void> => {
    if (!hostKeyPrompt) return
    const result = await trustVpsHostKey(hostKeyPrompt.server.id, hostKeyPrompt.hostKey.fingerprint)
    if (!result?.success) setError(result?.error || t('vps.connectFailed'))
    setHostKeyPrompt(null)
  }

  const handleSubmit = async ({ input, secret }: VpsServerFormResult): Promise<{ success: boolean; error?: string }> => {
    if (modal.initial) {
      const updated = await updateVpsServer(modal.initial.id, input)
      if (!updated?.success) return { success: false, error: updated?.error }
      if (secret) {
        const saved = await setVpsCredential(modal.initial.id, secret)
        if (!saved?.success) return { success: false, error: saved?.error }
      }
    } else {
      const created = await addVpsServer(input, secret)
      if (!created?.success) return { success: false, error: created?.error }
      setSelectedId(created.server.id)
    }
    await refresh()
    return { success: true }
  }

  const handleDelete = async (server: VpsServer): Promise<void> => {
    if (!window.confirm(t('vps.confirmDelete', { name: server.name }))) return
    const result = await deleteVpsServer(server.id)
    if (!result?.success) setError(result?.error || t('vps.deleteFailed'))
    setSelectedId(null)
    await refresh()
  }

  return (
    <div ref={layoutRef} className={`h-full flex min-h-0 ${resizing ? 'select-none cursor-col-resize' : ''}`}>
      <VpsServerList
        servers={servers}
        statuses={statuses}
        selectedId={selectedId}
        onSelect={(server) => setSelectedId(server.id)}
        onAdd={() => setModal({ open: true, initial: null })}
        onEdit={(server) => setModal({ open: true, initial: server })}
        onConnect={(server) => void handleConnect(server)}
        onDisconnect={(server) => void disconnectVps(server.id)}
      />

      {selected ? (
        <>
          <div className={`${focusChat ? 'hidden' : 'flex'} flex-1 min-w-0 flex-col min-h-0`}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
              <button
                type="button"
                onClick={() => setFocusChat(true)}
                className="text-[10px] rounded border border-border px-2 py-0.5 hover:bg-surface-3"
              >
                {t('vps.focusChat')}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(selected)}
                className="ml-auto text-[10px] rounded border border-danger/40 text-danger px-2 py-0.5 hover:bg-danger/10"
              >
                {t('vps.deleteServer')}
              </button>
              {error && <span className="text-[10px] text-danger truncate max-w-[30%]">{error}</span>}
            </div>
            <VpsDetailPanel server={selected} status={statuses[selected.id]} terminalFontSize={terminalFontSize} />
          </div>

          {!focusChat && (
            <div
              role="separator"
              aria-label={t('vps.resizeChat')}
              aria-orientation="vertical"
              aria-valuemin={320}
              aria-valuemax={Math.min(1000, Math.max(320, (layoutRef.current?.clientWidth || 1092) - 632))}
              aria-valuenow={chatWidth}
              tabIndex={0}
              className={`hidden 2xl:flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none ${resizing ? 'bg-accent/30' : 'bg-surface-2'}`}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                dragRef.current = { x: event.clientX, width: chatWidth }
                setResizing(true)
              }}
              onDoubleClick={() => resizeChat(460)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home') {
                  event.preventDefault()
                  resizeChat(event.key === 'Home' ? 460 : chatWidth + (event.key === 'ArrowLeft' ? 24 : -24))
                }
              }}
            >
              <span className="w-0.5 h-10 rounded bg-ink-faint/40" aria-hidden="true" />
            </div>
          )}
          <div
            className={`${focusChat ? 'flex flex-1 w-full' : 'hidden 2xl:flex'} shrink-0 border-l border-border flex-col min-h-0`}
            style={focusChat ? undefined : { width: chatWidth, maxWidth: 'calc(100% - 632px)' }}
          >
            <div className={`flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2 ${focusChat ? '' : '2xl:hidden'}`}>
              <button type="button" onClick={() => setFocusChat(false)} className="text-[10px] rounded border border-border px-2 py-0.5 hover:bg-surface-3">
                {t('vps.showDetail')}
              </button>
            </div>
            <VpsChat
              server={selected}
              status={ompStatus}
              connection={statuses[selected.id]}
              draftsRef={draftsRef}
              onOpenSettings={onOpenSettings}
              visible={visible}
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-ink-faint">{servers.length === 0 ? t('vps.noServersHint') : t('vps.selectServer')}</p>
        </div>
      )}

      <VpsServerModal
        open={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
        onSubmit={handleSubmit}
        onTest={async (input, secret) => {
          const result = await testVpsConnection(input, secret)
          return result?.result || { success: false, error: result?.error }
        }}
      />

      {hostKeyPrompt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5">
            <h2 className="font-display text-sm font-bold text-ink">{t('vps.hostKeyTitle')}</h2>
            <p className="mt-2 text-[11px] text-ink-soft">
              {t('vps.hostKeyBody', { name: hostKeyPrompt.server.name, host: hostKeyPrompt.server.host })}
            </p>
            <p className="mt-3 font-mono text-[11px] break-all text-ink-soft">{hostKeyPrompt.hostKey.fingerprint}</p>
            <p className="mt-1 text-[10px] font-mono text-ink-faint">{hostKeyPrompt.hostKey.algorithm}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setHostKeyPrompt(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-3">
                {t('vps.cancel')}
              </button>
              <button type="button" onClick={() => void handleTrust()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
                {t('vps.trustHostKey')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
