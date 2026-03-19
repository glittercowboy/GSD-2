// ─── LogLine ──────────────────────────────────────────────────────────────────
// Single log entry row: timestamp + level badge + message.

import { Badge } from '@/components/primitives/Badge'
import type { BadgeVariant } from '@/components/primitives/Badge'
import type { ActivityEntry } from '@/lib/api/types'

interface LogLineProps {
  entry: ActivityEntry
}

const levelBadgeVariant: Record<string, BadgeVariant> = {
  debug: 'neutral',
  info:  'info',
  warn:  'warning',
  error: 'error',
}

function getBadgeVariant(level: string): BadgeVariant {
  return levelBadgeVariant[level.toLowerCase()] ?? 'neutral'
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

export function LogLine({ entry }: LogLineProps) {
  return (
    <div className="flex items-center gap-3 h-7 px-3 hover:bg-bg-tertiary/40 transition-colors duration-75">
      {/* Timestamp */}
      <span className="shrink-0 font-mono text-[11px] text-text-muted w-[70px]">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Level badge */}
      <span className="shrink-0 w-[44px]">
        <Badge variant={getBadgeVariant(entry.level)}>
          {entry.level.toUpperCase()}
        </Badge>
      </span>

      {/* Message */}
      <span
        className="font-mono text-xs text-text-primary truncate flex-1"
        title={entry.message}
      >
        {entry.message}
      </span>
    </div>
  )
}
