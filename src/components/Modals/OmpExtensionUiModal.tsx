import { useEffect, useState, useCallback } from 'react'
import AnimatedModal from '../Common/AnimatedModal'
import { onOmpEvent, onOmpExtensionUiRequest, respondExtensionUi } from '../../data/agent'
import { openExternalUrl } from '../../data/config'
import { useI18n } from '../../i18n/I18nContext'

/**
 * Extension UI dialog — omp extensions ask the user for input via the RPC
 * `extension_ui_request` protocol (select/confirm/input/editor/notify/open_url).
 * Previously these were forwarded to the renderer but never answered, so any
 * extension that required interaction would hang or silently fail. This modal
 * renders the request and sends the matching `extension_ui_response` frame back
 * to the omp process.
 */
export interface OmpExtensionUiRequest {
  id: string
  method: string
  title?: string
  message?: string
  placeholder?: string
  prefill?: string
  options?: string[]
  optionDetails?: Array<{ label?: string; description?: string; detail?: string }>
  url?: string
  launchUrl?: string
  instructions?: string
  notifyType?: string
  timeout?: number
  targetId?: string
  statusKey?: string
  statusText?: string
  widgetKey?: string
  widgetLines?: string[]
  widgetPlacement?: string
  text?: string
  [key: string]: unknown
}

type PendingRequest = OmpExtensionUiRequest & { projectId: string; receivedAt: number }
type NotifyType = 'info' | 'warning' | 'error'

interface OmpExtensionUiModalProps {
  onNotify?: (type: NotifyType, message: string) => void
}

const INTERACTIVE_METHODS = new Set(['select', 'confirm', 'input', 'editor', 'open_url'])
const PASSIVE_METHODS = new Set(['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'])
const requestKey = (request: Pick<PendingRequest, 'projectId' | 'id'>): string => `${request.projectId}:${request.id}`
const processGone = (error?: string): boolean => /omp process is not running/i.test(error || '')

