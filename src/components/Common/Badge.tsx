import type { ReactNode } from 'react'

export type BadgeStatus = 'running' | 'starting' | 'error' | 'stopped'

interface BadgeProps {
  children?: ReactNode
  status?: BadgeStatus
  uptime?: boolean
  className?: string
}

export default function Badge({ children, status, uptime, className = '' }: BadgeProps) {
  const statusVariants: Record<BadgeStatus, string> = {
    running: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20',
    starting: 'inline-flex items-center gap-1.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning uppercase tracking-wide',
    error: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-danger/10 text-danger border border-danger/20',
    stopped: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-3 text-ink-faint border border-border',
  }

  if (status) {
    const colors: Record<BadgeStatus, string> = {
      running: '#22C55E',
      starting: '#F5A623',
      error: '#EF4444',
      stopped: '#5C6472',
    }

    return (
      <span className={statusVariants[status] || statusVariants.stopped}>
        {(status === 'running' || status === 'starting') && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[status] }}></span>
        )}
        {status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-danger"></span>}
        {status === 'stopped' && <span className="w-1.5 h-1.5 rounded-full bg-ink-faint"></span>}
        {children || status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  if (uptime) {
    return (
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-success/10 text-success ${className}`}>
        {children}
      </span>
    )
  }

  // Default badge
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded ${className}`}>
      {children}
    </span>
  )
}
