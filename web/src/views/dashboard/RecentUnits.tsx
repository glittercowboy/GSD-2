// ─── RecentUnits ─────────────────────────────────────────────────────────────
// Shows the last 10 completed units (most recent first) with type badge,
// unit id, and duration.

import React from 'react'
import { Badge, type BadgeVariant } from '@/components/primitives/Badge'
import { Card } from '@/components/primitives/Card'

interface CompletedUnit {
  type: string
  id: string
  startedAt: number
  finishedAt: number
}

interface RecentUnitsProps {
  completedUnits: CompletedUnit[]
}

function unitTypeVariant(type: string): BadgeVariant {
  if (type === 'milestone') return 'info'
  if (type === 'slice') return 'success'
  if (type === 'task') return 'neutral'
  return 'neutral'
}

/** Format duration ms to a short human string */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function RecentUnits({ completedUnits }: RecentUnitsProps) {
  // Last 10, most recent first
  const recent = [...completedUnits].slice(-10).reverse()

  return (
    <Card className="flex flex-col gap-3">
      <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide leading-none">
        Recent Units
      </span>

      {recent.length === 0 ? (
        <p className="text-xs text-text-tertiary">No completed units yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((unit) => (
            <li
              key={`${unit.type}-${unit.id}-${unit.finishedAt}`}
              className="flex items-center gap-2 min-w-0"
            >
              <Badge variant={unitTypeVariant(unit.type)}>{unit.type}</Badge>
              <span className="flex-1 truncate text-xs text-text-primary font-mono">
                {unit.id}
              </span>
              <span className="text-xs text-text-tertiary tabular-nums shrink-0">
                {formatDuration(unit.finishedAt - unit.startedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
