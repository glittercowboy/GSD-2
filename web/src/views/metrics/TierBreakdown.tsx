// ─── TierBreakdown ────────────────────────────────────────────────────────────
// DataTable showing per-tier usage/cost breakdown + optional savings line.
// Pure presentational — no hooks.

import React from 'react'
import { Card } from '@/components/primitives/Card'
import { DataTable } from '@/components/primitives/DataTable'
import type { DataTableColumn } from '@/components/primitives/DataTable'
import type { TierAggregate } from '@/lib/api/types'

interface TierBreakdownProps {
  data: TierAggregate[]
  tierSavingsLine: string
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`
}

const COLUMNS: DataTableColumn<TierAggregate>[] = [
  {
    key: 'tier',
    header: 'Tier',
  },
  {
    key: 'units',
    header: 'Units',
    render: (row) => row.units.toLocaleString(),
  },
  {
    key: 'cost',
    header: 'Cost',
    render: (row) => fmtCost(row.cost),
  },
  {
    key: 'downgraded',
    header: 'Downgraded',
    render: (row) => row.downgraded.toLocaleString(),
  },
]

export function TierBreakdown({ data, tierSavingsLine }: TierBreakdownProps) {
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-text-primary">Tier Breakdown</h2>
      </div>
      <DataTable<TierAggregate>
        columns={COLUMNS}
        rows={data}
        emptyMessage="No tier data yet"
      />
      {tierSavingsLine && (
        <p className="px-4 py-2 text-xs text-text-secondary">{tierSavingsLine}</p>
      )}
    </Card>
  )
}
