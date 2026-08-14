import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success' | 'danger' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
  variant?: ButtonVariant
  icon?: ReactNode
  ariaLabel?: string
}

// Button component matching DevLauncher template exactly
export default function Button({
  children,
  onClick,
  variant = 'primary',
  icon,
  disabled,
  className = '',
  ariaLabel,
  title,
  ...props
}: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors',
    secondary: 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors',
    ghost: 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors',
    destructive: 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium border border-danger/20 transition-colors',
    success: 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/15 text-sm font-medium transition-colors',
    danger: 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15 text-sm font-medium transition-colors',
    icon: 'w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-faint hover:text-ink transition-colors',
  }

  const btnContent = (
    <>
      {icon && <span className="inline-block">{icon}</span>}
      {children}
    </>
  )

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || title}
      title={title || undefined}
      className={`${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {btnContent}
    </button>
  )
}
