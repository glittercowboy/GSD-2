// ─── BudgetPressure ───────────────────────────────────────────────────────────
// Budget ceiling display and performance metrics (token profile, truncation rate,
// continue-here rate). Uses StatCard for metrics layout.
// Observability: data sourced from useHealth() ['health', hash] query.

import React from 'react'
import { Card } from '@/components/primitives/Card'
import { StatCard } from '@/components/primitives/StatCard'

interface BudgetPressureProps {
  budgetCeiling: number | undefined
  tokenProfile: string
  truncationRate: number
  continueHereRate: number
}

// ── Progress bar row ──────────────────────────────────────────────────────────

function RateRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  const barColor =
    pct < 10 ? 'bg-green-500' : pct < 30 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="text-xs font-medium text-text-primary tabular-nums">
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-bg-tertiary overflow-hidden">
        <div
          className={['h-full rounded-full transition-all duration-300', barColor].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BudgetPressure({
  budgetCeiling,
  tokenProfile,
  truncationRate,
  continueHereRate,
}: BudgetPressureProps) {
  return (
    <div className="space-y-4">
      {/* ── Stat row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          label="Budget Ceiling"
          value={
            budgetCeiling !== undefined
              ? `$${budgetCeiling.toFixed(2)}`
              : '—'
          }
          sub={budgetCeiling === undefined ? 'No ceiling set' : undefined}
        />
        <StatCard
          label="Token Profile"
          value={tokenProfile || '—'}
          sub="active context tier"
        />
      </div>

      {/* ── Rate bars ─────────────────────────────────────────────────── */}
      <Card>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Performance Indicators
          </p>
          <RateRow label="Truncation Rate" value={truncationRate} />
          <RateRow label="Continue-Here Rate" value={continueHereRate} />
        </div>
      </Card>
    </div>
  )
}
