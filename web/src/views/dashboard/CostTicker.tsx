// ─── CostTicker ──────────────────────────────────────────────────────────────
// Displays totalCost (USD, 3 decimal places) and totalTokens (K/M suffix) as
// two side-by-side StatCards.

import React from 'react'
import { StatCard } from '@/components/primitives/StatCard'

interface CostTickerProps {
  totalCost: number
  totalTokens: number
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(3)}`
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k`
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`
  return `${(tokens / 1_000_000).toFixed(1)}M`
}

export function CostTicker({ totalCost, totalTokens }: CostTickerProps) {
  return (
    <div className="flex flex-row gap-3">
      <StatCard
        label="Total Cost"
        value={formatCost(totalCost)}
        className="flex-1"
      />
      <StatCard
        label="Tokens"
        value={formatTokens(totalTokens)}
        className="flex-1"
      />
    </div>
  )
}
