// ─── CostBySlice ──────────────────────────────────────────────────────────────
// Horizontal BarChart (layout="vertical") of cost broken down by slice.
// Sorted by cost descending. Pure presentational — no hooks.

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card } from '@/components/primitives/Card'
import type { SliceAggregate } from '@/lib/api/types'

interface CostBySliceProps {
  data: SliceAggregate[]
}

const ACCENT_COLOR = '#6366f1' // indigo-500 — matches app accent

function fmtCost(value: number): string {
  return `$${value.toFixed(2)}`
}

export function CostBySlice({ data }: CostBySliceProps) {
  const sorted = [...data].sort((a, b) => b.cost - a.cost)

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text-primary">Cost by Slice</h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-text-secondary py-8 text-center">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 40)}>
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 4, right: 48, left: 16, bottom: 4 }}
          >
            <XAxis
              type="number"
              tickFormatter={fmtCost}
              tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #888)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sliceId"
              width={60}
              tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #888)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => [fmtCost(value), 'Cost']}
              contentStyle={{
                background: 'var(--color-bg-secondary, #1a1a1a)',
                border: '1px solid var(--color-border, #333)',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--color-text-primary, #fff)', marginBottom: 4 }}
            />
            <Bar dataKey="cost" fill={ACCENT_COLOR} radius={[0, 3, 3, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
