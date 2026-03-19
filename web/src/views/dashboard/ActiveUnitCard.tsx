// ─── ActiveUnitCard ───────────────────────────────────────────────────────────
// Shows the currently running unit with a live elapsed timer.
// Timer uses setInterval(1000) in useEffect — cleared on unmount and unit change.

import React, { useEffect, useState } from 'react'
import { Timer } from '@phosphor-icons/react'
import { Badge, type BadgeVariant } from '@/components/primitives/Badge'
import { Card } from '@/components/primitives/Card'
import { EmptyState } from '@/components/primitives/EmptyState'

interface ActiveUnitCardProps {
  currentUnit: { type: string; id: string; startedAt: number } | null
}

/** Map unit type strings to a badge variant */
function unitTypeVariant(type: string): BadgeVariant {
  if (type === 'milestone') return 'info'
  if (type === 'slice') return 'success'
  if (type === 'task') return 'neutral'
  return 'neutral'
}

/** Format milliseconds to "Xm Ys" or "Xh Ym" */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m ${seconds}s`
}

export function ActiveUnitCard({ currentUnit }: ActiveUnitCardProps) {
  const [elapsed, setElapsed] = useState<number>(
    currentUnit ? Date.now() - currentUnit.startedAt : 0
  )

  useEffect(() => {
    if (!currentUnit) {
      setElapsed(0)
      return
    }

    // Immediately update on unit change
    setElapsed(Date.now() - currentUnit.startedAt)

    const id = setInterval(() => {
      setElapsed(Date.now() - currentUnit.startedAt)
    }, 1000)

    return () => clearInterval(id)
  }, [currentUnit?.startedAt])

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide leading-none">
          Active Unit
        </span>
        {currentUnit && (
          <Badge variant={unitTypeVariant(currentUnit.type)}>
            {currentUnit.type}
          </Badge>
        )}
      </div>

      {currentUnit ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text-primary font-mono leading-snug break-all">
            {currentUnit.id}
          </p>
          <div className="flex items-center gap-1.5 text-text-tertiary">
            <Timer size={13} weight="duotone" />
            <span className="text-xs tabular-nums">{formatElapsed(elapsed)}</span>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Timer size={32} />}
          heading="No active unit"
          body="Waiting for auto-mode to start a unit."
          className="py-6"
        />
      )}
    </Card>
  )
}
