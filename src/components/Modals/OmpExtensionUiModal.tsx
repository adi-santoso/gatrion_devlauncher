import { useEffect, useState, useCallback } from 'react'
import AnimatedModal from '../Common/AnimatedModal'
import { onOmpExtensionUiRequest, respondExtensionUi } from '../../data/agent'
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
  optionDetails?: Array<{ label?: string; detail?: string }>
  url?: string
  notifyType?: string
  timeout?: number
  targetId?: string
  [key: string]: unknown
}

type PendingRequest = OmpExtensionUiRequest & { projectId: string }

export default function OmpExtensionUiModal() {
  const { t } = useI18n()
  const [queue, setQueue] = useState<PendingRequest[]>([])
  const [inputValue, setInputValue] = useState('')

  useEffect(() => onOmpExtensionUiRequest((payload) => {
    const p = payload as { projectId?: string; request?: OmpExtensionUiRequest }
    const request = p?.request
    if (!request || typeof request.id !== 'string') return
    setQueue((current) => [...current, { ...request, projectId: p.projectId || '' }])
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

  const respond = useCallback((projectId: string, response: Record<string, unknown>) => {
    setQueue((current) => current.slice(1))
    void respondExtensionUi(projectId, { ...response })
  }, [])

  const cancelAll = useCallback(() => {
    setQueue((current) => {
      for (const item of current) void respondExtensionUi(item.projectId, { id: item.id, cancelled: true })
      return []
    })
  }, [])

  if (!active) return null

  const respondCancel = () => respond(active.projectId, { id: active.id, cancelled: true })
  const waiting = Math.max(queue.length - 1, 0)

  const renderBody = () => {
    const method = active.method
    if (method === 'notify') {
      return <p className="text-sm text-ink-soft leading-relaxed">{active.message}</p>
    }
    if (method === 'open_url') {
      return (
        <div className="mt-2 rounded-lg bg-surface-3 border border-border p-3">
          <p className="text-xs text-ink-faint break-all">{active.url}</p>
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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              respond(active.projectId, { id: active.id, value: inputValue })
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
                onClick={() => respond(active.projectId, { id: active.id, value: option })}
                className="w-full text-left rounded-lg bg-surface-3 border border-border px-3 py-2 hover:bg-surface-2 hover:border-accent transition-colors"
              >
                <span className="text-sm text-ink">{option}</span>
                {detail?.label && <span className="block text-xs text-ink-faint mt-0.5">{detail.label}</span>}
              </button>
            )
          })}
        </div>
      )
    }
    return <p className="text-sm text-ink-soft leading-relaxed">{active.message}</p>
  }

  const isFireAndForget = active.method === 'notify' || active.method === 'setStatus' || active.method === 'setWidget' || active.method === 'setTitle' || active.method === 'set_editor_text'
  const isSelect = active.method === 'select'

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
            <h3 className="font-display font-bold text-sm">{active.title || t('agent.extUi.title')}</h3>
            {active.message && !['input', 'editor', 'select', 'notify'].includes(active.method) && (
              <p className="text-xs text-ink-faint mt-1 leading-relaxed">{active.message}</p>
            )}
          </div>
        </div>

        {renderBody()}

        {!isSelect && !isFireAndForget && (
          <div className="flex items-center justify-end gap-2 mt-5">
            {waiting > 0 && (
              <button onClick={cancelAll} className="mr-auto px-3 py-2 rounded-lg text-xs text-ink-faint hover:text-danger hover:bg-surface-3 transition-colors">
                {t('agent.extUi.cancelAll')} ({queue.length})
              </button>
            )}
            {active.method === 'input' || active.method === 'editor' ? (
              <button onClick={() => respond(active.projectId, { id: active.id, value: inputValue })} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors">
                {t('agent.extUi.submit')}
              </button>
            ) : active.method === 'confirm' ? (
              <>
                <button onClick={respondCancel} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-ink-soft hover:text-ink transition-colors">
                  {t('agent.extUi.cancel')}
                </button>
                <button onClick={() => respond(active.projectId, { id: active.id, confirmed: true })} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/90 text-white transition-colors">
                  {t('agent.extUi.confirm')}
                </button>
              </>
            ) : (
              <button onClick={respondCancel} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-ink-soft hover:text-ink transition-colors">
                {t('agent.extUi.cancel')}
              </button>
            )}
          </div>
        )}

        {isFireAndForget && (
          <div className="flex items-center justify-end gap-2 mt-5">
            <button onClick={() => respond(active.projectId, { id: active.id, cancelled: true })} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-ink-soft hover:text-ink transition-colors">
              {t('agent.extUi.dismiss')}
            </button>
          </div>
        )}
      </div>
    </AnimatedModal>
  )
}
