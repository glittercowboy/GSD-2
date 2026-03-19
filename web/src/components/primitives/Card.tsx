// ─── Card ─────────────────────────────────────────────────────────────────────
// Pure presentational container. No store dependencies.

import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  /** Apply default padding (default: true) */
  padding?: boolean
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div
      className={[
        'bg-bg-secondary rounded-lg border border-border',
        padding && 'p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
