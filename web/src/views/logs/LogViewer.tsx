// ─── LogViewer ────────────────────────────────────────────────────────────────
// Scrollable container for log entries with auto-scroll support.
// Calls onUserScroll when the user scrolls up — signals parent to pause.

import { useEffect, useRef } from 'react'
import type { ActivityEntry } from '@/lib/api/types'
import { LogLine } from './LogLine'

interface LogViewerProps {
  entries: ActivityEntry[]
  autoScroll: boolean
  /** Called when the user manually scrolls up to pause auto-scroll. */
  onUserScroll?: () => void
}

export function LogViewer({ entries, autoScroll, onUserScroll }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries arrive and autoScroll is enabled
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return
    const el = containerRef.current
    el.scrollTop = el.scrollHeight
  }, [entries, autoScroll])

  // Detect manual scroll-up and notify parent to pause auto-scroll
  function handleScroll() {
    if (!containerRef.current || !onUserScroll) return
    const el = containerRef.current
    const isScrolledUp = el.scrollTop + el.clientHeight < el.scrollHeight - 20
    if (isScrolledUp) {
      onUserScroll()
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-text-muted text-sm font-mono">
        No log entries
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto max-h-[calc(100vh-220px)] py-1"
      style={{ contain: 'content' }}
    >
      {entries.map((entry, index) => (
        <LogLine
          key={`${entry.timestamp}-${index}`}
          entry={entry}
        />
      ))}
    </div>
  )
}
