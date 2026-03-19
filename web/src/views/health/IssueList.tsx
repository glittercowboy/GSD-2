// ─── IssueList ────────────────────────────────────────────────────────────────
// Severity-sorted flat list of all issues from providers, env checks, and skills.
// Observability: data sourced from useHealth() ['health', hash] query.
// Empty state fires when no issues are found across all sources.

import React from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { Card } from '@/components/primitives/Card'
import { Badge } from '@/components/primitives/Badge'
import type { ProviderStatusSummary, EnvironmentCheckResult, SkillSummaryInfo } from '@/lib/api/types'
import type { BadgeVariant } from '@/components/primitives/Badge'

interface IssueListProps {
  providers: ProviderStatusSummary[]
  environmentIssues: EnvironmentCheckResult[]
  skillSummary: SkillSummaryInfo
}

// ── Issue shape ───────────────────────────────────────────────────────────────

type IssueSeverity = 'error' | 'warning' | 'info'

interface Issue {
  id: string
  severity: IssueSeverity
  source: string
  description: string
  detail?: string
}

const severityOrder: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 }
const severityVariant: Record<IssueSeverity, BadgeVariant> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
}

// ── Issue collection ──────────────────────────────────────────────────────────

function collectIssues(
  providers: ProviderStatusSummary[],
  environmentIssues: EnvironmentCheckResult[],
  skillSummary: SkillSummaryInfo,
): Issue[] {
  const issues: Issue[] = []

  // Failing providers
  for (const p of providers) {
    if (!p.ok) {
      issues.push({
        id: `provider:${p.name}`,
        severity: p.required ? 'error' : 'warning',
        source: `Provider · ${p.label}`,
        description: p.message,
      })
    }
  }

  // Environment issues (non-ok)
  for (const e of environmentIssues) {
    if (e.status !== 'ok') {
      issues.push({
        id: `env:${e.name}`,
        severity: e.status === 'error' ? 'error' : 'warning',
        source: `Environment · ${e.name}`,
        description: e.message,
        detail: e.detail,
      })
    }
  }

  // Skill criticals / warnings
  if (skillSummary.criticalCount > 0) {
    issues.push({
      id: 'skills:critical',
      severity: 'error',
      source: 'Skills',
      description: `${skillSummary.criticalCount} critical skill issue${skillSummary.criticalCount > 1 ? 's' : ''}${
        skillSummary.topIssue ? `: ${skillSummary.topIssue}` : ''
      }`,
    })
  } else if (skillSummary.warningCount > 0) {
    issues.push({
      id: 'skills:warning',
      severity: 'warning',
      source: 'Skills',
      description: `${skillSummary.warningCount} skill warning${skillSummary.warningCount > 1 ? 's' : ''}${
        skillSummary.topIssue ? `: ${skillSummary.topIssue}` : ''
      }`,
    })
  }

  // Sort by severity
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}

// ── Main component ────────────────────────────────────────────────────────────

export function IssueList({ providers, environmentIssues, skillSummary }: IssueListProps) {
  const issues = collectIssues(providers, environmentIssues, skillSummary)

  // ── Empty state ──────────────────────────────────────────────────────────
  if (issues.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle size={32} className="text-green-400 opacity-80" />
          <p className="text-sm font-medium text-text-primary">No issues detected</p>
          <p className="text-xs text-text-secondary">
            All providers, environment checks, and skills are healthy.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card padding={false}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
          Issues
        </h2>
        <Badge variant={issues.some((i) => i.severity === 'error') ? 'error' : 'warning'}>
          {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
        </Badge>
      </div>

      {/* Issue rows */}
      <ul className="divide-y divide-border">
        {issues.map((issue) => (
          <li key={issue.id} className="flex items-start gap-3 px-4 py-3">
            {/* Severity badge */}
            <Badge variant={severityVariant[issue.severity]} className="mt-0.5 shrink-0">
              {issue.severity}
            </Badge>

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-xs font-medium text-text-tertiary">{issue.source}</p>
              <p className="text-sm text-text-primary leading-snug">{issue.description}</p>
              {issue.detail && (
                <p className="text-xs text-text-secondary leading-relaxed">{issue.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
