import React from 'react'

function Badge({ children, variant = 'default', size = 'md', className = '' }) {
  const baseClasses = 'inline-flex items-center justify-center font-semibold rounded-full'

  const variants = {
    default: 'bg-gray-700 text-gray-300 border border-gray-600',
    success: 'bg-green-900/30 text-green-400 border border-green-800/50 ring-1 ring-green-500/20',
    warning: 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/50 ring-1 ring-yellow-500/20',
    error: 'bg-red-900/30 text-red-400 border border-red-800/50 ring-1 ring-red-500/20',
    info: 'bg-blue-900/30 text-blue-400 border border-blue-800/50 ring-1 ring-blue-500/20',
    primary: 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-900/50',
    count: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs font-bold shadow-lg',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }

  const variantClasses = variants[variant] || variants.default
  const sizeClasses = sizes[size]

  return (
    <span className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}>
      {children}
    </span>
  )
}

export default Badge
