// ─── WorkerPanel ─────────────────────────────────────────────────────────────
// Renders per-worker status rows. Only rendered when workers array is non-empty
// (conditional render enforced by parent).

import React from 'react'
import { Badge, type BadgeVariant } from '@/components/primitives/Badge'
import { Card } from '@/components/primitives/Card'
import type { WebWorkerInfo } from '@/lib/api/types'

interface WorkerPanelProps {
  workers: WebWorkerInfo[]
}

function workerStateVariant(state: string): BadgeVariant {
  if (state === 'running') return 'success'
  if (state === 'paused') return 'warning'
  if (state === 'error') return 'error'
  return 'neutral'
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(3)}`
}

function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function WorkerPanel({ workers }: WorkerPanelProps) {
  return (
    <Card className="flex flex-col gap-3">
      <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide leading-none">
        Parallel Workers
      </span>

      <ul className="flex flex-col gap-3">
        {workers.map((worker) => (
          <li
            key={worker.pid}
            className="flex items-center gap-3 min-w-0"
          >
            {/* State badge */}
            <Badge variant={workerStateVariant(worker.state)}>{worker.state}</Badge>

            {/* Milestone info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">
                {worker.title}
              </p>
              <p className="text-[11px] text-text-tertiary font-mono truncate">
                {worker.milestoneId} · pid {worker.pid}
              </p>
            </div>

            {/* Metrics */}
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-xs tabular-nums text-text-primary">
                {formatCost(worker.cost)}
              </span>
              <span className="text-[11px] tabular-nums text-text-tertiary">
                {formatElapsed(worker.startedAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
