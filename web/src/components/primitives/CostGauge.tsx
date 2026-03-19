// ─── CostGauge ────────────────────────────────────────────────────────────────
// Budget visualization using ProgressBar. Handles undefined ceiling gracefully.
// Pure presentational — no store or hook dependencies.

import React from 'react'
import { ProgressBar } from '@/components/primitives/ProgressBar'
import type { ProgressBarVariant } from '@/components/primitives/ProgressBar'

interface CostGaugeProps {
  /** Amount spent so far (in dollars) */
  spent: number
  /** Budget ceiling (in dollars). When undefined, renders a muted "no ceiling" message. */
  ceiling: number | undefined
  className?: string
}

/**
 * Renders a budget progress bar with variant-based coloring:
 * - default  (< 75%)
 * - warning  (75–89%)
 * - error    (≥ 90%)
 *
 * When ceiling is undefined, renders "No budget ceiling set" in muted text.
 */
export function CostGauge({ spent, ceiling, className }: CostGaugeProps) {
  if (ceiling === undefined) {
    return (
      <p className={['text-sm text-text-secondary', className].filter(Boolean).join(' ')}>
        No budget ceiling set
      </p>
    )
  }

  const pct = Math.min(100, (spent / ceiling) * 100)

  const variant: ProgressBarVariant =
    pct < 75 ? 'default' : pct < 90 ? 'warning' : 'error'

  const label = `$${spent.toFixed(2)} / $${ceiling.toFixed(2)}`

  return (
    <div className={className}>
      <ProgressBar value={pct} variant={variant} label={label} />
    </div>
  )
}
