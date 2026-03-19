// ─── CostByPhase ──────────────────────────────────────────────────────────────
// Horizontal BarChart (layout="vertical") of cost broken down by phase.
// Pure presentational — no hooks.

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card } from '@/components/primitives/Card'
import type { PhaseAggregate } from '@/lib/api/types'

interface CostByPhaseProps {
  data: PhaseAggregate[]
}

/** Phase → fill color mapping using CSS custom property tokens via hardcoded hex */
const PHASE_COLORS: Record<string, string> = {
  research:     '#3b82f6', // blue-500
  planning:     '#a855f7', // purple-500
  execution:    '#22c55e', // green-500
  completion:   '#14b8a6', // teal-500
  reassessment: '#eab308', // yellow-500
}

const DEFAULT_COLOR = '#6366f1' // indigo-500 fallback

function phaseColor(phase: string): string {
  return PHASE_COLORS[phase.toLowerCase()] ?? DEFAULT_COLOR
}

function fmtCost(value: number): string {
  return `$${value.toFixed(2)}`
}

export function CostByPhase({ data }: CostByPhaseProps) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text-primary">Cost by Phase</h2>

      {data.length === 0 ? (
        <p className="text-sm text-text-secondary py-8 text-center">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40)}>
          <BarChart
            data={data}
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
              dataKey="phase"
              width={90}
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
            <Bar dataKey="cost" radius={[0, 3, 3, 0]} maxBarSize={24}>
              {data.map((entry) => (
                <Cell key={entry.phase} fill={phaseColor(entry.phase)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
