// ─── HealthView ───────────────────────────────────────────────────────────────
// Full health & environment diagnostic view.
// Shows budget pressure, provider/env check grid, and severity-sorted issue list.
//
// Observability: query key ['health', hash] visible in React Query devtools.
// Inspect useHealth() hook for fetch status, stale time, and cached HealthDataResponse.
// Failure state: isError → renders error card with error.message.
// No-project state: data === undefined (no hash) → EmptyState renders.

import { Heartbeat } from '@phosphor-icons/react'
import { Spinner } from '@/components/primitives/Spinner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Card } from '@/components/primitives/Card'
import { useHealth } from '@/hooks/useHealth'
import { BudgetPressure } from './BudgetPressure'
import { EnvironmentChecks } from './EnvironmentChecks'
import { IssueList } from './IssueList'

export function HealthView() {
  const { data, isLoading, isError, error } = useHealth()

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
          icon={<Heartbeat size={48} />}
          heading="Failed to load health data"
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
          icon={<Heartbeat size={48} />}
          heading="Select a project"
          body="Choose a project from the connection panel to view its health diagnostics."
        />
      </Card>
    )
  }

  // ── Full health view ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <h1 className="text-xl font-semibold text-text-primary">Health &amp; Environment</h1>

      {/* Budget pressure and performance indicators */}
      <BudgetPressure
        budgetCeiling={data.budgetCeiling}
        tokenProfile={data.tokenProfile}
        truncationRate={data.truncationRate}
        continueHereRate={data.continueHereRate}
      />

      {/* Provider cards + env check grid */}
      <EnvironmentChecks
        providers={data.providers}
        environmentIssues={data.environmentIssues}
      />

      {/* Severity-sorted issue list */}
      <IssueList
        providers={data.providers}
        environmentIssues={data.environmentIssues}
        skillSummary={data.skillSummary}
      />
    </div>
  )
}
