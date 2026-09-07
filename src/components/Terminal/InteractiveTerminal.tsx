import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import * as ipc from '../../utils/ipcRenderer';

interface TerminalSessionProps {
  cwd: string;
  fontSize?: number;
  onExited?: (code: number | null | undefined) => void;
}

/**
 * One PTY-backed terminal session. Remounted (via `key`) when the shell exits
 * so a fresh session can be started from the restart overlay in the parent.
 *
 * Sizing contract: the xterm viewport ALWAYS matches the container exactly
 * (FitAddon on mount, on every container resize, and on a light periodic
 * re-check), and only then are the real cols/rows relayed to the PTY. This is
 * what makes the shell behave like a real terminal — without it, xterm keeps
 * its initial 80x24 grid no matter the window size, so wide windows show a
 * narrow strip, tall output gets clipped by the container, and shell wrapping
 * never matches what is visible.
 */
function TerminalSession({ cwd, fontSize = 14, onExited }: TerminalSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const termIdRef = useRef<string | null>(null);
  // Mount-time snapshot + latest values via refs so the one-shot mount effect
  // never needs to depend on `fontSize`/`onExited` identities (which would
  // recreate the PTY session on every parent re-render).
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    let disposed = false;
    let cleanupData: () => void = () => {};
    let cleanupExit: () => void = () => {};

    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSizeRef.current || 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#08090C',
        foreground: '#e6e6e6',
        cursor: '#7c6df2',
      },
      scrollback: 5000,
      convertEol: false,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termRef.current = term;

    // Real-terminal clipboard. Chromium's default Ctrl+V does not reach xterm's
    // helper textarea (it sits at z-index:-5 behind the screen, so the renderer's
    // default paste action skips it — apps with a native menu Paste role work
    // around this, but this app runs menu-less). Intercept the keys here and
    // paste through xterm's own API instead. Ctrl+C keeps xterm's default
    // (ETX interrupt), unless there is a selection — then it copies, like
    // Windows Terminal.
    const readClipboard = (): void => {
      if (!navigator.clipboard) return;
      navigator.clipboard.readText()
        .then((text) => { if (text) term.paste(text); })
        .catch(() => {});
    };
    term.attachCustomKeyEventHandler((event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.shiftKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'v') {
          event.preventDefault();
          readClipboard();
          return false;
        }
        if (key === 'c' && term.hasSelection()) {
          event.preventDefault();
          navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
          term.clearSelection();
          return false;
        }
      }
      if (event.shiftKey && event.key === 'Insert') {
        event.preventDefault();
        readClipboard();
        return false;
      }
      return true;
    });

    // Last dims relayed to the PTY — relay only on real changes so spurious
    // container reflows never churn the pty size.
    let lastCols = 0;
    let lastRows = 0;
    let wasVisible = true;

    const syncSize = (): void => {
      const container = containerRef.current;
      if (!container || disposed) return;
      const visible = container.clientWidth > 0 && container.clientHeight > 0;
      // Refocus when the shell becomes visible again (e.g. switching back to
      // the Terminal tab) so the user can type right away, like a real terminal.
      if (visible && !wasVisible) term.focus();
      wasVisible = visible;
      if (!visible) return;
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      const { cols, rows } = term;
      if (cols === lastCols && rows === lastRows) return;
      lastCols = cols;
      lastRows = rows;
      if (termIdRef.current) ipc.terminalResize(termIdRef.current, cols, rows);
    };

    const mount = async (): Promise<void> => {
      const container = containerRef.current;
      if (!container || disposed) return;
      term.open(container);
      // Fit right away so the PTY spawns at the true viewport size. FitAddon
      // no-ops until the renderer has measured cell dimensions, so the rAF
      // retry and the ResizeObserver cover the first layout pass.
      syncSize();
      requestAnimationFrame(syncSize);
      term.focus();

      const result = await ipc.terminalCreate({
        cwd,
        cols: term.cols,
        rows: term.rows,
      });

      // Created after unmount — kill it so no orphan PTY is left behind.
      if (disposed) {
        if (result.success && result.id) ipc.terminalKill(result.id);
        return;
      }

      if (!result.success) {
        term.writeln(`\x1b[31mFailed to start terminal: ${result.error}\x1b[0m`);
        return;
      }

      termIdRef.current = result.id || null;
      // Now that the session exists, push the definitive size.
      syncSize();

      cleanupData = ipc.onTerminalData((id, data) => {
        if (id === termIdRef.current) term.write(data);
      });
      cleanupExit = ipc.onTerminalExit((id, exitCode) => {
        if (id === termIdRef.current) {
          term.writeln(`\r\n\x1b[33m[process exited with code ${exitCode}]\x1b[0m`);
          onExitedRef.current?.(exitCode);
        }
      });

      term.onData((data) => {
        if (termIdRef.current) ipc.terminalInput(termIdRef.current, data);
      });

      const resizeObserver = new ResizeObserver(syncSize);
      resizeObserver.observe(container);

      // Periodic re-check: the shell can shrink its own console size (e.g.
      // cmd's `mode con`) without notifying xterm; re-asserting our viewport
      // size keeps the PTY in sync with what is actually visible.
      const resyncTimer = window.setInterval(syncSize, 2000);

      (termRef.current as Terminal & { _resizeObserver?: ResizeObserver })._resizeObserver = resizeObserver;
      (termRef.current as Terminal & { _resyncTimer?: number })._resyncTimer = resyncTimer;
    };

    mount();

    return () => {
      disposed = true;
      cleanupData();
      cleanupExit();
      const self = termRef.current as (Terminal & { _resizeObserver?: ResizeObserver; _resyncTimer?: number }) | null;
      self?._resizeObserver?.disconnect();
      if (self?._resyncTimer) window.clearInterval(self._resyncTimer);
      if (termIdRef.current) {
        ipc.terminalKill(termIdRef.current);
        termIdRef.current = null;
      }
      term.dispose();
    };
  }, [cwd]);

  useEffect(() => {
    if (termRef.current && fontSize) {
      termRef.current.options.fontSize = fontSize;
    }
  }, [fontSize]);

  // No padding: FitAddon measures the parent box and xterm must fill it
  // exactly, otherwise the last row/column gets clipped by the container.
  return <div ref={containerRef} className="h-full w-full bg-[#08090C] rounded-lg overflow-hidden" />;
}

interface InteractiveTerminalProps {
  cwd: string;
  fontSize?: number;
  onExit?: (code: number | null | undefined) => void;
}

export default function InteractiveTerminal({ cwd, fontSize = 14, onExit }: InteractiveTerminalProps) {
  const [session, setSession] = useState(0);
  const [exited, setExited] = useState(false);
  const [exitCode, setExitCode] = useState<number | null | undefined>(null);

  const restart = (): void => {
    setExited(false);
    setExitCode(null);
    setSession((prev) => prev + 1);
  };

  return (
    <div className="relative h-full w-full">
      <TerminalSession
        key={session}
        cwd={cwd}
        fontSize={fontSize}
        onExited={(code) => {
          setExitCode(code);
          setExited(true);
          onExit?.(code);
        }}
      />
      {exited && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2.5 rounded-lg border border-border bg-surface px-5 py-4 shadow-card">
            <p className="text-xs text-ink-soft">
              Shell exited with code <span className="font-mono font-semibold text-ink">{exitCode}</span>
            </p>
            <button
              type="button"
              onClick={restart}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-accent-hover"
            >
              Restart shell
            </button>
          </div>
        </div>
      )}
    </div>
  );
}