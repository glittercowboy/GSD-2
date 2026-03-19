// ─── ModelUsage ───────────────────────────────────────────────────────────────
// DataTable showing per-model token/cost breakdown.
// Pure presentational — no hooks.

import React from 'react'
import { Card } from '@/components/primitives/Card'
import { DataTable } from '@/components/primitives/DataTable'
import type { DataTableColumn } from '@/components/primitives/DataTable'
import type { ModelAggregate } from '@/lib/api/types'

interface ModelUsageProps {
  data: ModelAggregate[]
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`
}

const COLUMNS: DataTableColumn<ModelAggregate>[] = [
  {
    key: 'model',
    header: 'Model',
  },
  {
    key: 'units',
    header: 'Units',
    render: (row) => row.units.toLocaleString(),
  },
  {
    key: 'tokens',
    header: 'Total Tokens',
    render: (row) => formatTokens(row.tokens.total),
  },
  {
    key: 'cost',
    header: 'Cost',
    render: (row) => fmtCost(row.cost),
  },
  {
    key: 'avgCostPerUnit',
    header: 'Avg Cost/Unit',
    render: (row) => (row.units > 0 ? fmtCost(row.cost / row.units) : '—'),
  },
]

export function ModelUsage({ data }: ModelUsageProps) {
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-text-primary">Model Usage</h2>
      </div>
      <DataTable<ModelAggregate>
        columns={COLUMNS}
        rows={data}
        emptyMessage="No model data yet"
      />
    </Card>
  )
}
