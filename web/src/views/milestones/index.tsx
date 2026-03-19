// ─── MilestonesView (index.tsx) ──────────────────────────────────────────────
// Sole hook call site for visualizer data. Distributes data as props to pure
// child components (react-best-practices: lift data fetching to one place).
//
// Observability:
//   - Query key ['visualizer', hash] visible in React Query devtools
//   - Invalidated on `state_change` WS events (see useVisualizer)
//   - Error state renders server error message in a Card
//   - Loading state renders centered Spinner
//   - Empty state (no milestones) renders EmptyState with FlagBanner icon
//   - No-project state (hash not selected) renders select-project EmptyState

import React from 'react'
import { FlagBanner } from '@phosphor-icons/react'
import { useVisualizer } from '@/hooks/useVisualizer'
import { Card } from '@/components/primitives/Card'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Spinner } from '@/components/primitives/Spinner'
import { MilestoneNode } from './MilestoneNode'

export function MilestonesView() {
  const { data, isLoading, isError, error } = useVisualizer()

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <Card>
        <p className="text-sm text-red-400">
          Failed to load milestones:{' '}
          <span className="font-mono">{error?.message ?? 'Unknown error'}</span>
        </p>
      </Card>
    )
  }

  // ── No project selected ──────────────────────────────────────────────────
  if (!data) {
    return (
      <EmptyState
        icon={<FlagBanner size={48} />}
        heading="Select a project"
        body="Choose a project from the sidebar to view its milestones."
      />
    )
  }

  // ── No milestones yet ────────────────────────────────────────────────────
  if (data.milestones.length === 0) {
    return (
      <EmptyState
        icon={<FlagBanner size={48} />}
        heading="No milestones"
        body="No milestones found for this project."
      />
    )
  }

  // ── Tree ─────────────────────────────────────────────────────────────────
  return (
    <Card padding={false}>
      {data.milestones.map((milestone) => (
        <MilestoneNode key={milestone.id} milestone={milestone} />
      ))}
    </Card>
  )
}
