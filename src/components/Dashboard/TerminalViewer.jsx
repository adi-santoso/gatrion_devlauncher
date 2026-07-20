const logColorMap = {
  info: 'text-ink-soft',
  ready: 'text-success',
  warn: 'text-warning',
  error: 'text-danger',
  default: 'text-ink-soft'
};

export default function TerminalViewer({ projectName, port, pid, logs = [] }) {
  return (
    <section className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex w-2 h-2" style={{ color: '#00ADD8' }}>
            <span className="pulse-dot"></span>
            <span className="relative w-2 h-2 rounded-full bg-[#00ADD8]"></span>
          </span>
          <span className="text-sm font-medium">{projectName}</span>
          <span className="text-xs font-mono text-ink-faint">
            {port && `:${port}`} {pid && `· pid ${pid}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
            title="Copy"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
            title="Clear"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="scan-line bg-[#08090C] px-5 py-4 font-mono text-[12.5px] leading-relaxed h-52 overflow-y-auto">
        {logs.map((log, index) => (
          <p key={index}>
            <span className="text-ink-faint">{log.time}</span>{' '}
            <span className={logColorMap[log.level] || logColorMap.default}>[{log.level}]</span>{' '}
            {log.message}
          </p>
        ))}
        <p className="text-accent">▍</p>
      </div>
    </section>
  );
}
