// ─── SliceNode ───────────────────────────────────────────────────────────────
// Expandable slice row in the M→S→T tree. Pure presentational — no hooks.
// Auto-expands when the slice is active. Receives data as props from MilestoneNode.

import React, { useState } from 'react'
import { CheckCircle, Circle, CaretRight, CaretDown } from '@phosphor-icons/react'
import { Badge, type BadgeVariant } from '@/components/primitives/Badge'
import type { VisualizerSlice } from '@/lib/api/types'
import { TaskNode } from './TaskNode'

interface SliceNodeProps {
  slice: VisualizerSlice
}

/** Map GSD risk levels to Badge variants */
function riskVariant(risk: string): BadgeVariant {
  if (risk === 'high') return 'error'
  if (risk === 'medium') return 'warning'
  return 'neutral'
}

export function SliceNode({ slice }: SliceNodeProps) {
  const [expanded, setExpanded] = useState<boolean>(slice.active)

  const doneTasks = slice.tasks.filter((t) => t.done).length
  const totalTasks = slice.tasks.length
  const hasTasks = totalTasks > 0

  return (
    <div>
      {/* ── Slice header row ── */}
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
        className="flex items-center gap-2.5 px-4 py-2.5 pl-10 border-b border-border/50 hover:bg-bg-tertiary/50 cursor-pointer transition-colors duration-100 select-none"
      >
        {/* Done indicator */}
        {slice.done ? (
          <CheckCircle size={15} weight="fill" className="text-green-400 shrink-0" />
        ) : (
          <Circle size={15} className="text-text-tertiary shrink-0" />
        )}

        {/* Risk badge */}
        <Badge variant={riskVariant(slice.risk)}>{slice.risk}</Badge>

        {/* ID + title */}
        <span className="text-xs font-mono text-text-tertiary shrink-0">{slice.id}</span>
        <span className="text-sm text-text-primary truncate">{slice.title}</span>

        {/* Dependency chips */}
        {slice.depends.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {slice.depends.map((dep) => (
              <Badge key={dep} variant="neutral">
                needs {dep}
              </Badge>
            ))}
          </div>
        )}

        {/* Task fraction + chevron */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {hasTasks && (
            <span className="text-[11px] text-text-tertiary">
              ({doneTasks}/{totalTasks} tasks)
            </span>
          )}
          {hasTasks && (
            expanded ? (
              <CaretDown size={12} className="text-text-tertiary" />
            ) : (
              <CaretRight size={12} className="text-text-tertiary" />
            )
          )}
        </div>
      </div>

      {/* ── Task list (when expanded) ── */}
      {expanded && hasTasks && (
        <div>
          {slice.tasks.map((task) => (
            <TaskNode key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
