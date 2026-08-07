import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import * as ipc from '../../utils/ipcRenderer';

export default function InteractiveTerminal({ cwd, fontSize = 14, onExit }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const termIdRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let cleanupData = () => {};
    let cleanupExit = () => {};

    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize || 14,
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

    const mount = async () => {
      if (!containerRef.current || disposed) return;
      term.open(containerRef.current);
      term.focus();

      const result = await ipc.terminalCreate({
        cwd,
        cols: term.cols,
        rows: term.rows,
      });

      if (disposed) return;

      if (!result.success) {
        term.writeln(`\x1b[31mFailed to start terminal: ${result.error}\x1b[0m`);
        return;
      }

      termIdRef.current = result.id;

      cleanupData = ipc.onTerminalData((id, data) => {
        if (id === termIdRef.current) term.write(data);
      });
      cleanupExit = ipc.onTerminalExit((id, exitCode) => {
        if (id === termIdRef.current) {
          term.writeln(`\r\n\x1b[33m[process exited with code ${exitCode}]\x1b[0m`);
          onExit?.(exitCode);
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

      termRef.current._resizeObserver = resizeObserver;
    };

    mount();

    return () => {
      disposed = true;
      cleanupData();
      cleanupExit();
      termRef.current?._resizeObserver?.disconnect();
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
