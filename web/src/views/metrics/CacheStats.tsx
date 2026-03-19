// ─── CacheStats ───────────────────────────────────────────────────────────────
// Three StatCards: Cache Hit Rate, Cache Read Tokens, Cache Write Tokens.
// Pure presentational — no hooks. Handles null totals (shows "—").

import React from 'react'
import { StatCard } from '@/components/primitives/StatCard'
import type { ProjectTotals } from '@/lib/api/types'

interface CacheStatsProps {
  totals: ProjectTotals | null
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function computeHitRate(totals: ProjectTotals): string {
  const denominator = totals.tokens.cacheRead + totals.tokens.input
  if (denominator === 0) return '0.0%'
  const rate = (totals.tokens.cacheRead / denominator) * 100
  return `${rate.toFixed(1)}%`
}

export function CacheStats({ totals }: CacheStatsProps) {
  const hitRate     = totals !== null ? computeHitRate(totals) : '—'
  const cacheRead   = totals !== null ? formatTokens(totals.tokens.cacheRead) : '—'
  const cacheWrite  = totals !== null ? formatTokens(totals.tokens.cacheWrite) : '—'

  return (
    <div className="flex flex-row gap-3">
      <StatCard
        label="Cache Hit Rate"
        value={hitRate}
        className="flex-1"
      />
      <StatCard
        label="Cache Read"
        value={cacheRead}
        sub="tokens"
        className="flex-1"
      />
      <StatCard
        label="Cache Write"
        value={cacheWrite}
        sub="tokens"
        className="flex-1"
      />
    </div>
  )
}
