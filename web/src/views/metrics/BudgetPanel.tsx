// ─── BudgetPanel ──────────────────────────────────────────────────────────────
// Budget section: CostGauge + numeric breakdown grid.
// Pure presentational — no hooks. Handles null totals and undefined ceiling.

import React from 'react'
import { Card } from '@/components/primitives/Card'
import { CostGauge } from '@/components/primitives/CostGauge'
import type { ProjectTotals } from '@/lib/api/types'

interface BudgetPanelProps {
  spent: number
  ceiling: number | undefined
  totals: ProjectTotals | null
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`
}

export function BudgetPanel({ spent, ceiling, totals }: BudgetPanelProps) {
  const remaining = ceiling !== undefined ? ceiling - spent : undefined

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-text-primary">Budget</h2>

      <CostGauge spent={spent} ceiling={ceiling} />

      {totals === null ? (
        <p className="text-sm text-text-secondary">No cost data yet</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
          {/* Spent */}
          <div className="flex flex-col gap-0.5">
            <span className="text-text-secondary uppercase tracking-wide text-[10px] font-medium">Spent</span>
            <span className="text-text-primary font-semibold">{fmtCost(spent)}</span>
          </div>

          {/* Ceiling */}
          <div className="flex flex-col gap-0.5">
            <span className="text-text-secondary uppercase tracking-wide text-[10px] font-medium">Ceiling</span>
            <span className="text-text-primary font-semibold">
              {ceiling !== undefined ? fmtCost(ceiling) : '—'}
            </span>
          </div>

          {/* Remaining */}
          <div className="flex flex-col gap-0.5">
            <span className="text-text-secondary uppercase tracking-wide text-[10px] font-medium">Remaining</span>
            <span className="text-text-primary font-semibold">
              {remaining !== undefined ? fmtCost(remaining) : '—'}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}
