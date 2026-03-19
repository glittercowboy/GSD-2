// ─── StatCard ─────────────────────────────────────────────────────────────────
// Pure presentational stat display card. No store dependencies.

import React from 'react'
import { Card } from '@/components/primitives/Card'

interface StatCardProps {
  label: string
  value: React.ReactNode
  sub?: string
  className?: string
}

export function StatCard({ label, value, sub, className = '' }: StatCardProps) {
  return (
    <Card className={className}>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide leading-none">
          {label}
        </span>
        <span className="text-2xl font-semibold text-text-primary leading-tight tabular-nums">
          {value}
        </span>
        {sub !== undefined && (
          <span className="text-[11px] text-text-secondary leading-none">{sub}</span>
        )}
      </div>
    </Card>
  )
}
