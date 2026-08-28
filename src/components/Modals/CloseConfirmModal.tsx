import { useCallback, useEffect, useState } from 'react'
import AnimatedModal from '../Common/AnimatedModal'
import { onWindowCloseRequest, confirmWindowClose, cancelWindowClose } from '../../data/config'
import { useI18n } from '../../i18n/I18nContext'
import type { WindowCloseRequest } from '../../data/config'

/**
 * CloseConfirmModal — confirms quitting the app when "minimize to tray" is
 * OFF (closing the window really quits, stopping any running projects).
 * Self-subscribes: the main process intercepts the first window close with
 * minimize-to-tray off and pushes a window-close-request here. Quit confirms,
 * Cancel keeps the app running (a later close asks again).
 */
export default function CloseConfirmModal() {
  const { t } = useI18n()
  const [request, setRequest] = useState<WindowCloseRequest | null>(null)

  useEffect(() => onWindowCloseRequest((payload) => setRequest(payload)), [])

  const quit = useCallback(() => {
    setRequest(null)
    void confirmWindowClose()
  }, [])

  const cancel = useCallback(() => {
    setRequest(null)
    void cancelWindowClose()
  }, [])

  const busyCount = request?.busyCount ?? 0

  return (
    <AnimatedModal id="closeConfirmModal" isOpen={request !== null} onClose={cancel}>
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-card p-5">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${busyCount > 0 ? 'bg-warning/10' : 'bg-surface-3'}`}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={busyCount > 0 ? 'text-warning' : 'text-ink-faint'}
          >
            <path d="M5 3l14 18M19 3L5 21" />
          </svg>
        </div>
        <h3 className="font-display font-bold text-sm">{t('app.closeConfirm.title')}</h3>
        <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
          {busyCount > 0
            ? t('app.closeConfirm.running', { count: busyCount })
            : t('app.closeConfirm.message')}
        </p>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={cancel}
            className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors"
          >
            {t('app.closeConfirm.cancel')}
          </button>
          <button
            onClick={quit}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              busyCount > 0
                ? 'bg-danger hover:bg-danger/90 text-white'
                : 'bg-accent hover:bg-accent-hover text-white'
            }`}
          >
            {t('app.closeConfirm.quit')}
          </button>
        </div>
      </div>
    </AnimatedModal>
  )
}