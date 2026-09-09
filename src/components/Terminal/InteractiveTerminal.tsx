import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
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
  const syncSizeRef = useRef<() => void>(() => {});
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
    let inputDisposable: { dispose(): void } | null = null;
    let removeContextMenu: () => void = () => {};
    let pendingInput = '';
    const startupData: Array<{ id: string; data: string }> = [];
    const startupExits = new Map<string, number | null | undefined>();
    let startupDataBytes = 0;

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
      if (mod && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'v') {
          event.preventDefault();
          readClipboard();
          return false;
        }
        // Ctrl+C without a selection is deliberately left alone: xterm emits
        // ETX (\x03), which lets the real shell interrupt the foreground job.
        // Ctrl+Shift+C always behaves as Copy, matching modern terminals.
        if (key === 'c' && (event.shiftKey || term.hasSelection())) {
          event.preventDefault();
          if (term.hasSelection()) {
            navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
            term.clearSelection();
          }
          return false;
        }
      }
      if (event.ctrlKey && event.key === 'Insert' && term.hasSelection()) {
        event.preventDefault();
        navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
        return false;
      }
      if (event.shiftKey && event.key === 'Insert') {
        event.preventDefault();
        readClipboard();
        return false;
      }
      return true;
    });

    // Subscribe before spawning the PTY. Shells can print a prompt (or exit)
    // immediately; subscribing after terminalCreate resolved left a small gap
    // where those startup events could be lost.
    const handleExit = (exitCode: number | null | undefined): void => {
      term.writeln(`\r\n\x1b[33m[process exited with code ${exitCode}]\x1b[0m`);
      onExitedRef.current?.(exitCode);
    };
    cleanupData = ipc.onTerminalData((id, data) => {
      const terminalId = termIdRef.current;
      if (terminalId) {
        if (id === terminalId) term.write(data);
        return;
      }
      // Only needed during the very short create handshake. Keep it bounded in
      // case another already-running terminal is producing heavy output.
      if (startupDataBytes < 256 * 1024) {
        startupData.push({ id, data });
        startupDataBytes += data.length;
      }
    });
    cleanupExit = ipc.onTerminalExit((id, exitCode) => {
      if (termIdRef.current) {
        if (id === termIdRef.current) handleExit(exitCode);
      } else {
        startupExits.set(id, exitCode);
      }
    });

    // xterm translates arrows, Home/End, Tab and control keys to terminal
    // escape sequences. Forward them untouched to node-pty so history and line
    // editing are provided by the user's actual shell. Buffer keystrokes made
    // during startup instead of silently dropping them.
    inputDisposable = term.onData((data) => {
      if (termIdRef.current) {
        void ipc.terminalInput(termIdRef.current, data);
      } else if (pendingInput.length < 65536) {
        pendingInput += data.slice(0, 65536 - pendingInput.length);
      }
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
    syncSizeRef.current = syncSize;

    const mount = async (): Promise<void> => {
      const container = containerRef.current;
      if (!container || disposed) return;
      term.open(container);
      const handleContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        term.focus();
        readClipboard();
      };
      container.addEventListener('contextmenu', handleContextMenu);
      removeContextMenu = () => container.removeEventListener('contextmenu', handleContextMenu);
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
      if (!termIdRef.current) {
        term.writeln('\x1b[31mFailed to start terminal: missing terminal id\x1b[0m');
        return;
      }

      for (const event of startupData) {
        if (event.id === termIdRef.current) term.write(event.data);
      }
      const startupExit = startupExits.get(termIdRef.current);
      if (startupExits.has(termIdRef.current)) handleExit(startupExit);
      startupData.length = 0;
      startupExits.clear();

      if (pendingInput) {
        void ipc.terminalInput(termIdRef.current, pendingInput);
        pendingInput = '';
      }
      // Now that the session exists, push the definitive size.
      syncSize();

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
      inputDisposable?.dispose();
      removeContextMenu();
      syncSizeRef.current = () => {};
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
      requestAnimationFrame(syncSizeRef.current);
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
