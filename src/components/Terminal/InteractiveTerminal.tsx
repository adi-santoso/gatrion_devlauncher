import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
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
      scrollback: 1000,
      convertEol: false,
    });
    termRef.current = term;

    const mount = async (): Promise<void> => {
      if (!containerRef.current || disposed) return;
      term.open(containerRef.current);
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

      const resizeObserver = new ResizeObserver(() => {
        if (!termIdRef.current || !containerRef.current) return;
        const { cols, rows } = term;
        ipc.terminalResize(termIdRef.current, cols, rows);
      });
      resizeObserver.observe(containerRef.current);

      (termRef.current as Terminal & { _resizeObserver?: ResizeObserver })._resizeObserver = resizeObserver;
    };

    mount();

    return () => {
      disposed = true;
      cleanupData();
      cleanupExit();
      (termRef.current as (Terminal & { _resizeObserver?: ResizeObserver }) | null)?._resizeObserver?.disconnect();
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

  return <div ref={containerRef} className="h-full w-full bg-[#08090C] rounded-lg overflow-hidden p-1" />;
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
