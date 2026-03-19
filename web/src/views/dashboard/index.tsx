// ─── DashboardView (index.tsx) ────────────────────────────────────────────────
// Live dashboard. Calls useGSDState + useCommand once; distributes data
// as props to pure child components (lift data fetching, one fetch boundary).
//
// Layout (top to bottom):
//   1. Top row: phase badge + active milestone title + auto control buttons
//   2. Active unit card (hidden when idle — ActiveUnitCard returns null internally)
//   3. Progress bars (milestones / slices / tasks)
//   4. Cost + token stats (two side-by-side StatCards)
//   5. Recent completed units list
//   6. Parallel worker panel (hidden when no workers)
//
// Observability:
//   - Query key ['state', hash] visible in React Query devtools
//   - WS state_change/unit_start/unit_complete events trigger immediate refetch
//   - Command errors render inline as a red banner (cmd.error.message)
//   - Filter browser console for '[gsd-web]' to see WS invalidation log lines
//   - window.__queryClient.getQueryState(['state', hash]) — inspect cache state in dev

import React from 'react'
import { useGSDState } from '@/hooks/useGSDState'
import { useCommand } from '@/hooks/useCommand'
import { PhaseTimeline } from './PhaseTimeline'
import { ActiveUnitCard } from './ActiveUnitCard'
import { ProgressSection } from './ProgressSection'
import { CostTicker } from './CostTicker'
import { RecentUnits } from './RecentUnits'
import { WorkerPanel } from './WorkerPanel'
import { AutoControls } from './AutoControls'
import { Card } from '@/components/primitives/Card'
import { Spinner } from '@/components/primitives/Spinner'

export function DashboardView() {
  const { data: state, isLoading, isError, error } = useGSDState()
  const { execute, isPending, error: cmdError } = useCommand()

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <Card>
        <p className="text-sm text-red-400">
          Failed to load project state:{' '}
          <span className="font-mono">{error?.message ?? 'Unknown error'}</span>
        </p>
      </Card>
    )
  }

  // ── No project selected ──────────────────────────────────────────────────
  if (!state) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Select a project to view the dashboard.
        </p>
      </div>
    )
  }

  const autoStatus = state.autoStatus
  const active = autoStatus?.active ?? false
  const paused = autoStatus?.paused ?? false

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* ── Top row: phase badge + milestone title + auto controls ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <PhaseTimeline phase={state.phase} />
          {state.activeMilestone && (
            <span className="text-sm text-[var(--color-text-tertiary)]">
              {state.activeMilestone.title}
            </span>
          )}
        </div>

        <AutoControls
          active={active}
          paused={paused}
          onPause={() => execute('pause_auto')}
          onStop={() => execute('stop_auto')}
          isPending={isPending}
        />
      </div>

      {/* ── Command error banner ── */}
      {cmdError && (
        <div className="rounded-md bg-red-900/30 border border-red-700/40 px-3 py-2 text-xs text-red-300">
          Command failed: {cmdError.message}
        </div>
      )}

      {/* ── Active unit card (hides itself when idle) ── */}
      <ActiveUnitCard currentUnit={autoStatus?.currentUnit ?? null} />

      {/* ── Progress bars ── */}
      <ProgressSection progress={state.progress} />

      {/* ── Cost + tokens (only shown when auto-mode has run) ── */}
      {autoStatus && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CostTicker
            totalCost={autoStatus.totalCost}
            totalTokens={autoStatus.totalTokens}
          />
        </div>
      )}

      {/* ── Recent completed units ── */}
      <RecentUnits completedUnits={autoStatus?.completedUnits ?? []} />

      {/* ── Parallel worker panel (hidden when no workers) ── */}
      {state.workerStatuses && state.workerStatuses.length > 0 && (
        <WorkerPanel workers={state.workerStatuses} />
      )}
    </div>
  )
}
