// ─── VisualizerView ───────────────────────────────────────────────────────────
// Dependency DAG view — renders milestone dependency graph with dagre layout.
// Critical path nodes/edges are highlighted in accent color.
//
// Observability: query key ['visualizer', hash] visible in React Query devtools.
// Load/error/empty states are all rendered explicitly for debuggability.

import { GitBranch } from '@phosphor-icons/react'
import { Spinner } from '@/components/primitives/Spinner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Card } from '@/components/primitives/Card'
import { useVisualizer } from '@/hooks/useVisualizer'
import { DependencyDAG } from './DependencyDAG'
import { CriticalPath } from './CriticalPath'

export function VisualizerView() {
  const { data, isLoading, isError, error } = useVisualizer()

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={<GitBranch size={48} />}
          heading="Failed to load visualizer"
          body={error?.message ?? 'An unexpected error occurred. Check the console for details.'}
        />
      </Card>
    )
  }

  // ── No project selected ──────────────────────────────────────────────────
  if (!data) {
    return (
      <Card>
        <EmptyState
          icon={<GitBranch size={48} />}
          heading="Select a project"
          body="Choose a project from the connection panel to view its dependency graph."
        />
      </Card>
    )
  }

  // ── No milestones ────────────────────────────────────────────────────────
  if (data.milestones.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<GitBranch size={48} />}
          heading="No milestones"
          body="This project has no milestones yet. Start planning to build the dependency graph."
        />
      </Card>
    )
  }

  // ── Full DAG view ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* DAG canvas */}
      <DependencyDAG
        milestones={data.milestones}
        criticalPath={data.criticalPath}
      />

      {/* Critical path legend */}
      <CriticalPath criticalPath={data.criticalPath} />
    </div>
  )
}
