// ─── TaskNode ────────────────────────────────────────────────────────────────
// Leaf node in the M→S→T tree. Pure presentational — no hooks, no store access.
// Receives data as explicit props from SliceNode.

import React from 'react'
import { CheckCircle, Circle, Play } from '@phosphor-icons/react'
import type { VisualizerTask } from '@/lib/api/types'

interface TaskNodeProps {
  task: VisualizerTask
}

export function TaskNode({ task }: TaskNodeProps) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2 pl-20 border-b border-border/40 last:border-0 bg-bg-primary/20">
      {/* Done / active indicator */}
      {task.done ? (
        <CheckCircle size={14} weight="fill" className="text-green-400 shrink-0" />
      ) : task.active ? (
        <Play size={14} weight="fill" className="text-green-400 shrink-0" />
      ) : (
        <Circle size={14} className="text-text-tertiary shrink-0" />
      )}

      {/* ID + title */}
      <span className="text-xs font-mono text-text-tertiary shrink-0">{task.id}</span>
      <span className="text-xs text-text-primary truncate">{task.title}</span>

      {/* Estimate (optional) */}
      {task.estimate && (
        <span className="ml-auto text-[11px] text-text-tertiary shrink-0">
          ~{task.estimate}
        </span>
      )}
    </div>
  )
}