export default function OmpExtensionUiModal({ onNotify }: OmpExtensionUiModalProps) {
  const { t } = useI18n()
  const [queue, setQueue] = useState<PendingRequest[]>([])
  const [inputValue, setInputValue] = useState('')
  const [respondingKey, setRespondingKey] = useState<string | null>(null)
  const [responseError, setResponseError] = useState<string | null>(null)

  useEffect(() => onOmpExtensionUiRequest((payload) => {
    const p = payload as { projectId?: string; request?: OmpExtensionUiRequest }
    const request = p?.request
    if (!request || typeof request.id !== 'string') return
    const projectId = p.projectId || ''

    // `cancel` is an outbound control frame from omp. It tells the host to
    // close an existing request after abort/timeout; it is never a new dialog.
    if (request.method === 'cancel') {
      if (typeof request.targetId !== 'string') return
      setQueue((current) => current.filter((item) => !(item.projectId === projectId && item.id === request.targetId)))
      return
    }

    // Passive extension UI frames never require an extension_ui_response.
    // A notification maps naturally to the app toast; the other passive
    // surfaces have no DevLauncher equivalent and are intentionally ignored.
    if (PASSIVE_METHODS.has(request.method)) {
      if (request.method === 'notify' && typeof request.message === 'string' && request.message.trim()) {
        const type: NotifyType = request.notifyType === 'warning' || request.notifyType === 'error'
          ? request.notifyType
          : 'info'
        onNotify?.(type, request.message.trim())
      }
      return
    }

    // Unknown protocol additions must not block the whole app with an empty
    // fallback dialog. Add support explicitly when omp introduces one.
    if (!INTERACTIVE_METHODS.has(request.method)) return

    const pending: PendingRequest = { ...request, projectId, receivedAt: Date.now() }
    setQueue((current) => current.some((item) => requestKey(item) === requestKey(pending))
      ? current
      : [...current, pending])
  }), [onNotify])

  // A completed/terminated turn cannot still own an actionable dialog. This
  // also cleans up stale requests when an older omp build exits without first
  // emitting the dedicated `method: cancel` frame.
  useEffect(() => onOmpEvent((payload) => {
    const p = payload as { projectId?: string; event?: { type?: string } }
    const eventType = p.event?.type
    if (!p.projectId || !['agent_end', 'rpc_exit', 'rpc_error', 'rpc_restarting'].includes(eventType || '')) return
    setQueue((current) => current.filter((item) => item.projectId !== p.projectId))
  }), [])

  // Reset input when the active request changes to an input/editor dialog.
  const active = queue[0] ?? null
  useEffect(() => {
    if (active && (active.method === 'input' || active.method === 'editor')) {
      setInputValue(active.prefill || '')
    } else {
      setInputValue('')
    }
  }, [active?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setResponseError(null)
    setRespondingKey(null)
  }, [active?.projectId, active?.id])

  const removeRequest = useCallback((request: PendingRequest) => {
    const key = requestKey(request)
    setQueue((current) => current.filter((item) => requestKey(item) !== key))
  }, [])

  const respond = useCallback(async (request: PendingRequest, response: Record<string, unknown>) => {
    const key = requestKey(request)
    setRespondingKey(key)
    setResponseError(null)
    try {
      const result = await respondExtensionUi(request.projectId, { ...response })
      if (result.success || processGone(result.error)) {
        removeRequest(request)
        if (!result.success && result.error) onNotify?.('warning', result.error)
        return
      }
      setResponseError(result.error || t('agent.extUi.responseFailed'))
    } catch (error) {
      setResponseError(error instanceof Error ? error.message : t('agent.extUi.responseFailed'))
    } finally {
      setRespondingKey((current) => current === key ? null : current)
    }
  }, [onNotify, removeRequest, t])

  const cancelAll = useCallback(async () => {
    const snapshot = queue.filter((item) => item.method !== 'open_url')
    const localOnly = queue.filter((item) => item.method === 'open_url')
    if (snapshot.length === 0) {
      for (const item of localOnly) removeRequest(item)
      return
    }
    setRespondingKey('all')
    setResponseError(null)
    const settled = await Promise.all(snapshot.map(async (item) => {
      try {
        const result = await respondExtensionUi(item.projectId, { id: item.id, cancelled: true })
        return { item, remove: result.success || processGone(result.error), error: result.error }
      } catch (error) {
        return { item, remove: false, error: error instanceof Error ? error.message : t('agent.extUi.responseFailed') }
      }
    }))
    const removeKeys = new Set([
      ...localOnly.map(requestKey),
      ...settled.filter((item) => item.remove).map(({ item }) => requestKey(item)),
    ])
    setQueue((current) => current.filter((item) => !removeKeys.has(requestKey(item))))
    const failure = settled.find((item) => !item.remove)
    if (failure) setResponseError(failure.error || t('agent.extUi.responseFailed'))
    setRespondingKey(null)
  }, [queue, removeRequest, t])

  // omp resolves timed-out requests server-side but does not emit a matching
  // cancel frame. Mirror the deadline so a stale modal cannot outlive it.
  useEffect(() => {
    if (!active || active.method === 'open_url' || typeof active.timeout !== 'number' || active.timeout <= 0) return
    const remaining = Math.max(0, active.receivedAt + active.timeout - Date.now())
    const timer = window.setTimeout(() => {
      void respond(active, { id: active.id, cancelled: true, timedOut: true })
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [active, respond])

  if (!active) return null

  const isResponding = respondingKey === 'all' || respondingKey === requestKey(active)
  const respondCancel = () => {
    if (isResponding) return
    if (active.method === 'open_url') removeRequest(active)
    else void respond(active, { id: active.id, cancelled: true })
  }
  const waiting = Math.max(queue.length - 1, 0)

  const renderBody = () => {
    const method = active.method
    if (method === 'notify') {
      return <p className="text-sm text-ink-soft leading-relaxed">{active.message}</p>
    }
    if (method === 'open_url') {
      return (
        <div className="mt-2 space-y-2 rounded-lg bg-surface-3 border border-border p-3">
          {active.instructions && <p className="text-xs text-ink-soft">{active.instructions}</p>}
          <p className="text-xs text-ink-faint break-all">{active.launchUrl || active.url}</p>
        </div>
      )
    }
    if (method === 'input' || method === 'editor') {
      return (
        <textarea
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (isResponding) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void respond(active, { id: active.id, value: inputValue })
            }
            if (e.key === 'Escape') respondCancel()
          }}
          rows={method === 'editor' ? 10 : 3}
          className="w-full mt-3 rounded-lg bg-surface-3 border border-border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-y font-mono"
          placeholder={active.placeholder || ''}
        />
      )
    }
    if (method === 'select' && Array.isArray(active.options)) {
      return (
        <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
          {active.options.map((option, index) => {
            const detail = active.optionDetails?.[index]
            return (
              <button
                key={index}
                onClick={() => { void respond(active, { id: active.id, value: option }) }}
                disabled={isResponding}
                className="w-full text-left rounded-lg bg-surface-3 border border-border px-3 py-2 hover:bg-surface-2 hover:border-accent transition-colors"
              >
                <span className="text-sm text-ink">{option}</span>
                {(detail?.description || detail?.detail || detail?.label) && <span className="block text-xs text-ink-faint mt-0.5">{detail.description || detail.detail || detail.label}</span>}
              </button>
            )
          })}
        </div>
      )
    }
    return <p className="text-sm text-ink-soft leading-relaxed">{active.message}</p>
  }

  const isSelect = active.method === 'select'
  const isOpenUrl = active.method === 'open_url'

  return (
    <AnimatedModal id="ompExtensionUiModal" isOpen onClose={respondCancel}>
      <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-card p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
              <path d="M8 10h8M8 14h5M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-bold text-sm">{active.title || (isOpenUrl ? t('agent.extUi.openLinkTitle') : t('agent.extUi.title'))}</h3>
            {active.message && !['input', 'editor', 'select', 'notify', 'confirm'].includes(active.method) && (
              <p className="text-xs text-ink-faint mt-1 leading-relaxed">{active.message}</p>
            )}
          </div>
        </div>

        {renderBody()}

        {responseError && (
          <p role="alert" className="mt-3 text-xs text-danger">{responseError}</p>
        )}

        {!isSelect && (
          <div className="flex items-center justify-end gap-2 mt-5">
            {waiting > 0 && (
              <button disabled={isResponding} onClick={() => { void cancelAll() }} className="mr-auto px-3 py-2 rounded-lg text-xs text-ink-faint hover:text-danger hover:bg-surface-3 transition-colors disabled:opacity-50">
                {t('agent.extUi.cancelAll')} ({queue.length})
              </button>
            )}
            {isOpenUrl ? (
              <>
                <button disabled={isResponding} onClick={respondCancel} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-ink-soft hover:text-ink transition-colors disabled:opacity-50">
                  {t('agent.extUi.dismiss')}
                </button>
                <button
                  disabled={isResponding}
                  onClick={async () => {
                    const url = active.launchUrl || active.url
                    if (!url) return setResponseError(t('agent.extUi.invalidLink'))
                    setRespondingKey(requestKey(active))
                    setResponseError(null)
                    try {
                      const result = await openExternalUrl(url)
                      if (result.success) removeRequest(active)
                      else setResponseError(result.error || t('agent.extUi.invalidLink'))
                    } catch (error) {
                      setResponseError(error instanceof Error ? error.message : t('agent.extUi.invalidLink'))
                    } finally {
                      setRespondingKey(null)
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-50"
                >
                  {t('agent.extUi.openLink')}
                </button>
              </>
            ) : active.method === 'input' || active.method === 'editor' ? (
              <button disabled={isResponding} onClick={() => { void respond(active, { id: active.id, value: inputValue }) }} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-50">
                {t('agent.extUi.submit')}
              </button>
            ) : active.method === 'confirm' ? (
              <>
                <button disabled={isResponding} onClick={respondCancel} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-ink-soft hover:text-ink transition-colors disabled:opacity-50">
                  {t('agent.extUi.cancel')}
                </button>
                <button disabled={isResponding} onClick={() => { void respond(active, { id: active.id, confirmed: true }) }} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-50">
                  {t('agent.extUi.confirm')}
                </button>
              </>
            ) : (
              <button disabled={isResponding} onClick={respondCancel} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-ink-soft hover:text-ink transition-colors disabled:opacity-50">
                {t('agent.extUi.cancel')}
              </button>
            )}
          </div>
        )}
      </div>
    </AnimatedModal>
  )
}
