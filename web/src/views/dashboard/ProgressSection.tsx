// ─── ProgressSection ─────────────────────────────────────────────────────────
// Renders three ProgressBar instances for milestones, slices, and tasks.
// When progress is undefined, renders a muted placeholder.

import React from 'react'
import { ProgressBar } from '@/components/primitives/ProgressBar'
import { Card } from '@/components/primitives/Card'

interface ProgressSectionProps {
  progress?: {
    milestones: { done: number; total: number }
    slices?: { done: number; total: number }
    tasks?: { done: number; total: number }
  }
}

function pct(done: number, total: number): number {
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}

function progressLabel(label: string, done: number, total: number): string {
  return `${label}: ${done}/${total}`
}

export function ProgressSection({ progress }: ProgressSectionProps) {
  return (
    <Card className="flex flex-col gap-4">
      <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide leading-none">
        Progress
      </span>

      {progress ? (
        <div className="flex flex-col gap-3">
          <ProgressBar
            value={pct(progress.milestones.done, progress.milestones.total)}
            label={progressLabel('Milestones', progress.milestones.done, progress.milestones.total)}
          />
          <ProgressBar
            value={pct(
              progress.slices?.done ?? 0,
              progress.slices?.total ?? 0
            )}
            label={progressLabel(
              'Slices',
              progress.slices?.done ?? 0,
              progress.slices?.total ?? 0
            )}
          />
          <ProgressBar
            value={pct(
              progress.tasks?.done ?? 0,
              progress.tasks?.total ?? 0
            )}
            label={progressLabel(
              'Tasks',
              progress.tasks?.done ?? 0,
              progress.tasks?.total ?? 0
            )}
          />
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">No progress data available.</p>
      )}
    </Card>
  )
}
