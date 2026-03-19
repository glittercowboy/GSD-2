// ─── Badge ────────────────────────────────────────────────────────────────────
// Pure presentational status badge. No store dependencies.

import React from 'react'

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-900/50 text-green-300 ring-1 ring-green-700/40',
  warning: 'bg-yellow-900/50 text-yellow-300 ring-1 ring-yellow-700/40',
  error:   'bg-red-900/50   text-red-300   ring-1 ring-red-700/40',
  info:    'bg-accent-muted text-accent     ring-1 ring-accent/20',
  neutral: 'bg-bg-tertiary  text-text-secondary ring-1 ring-border',
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-[11px] font-medium leading-none tracking-wide',
        'transition-colors duration-150',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}
