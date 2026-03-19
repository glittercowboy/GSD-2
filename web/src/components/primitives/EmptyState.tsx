// ─── EmptyState ───────────────────────────────────────────────────────────────
// Centered placeholder for empty data states and stub views.
// No store dependencies.

import React from 'react'

interface EmptyStateProps {
  icon: React.ReactNode
  heading: string
  body?: string
  className?: string
}

export function EmptyState({ icon, heading, body, className = '' }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 py-16 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Icon — large, muted */}
      <div className="text-text-tertiary [&>svg]:size-12 [&>svg]:opacity-60">
        {icon}
      </div>

      {/* Heading */}
      <p
        className="text-lg font-medium text-text-primary"
        style={{ textWrap: 'balance' } as React.CSSProperties}
      >
        {heading}
      </p>

      {/* Optional body */}
      {body && (
        <p
          className="max-w-xs text-sm text-text-secondary leading-relaxed"
          style={{ textWrap: 'pretty' } as React.CSSProperties}
        >
          {body}
        </p>
      )}
    </div>
  )
}
