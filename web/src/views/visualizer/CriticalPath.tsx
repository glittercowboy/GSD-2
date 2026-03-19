// ─── CriticalPath ─────────────────────────────────────────────────────────────
// Legend panel displaying the computed critical path as milestone and slice badges.

import { Badge } from '@/components/primitives/Badge'
import type { CriticalPathInfo } from '@/lib/api/types'

interface CriticalPathProps {
  criticalPath: CriticalPathInfo
}

export function CriticalPath({ criticalPath }: CriticalPathProps) {
  const { milestonePath, slicePath } = criticalPath

  if (milestonePath.length === 0 && slicePath.length === 0) {
    return null
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-secondary px-4 py-3"
      role="region"
      aria-label="Critical path summary"
    >
      {/* Label */}
      <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-text-tertiary">
        Critical Path
      </span>

      {/* Divider */}
      <span className="text-border" aria-hidden="true">·</span>

      {/* Milestone IDs in path order */}
      {milestonePath.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" aria-label="Milestone path">
          {milestonePath.map((id, i) => (
            <span key={id} className="flex items-center gap-1">
              <Badge variant="info">{id}</Badge>
              {i < milestonePath.length - 1 && (
                <span className="text-[10px] text-text-tertiary" aria-hidden="true">→</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Slice path (if present) */}
      {slicePath.length > 0 && (
        <>
          <span className="text-border" aria-hidden="true">·</span>
          <div className="flex flex-wrap items-center gap-1" aria-label="Slice path">
            {slicePath.map((id, i) => (
              <span key={id} className="flex items-center gap-1">
                <Badge variant="neutral">{id}</Badge>
                {i < slicePath.length - 1 && (
                  <span className="text-[10px] text-text-tertiary" aria-hidden="true">→</span>
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
