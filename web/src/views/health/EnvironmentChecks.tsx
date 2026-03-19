// ─── EnvironmentChecks ────────────────────────────────────────────────────────
// Grid of provider status cards (grouped by category) and environment check cards.
// Observability: renders data from useHealth() ['health', hash] query.
// Empty state fires when both arrays are empty.

import React from 'react'
import { CheckCircle, XCircle, WarningCircle } from '@phosphor-icons/react'
import { Card } from '@/components/primitives/Card'
import { Badge } from '@/components/primitives/Badge'
import { Tooltip } from '@/components/primitives/Tooltip'
import type { ProviderStatusSummary, EnvironmentCheckResult } from '@/lib/api/types'
import type { BadgeVariant } from '@/components/primitives/Badge'

interface EnvironmentChecksProps {
  providers: ProviderStatusSummary[]
  environmentIssues: EnvironmentCheckResult[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function providerBadgeVariant(p: ProviderStatusSummary): BadgeVariant {
  if (p.ok) return 'success'
  return p.required ? 'error' : 'warning'
}

function envBadgeVariant(e: EnvironmentCheckResult): BadgeVariant {
  if (e.status === 'ok') return 'success'
  if (e.status === 'warning') return 'warning'
  return 'error'
}

function StatusIcon({ ok, size = 16 }: { ok: boolean; size?: number }) {
  return ok
    ? <CheckCircle size={size} className="text-green-400 shrink-0" />
    : <XCircle size={size} className="text-red-400 shrink-0" />
}

function EnvStatusIcon({ status, size = 16 }: { status: EnvironmentCheckResult['status']; size?: number }) {
  if (status === 'ok') return <CheckCircle size={size} className="text-green-400 shrink-0" />
  if (status === 'warning') return <WarningCircle size={size} className="text-yellow-400 shrink-0" />
  return <XCircle size={size} className="text-red-400 shrink-0" />
}

/** Group an array by a string key, returning a plain object. */
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item)
    ;(acc[key] ??= []).push(item)
    return acc
  }, {})
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProviderCard({ p }: { p: ProviderStatusSummary }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon ok={p.ok} />
          <span className="text-sm font-medium text-text-primary truncate">{p.label}</span>
        </div>
        <Badge variant={providerBadgeVariant(p)}>
          {p.ok ? 'ok' : p.required ? 'error' : 'warn'}
        </Badge>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">{p.message}</p>
    </Card>
  )
}

function EnvCard({ e }: { e: EnvironmentCheckResult }) {
  const DETAIL_MAX = 80
  const isLong = (e.detail?.length ?? 0) > DETAIL_MAX
  const truncated = isLong ? e.detail!.slice(0, DETAIL_MAX) + '…' : e.detail

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <EnvStatusIcon status={e.status} />
          <span className="text-sm font-medium text-text-primary truncate">{e.name}</span>
        </div>
        <Badge variant={envBadgeVariant(e)}>{e.status}</Badge>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{e.message}</p>
      {e.detail && (
        isLong ? (
          <Tooltip text={e.detail}>
            <p className="text-xs text-text-tertiary leading-relaxed cursor-help">{truncated}</p>
          </Tooltip>
        ) : (
          <p className="text-xs text-text-tertiary leading-relaxed">{e.detail}</p>
        )
      )}
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EnvironmentChecks({ providers, environmentIssues }: EnvironmentChecksProps) {
  // ── Empty state ──────────────────────────────────────────────────────────
  if (providers.length === 0 && environmentIssues.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle size={32} className="text-green-400 opacity-80" />
          <p className="text-sm font-medium text-text-primary">All systems healthy</p>
          <p className="text-xs text-text-secondary">No provider or environment issues detected.</p>
        </div>
      </Card>
    )
  }

  const grouped = groupBy(providers, (p) => p.category)

  return (
    <div className="space-y-6">
      {/* ── Providers ─────────────────────────────────────────────────── */}
      {providers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Providers
          </h2>
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <p className="text-xs font-medium text-text-tertiary uppercase tracking-widest mb-2">
                  {category}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((p) => (
                    <ProviderCard key={p.name} p={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Environment ───────────────────────────────────────────────── */}
      {environmentIssues.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Environment
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {environmentIssues.map((e) => (
              <EnvCard key={e.name} e={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
