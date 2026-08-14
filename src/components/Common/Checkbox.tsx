import type { InputHTMLAttributes } from 'react'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export default function Checkbox({ checked, onChange, onClick, className = '', ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      className={`w-3.5 h-3.5 rounded border-border bg-surface-3 accent-accent ${className}`}
      {...props}
    />
  )
}
