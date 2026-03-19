// ─── MetricsView ──────────────────────────────────────────────────────────────
// Sole hook call site for metrics data. All sub-components receive data as props.
// Layout: 3-row responsive grid (Budget+Cache / CostByPhase+CostBySlice / ModelUsage+Tier).

import React from 'react'
import { ChartBar } from '@phosphor-icons/react'
import { useMetrics } from '@/hooks/useMetrics'
import { Card } from '@/components/primitives/Card'
import { Spinner } from '@/components/primitives/Spinner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { BudgetPanel } from './BudgetPanel'
import { CacheStats } from './CacheStats'
import { CostByPhase } from './CostByPhase'
import { CostBySlice } from './CostBySlice'
import { ModelUsage } from './ModelUsage'
import { TierBreakdown } from './TierBreakdown'

export function MetricsView() {
  const { data, isLoading, isError, error } = useMetrics()

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <Card>
        <p className="text-sm text-error font-medium">
          Failed to load metrics: {error?.message ?? 'Unknown error'}
        </p>
      </Card>
    )
  }

  // ── No project selected ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <Card>
        <EmptyState
          icon={<ChartBar size={48} />}
          heading="No project selected"
          body="Select a project from the sidebar to view its metrics."
        />
      </Card>
    )
  }

  const {
    totals,
    byPhase,
    bySlice,
    byModel,
    byTier,
    tierSavingsLine,
    budgetCeiling,
  } = data

  const spent = totals?.cost ?? 0

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: Budget + Cache stats */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BudgetPanel spent={spent} ceiling={budgetCeiling} totals={totals} />
        <div className="flex flex-col justify-center">
          <CacheStats totals={totals} />
        </div>
      </div>

      {/* Row 2: Cost by Phase + Cost by Slice */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CostByPhase data={byPhase} />
        <CostBySlice data={bySlice} />
      </div>

      {/* Row 3: Model Usage + Tier Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ModelUsage data={byModel} />
        <TierBreakdown data={byTier} tierSavingsLine={tierSavingsLine} />
      </div>
    </div>
  )
}
