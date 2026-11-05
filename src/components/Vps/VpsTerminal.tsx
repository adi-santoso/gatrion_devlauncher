/**
 * Remote SSH terminal (PTY) for one server. The PTY lives in the main process
 * and survives tab switches inside the VPS view; unmounting closes it so a
 * server switch can never write to another server's shell.
 */
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useI18n } from '../../i18n/I18nContext'
import { closeVpsTerminal, onVpsTerminalClose, onVpsTerminalData, openVpsTerminal, resizeVpsTerminal, sendVpsTerminalInput } from '../../data/vps'

interface VpsTerminalProps {
  serverId: string
  fontSize?: number
}

// A stale mount must never close the shell adopted by a newer mount.
const terminalOwners = new Map<string, symbol>()

export default function VpsTerminal({ serverId, fontSize = 13 }: VpsTerminalProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let opened = false
    const owner = Symbol(serverId)
    terminalOwners.set(serverId, owner)
    setError(null)

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: { background: '#08090C', foreground: '#e6e6e6', cursor: '#7c6df2' },
      scrollback: 5000,
      convertEol: false,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    term.attachCustomKeyEventHandler((event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v'
        || event.shiftKey && event.key === 'Insert') {
        event.preventDefault()
        if (event.type === 'keydown') void navigator.clipboard?.readText().then((text) => term.paste(text)).catch(() => {})
        return false
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && (term.hasSelection() || event.shiftKey)) {
        event.preventDefault()
        if (event.type === 'keydown' && term.hasSelection()) {
          void navigator.clipboard?.writeText(term.getSelection()).catch(() => {})
          term.clearSelection()
        }
        return false
      }
      return true // Ctrl+C without a selection remains the remote ETX interrupt.
    })

    const refit = (): void => {
      if (!container.clientWidth || !container.clientHeight) return
      try { fitAddon.fit() } catch { /* container hidden */ }
    }
    refit()

    let unsubData: () => void = () => {}
    let unsubClose: () => void = () => {}
    let dataDisposable: { dispose(): void } | null = null
    let resizeDisposable: { dispose(): void } | null = null

    const start = async (): Promise<void> => {
      // StrictMode's discarded mount is cleaned up before this microtask.
      await Promise.resolve()
      if (disposed) return
      const cols = Math.max(term.cols || 80, 20)
      const rows = Math.max(term.rows || 24, 5)
      const result = await openVpsTerminal(serverId, cols, rows)
      if (disposed) {
        if (!terminalOwners.has(serverId)) void closeVpsTerminal(serverId)
        return
      }
      if (!result?.success) {
        setError(result?.error || t('vps.terminalFailed'))
        term.writeln(`\r\n${result?.error || t('vps.terminalFailed')}`)
        return
      }
      setStarted(true)
      opened = true
      term.writeln(t('vps.terminalConnected'))
      unsubData = onVpsTerminalData((id, data) => {
        if (id === serverId) term.write(data)
      })
      unsubClose = onVpsTerminalClose((id) => {
        if (id !== serverId) return
        term.writeln(`\r\n${t('vps.terminalClosed')}`)
        setStarted(false)
      })
      dataDisposable = term.onData((data) => { void sendVpsTerminalInput(serverId, data) })
      resizeDisposable = term.onResize(({ cols: c, rows: r }) => { void resizeVpsTerminal(serverId, c, r) })
    }

    void start().catch((cause: unknown) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : t('vps.terminalFailed'))
    })

    const observer = new ResizeObserver(() => {
      refit()
    })
    observer.observe(container)
    const tick = window.setInterval(refit, 1000)

    return () => {
      disposed = true
      window.clearInterval(tick)
      observer.disconnect()
      unsubData()
      unsubClose()
      dataDisposable?.dispose()
      resizeDisposable?.dispose()
      term.dispose()
      if (terminalOwners.get(serverId) === owner) {
        terminalOwners.delete(serverId)
        if (opened) void closeVpsTerminal(serverId)
      }
    }
  }, [serverId, fontSize, t])

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
        <span className={`w-2 h-2 rounded-full ${started ? 'bg-success' : 'bg-ink-faint'}`} aria-hidden="true" />
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-faint">{t('vps.remoteTerminal')}</span>
        {error && <span className="ml-auto text-[10px] text-danger truncate">{error}</span>}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 bg-[#08090C] p-1" />
    </div>
  )
}
