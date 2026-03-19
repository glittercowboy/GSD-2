// ─── LogsView ─────────────────────────────────────────────────────────────────
// Live log viewer — seeds from /api/activity on mount, then streams WS log_line
// events into the Zustand ring buffer. Supports level filter, search, and
// pause/resume auto-scroll.

import { useEffect, useRef, useState } from 'react'
import { subscribe } from '@/lib/ws/client'
import { useActivity } from '@/hooks/useActivity'
import { useLogEntries, useClearLogs, useSetLogEntries, useAddLogEntry } from '@/stores/logs'
import { Card } from '@/components/primitives/Card'
import { Spinner } from '@/components/primitives/Spinner'
import type { StudioEvent } from '@/lib/api/types'
import { LogControls } from './LogControls'
import { LogViewer } from './LogViewer'

export function LogsView() {
  // ─── Controls state ─────────────────────────────────────────────────────────
  const [activeLevel, setActiveLevel] = useState('ALL')
  const [searchQuery, setSearchQuery]   = useState('')
  const [autoScroll, setAutoScroll]     = useState(true)

  // ─── Store selectors ─────────────────────────────────────────────────────────
  const entries     = useLogEntries()
  const clearLogs   = useClearLogs()
  const setEntries  = useSetLogEntries()
  const addEntry    = useAddLogEntry()

  // ─── Seed from /api/activity (once on initial data arrival) ─────────────────
  const { data: activityData, isLoading } = useActivity()
  const seededRef = useRef(false)

  useEffect(() => {
    if (!activityData || seededRef.current) return
    seededRef.current = true
    // API returns oldest-first; reverse so newest is first in the store
    setEntries([...activityData].reverse())
  }, [activityData, setEntries])

  // ─── WS subscription for live log_line events ────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribe((event: StudioEvent) => {
      if (event.type === 'log_line') {
        addEntry({
          level:     event.data.level,
          message:   event.data.message,
          timestamp: event.data.timestamp,
        })
      }
    })
    return unsubscribe
  }, [addEntry])

  // ─── Filter logic ─────────────────────────────────────────────────────────────
  const filteredEntries = entries.filter((entry) => {
    if (activeLevel !== 'ALL' && entry.level.toLowerCase() !== activeLevel.toLowerCase()) {
      return false
    }
    if (searchQuery && !entry.message.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Live Logs</h1>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {isLoading && (
            <span className="flex items-center gap-1.5">
              <Spinner size="sm" />
              Loading history…
            </span>
          )}
          <span>{filteredEntries.length} entries</span>
        </div>
      </div>

      {/* Controls toolbar */}
      <LogControls
        activeLevel={activeLevel}
        onLevelChange={setActiveLevel}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        autoScroll={autoScroll}
        onToggleAutoScroll={() => setAutoScroll((prev) => !prev)}
        onClear={() => {
          clearLogs()
          seededRef.current = false // allow re-seed if desired
        }}
      />

      {/* Log entries */}
      <Card padding={false}>
        <LogViewer
          entries={filteredEntries}
          autoScroll={autoScroll}
          onUserScroll={() => setAutoScroll(false)}
        />
      </Card>
    </div>
  )
}
