import { useEffect, useState, useCallback } from 'react'
import AnimatedModal from '../Common/AnimatedModal'
import { onMcpApprovalRequest, respondMcpApproval } from '../../data/agent'
import type { McpApprovalRequest } from '../../data/agent'
import { useI18n } from '../../i18n/I18nContext'

/**
 * McpApprovalModal — the agent (omp) asked to run a destructive DevLauncher
 * action (delete project, force stop, backup, update, …). The tool call is
 * parked in the main process until the user answers here: Approve runs it,
 * Deny cancels it with a clear error for the agent. Multiple requests queue
 * up; "Deny all" rejects everything outstanding.
 */
export default function McpApprovalModal() {
  const { t } = useI18n()
  const [queue, setQueue] = useState<McpApprovalRequest[]>([])

  useEffect(() => onMcpApprovalRequest((request) => {
    setQueue((current) => [...current, request])
  }), [])

  const respond = useCallback((id: string, decision: 'approve' | 'deny') => {
    setQueue((current) => current.filter((item) => item.id !== id))
    void respondMcpApproval(id, decision)
  }, [])

  const denyAll = useCallback(() => {
    setQueue((current) => {
      for (const item of current) void respondMcpApproval(item.id, 'deny')
      return []
    })
  }, [])

  const active = queue[0] ?? null
  const waiting = Math.max(queue.length - 1, 0)

  const argsSummary = active && active.args
    ? Object.entries(active.args)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .join(', ')
    : ''

  return (
    <AnimatedModal id="mcpApprovalModal" isOpen={active !== null} onClose={() => (active ? respond(active.id, 'deny') : undefined)}>
      {active && (
        <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-card p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display font-bold text-sm">{t('mcp.approval.title')}</h3>
              <p className="text-xs text-ink-faint mt-1 leading-relaxed">{t('mcp.approval.desc')}</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-surface-3 border border-border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 text-xs">
              <span className="text-ink-faint shrink-0">{t('mcp.approval.action')}</span>
              <span className="text-ink font-semibold text-right">{active.label || active.tool}</span>
            </div>
            {active.projectName && (
              <div className="flex items-start justify-between gap-3 text-xs">
                <span className="text-ink-faint shrink-0">{t('mcp.approval.target')}</span>
                <span className="text-ink font-semibold text-right">{active.projectName}</span>
              </div>
            )}
            {active.summary && (
              <div className="flex items-start justify-between gap-3 text-xs">
                <span className="text-ink-faint shrink-0">{t('mcp.approval.details')}</span>
                <span className="text-ink text-right">{active.summary}</span>
              </div>
            )}
            {argsSummary && (
              <div className="flex items-start justify-between gap-3 text-xs">
                <span className="text-ink-faint shrink-0">{t('mcp.approval.tool')}</span>
                <code className="text-[11px] text-ink-soft text-right break-all">{active.tool}({argsSummary})</code>
              </div>
            )}
          </div>

          {waiting > 0 && (
            <p className="text-[11px] text-ink-faint mt-3">{t('mcp.approval.queue', { count: waiting })}</p>
          )}

          <div className="flex items-center justify-end gap-2 mt-5">
            {waiting > 0 && (
              <button
                onClick={denyAll}
                className="mr-auto px-3 py-2 rounded-lg text-xs text-ink-faint hover:text-danger hover:bg-surface-3 transition-colors"
              >
                {t('mcp.approval.denyAll')} ({queue.length})
              </button>
            )}
            <button
              onClick={() => respond(active.id, 'deny')}
              className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-ink-soft hover:text-ink transition-colors"
            >
              {t('mcp.approval.deny')}
            </button>
            <button
              onClick={() => respond(active.id, 'approve')}
              className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-danger hover:bg-danger/90 text-white transition-colors"
            >
              {t('mcp.approval.approve')}
            </button>
          </div>
        </div>
      )}
    </AnimatedModal>
  )
}
