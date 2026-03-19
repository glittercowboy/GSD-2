// ─── ProgressBar ──────────────────────────────────────────────────────────────
// Pure presentational progress bar. No store dependencies.

import React from 'react'

export type ProgressBarVariant = 'default' | 'success' | 'warning' | 'error'

interface ProgressBarProps {
  /** Current progress value, 0–100 */
  value: number
  label?: string
  variant?: ProgressBarVariant
  className?: string
}

const variantFillClass: Record<ProgressBarVariant, string> = {
  default: 'bg-accent',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error:   'bg-red-500',
}

export function ProgressBar({
  value,
  label,
  variant = 'default',
  className = '',
}: ProgressBarProps) {
  // Clamp value to [0, 100]
  const pct = Math.min(100, Math.max(0, value))

  return (
    <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      {/* Track */}
      <div className="w-full h-2 rounded-full bg-bg-tertiary overflow-hidden">
        {/* Fill */}
        <div
          className={['h-full rounded-full transition-all duration-300', variantFillClass[variant]].join(' ')}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {/* Optional label */}
      {label !== undefined && (
        <span className="text-[11px] text-text-secondary leading-none">{label}</span>
      )}
    </div>
  )
}
