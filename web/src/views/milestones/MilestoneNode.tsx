// ─── MilestoneNode ───────────────────────────────────────────────────────────
// Expandable milestone row in the M→S→T tree. Pure presentational — no hooks.
// Auto-expands when status is 'active'. Receives data as props from index.tsx.

import React, { useState } from 'react'
import { CaretRight, CaretDown } from '@phosphor-icons/react'
import { Badge, type BadgeVariant } from '@/components/primitives/Badge'
import type { VisualizerMilestone } from '@/lib/api/types'
import { SliceNode } from './SliceNode'

interface MilestoneNodeProps {
  milestone: VisualizerMilestone
  defaultExpanded?: boolean
}

/** Map GSD milestone status to Badge variants */
function statusVariant(status: VisualizerMilestone['status']): BadgeVariant {
  if (status === 'complete') return 'success'
  if (status === 'active') return 'info'
  if (status === 'pending') return 'neutral'
  if (status === 'parked') return 'warning'
  return 'neutral'
}

export function MilestoneNode({ milestone, defaultExpanded }: MilestoneNodeProps) {
  const [expanded, setExpanded] = useState<boolean>(
    defaultExpanded ?? milestone.status === 'active',
  )

  const doneSlices = milestone.slices.filter((s) => s.done).length
  const totalSlices = milestone.slices.length

  return (
    <div className="border-b border-border last:border-0">
      {/* ── Milestone header row ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((prev) => !prev)
          }
        }}
        className="flex items-center gap-2.5 px-4 py-3 hover:bg-bg-tertiary/50 cursor-pointer transition-colors duration-100 select-none"
      >
        {/* Status badge */}
        <Badge variant={statusVariant(milestone.status)}>{milestone.status}</Badge>

        {/* ID + title */}
        <span className="text-xs font-mono text-text-tertiary shrink-0">{milestone.id}</span>
        <span className="text-sm font-medium text-text-primary truncate">{milestone.title}</span>

        {/* Dependency chips */}
        {milestone.dependsOn.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {milestone.dependsOn.map((dep) => (
              <Badge key={dep} variant="neutral">
                needs {dep}
              </Badge>
            ))}
          </div>
        )}

        {/* Slice count + chevron */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-text-tertiary">
            ({doneSlices}/{totalSlices} slices done)
          </span>
          {expanded ? (
            <CaretDown size={14} className="text-text-tertiary" />
          ) : (
            <CaretRight size={14} className="text-text-tertiary" />
          )}
        </div>
      </div>

      {/* ── Slice list (when expanded) ── */}
      {expanded && (
        <div className="bg-bg-primary/30">
          {milestone.slices.map((slice) => (
            <SliceNode key={slice.id} slice={slice} />
          ))}
        </div>
      )}
    </div>
  )
}
