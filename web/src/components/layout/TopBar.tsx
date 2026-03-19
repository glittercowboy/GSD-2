// ─── TopBar ───────────────────────────────────────────────────────────────────
// Horizontal header bar: project name | connection status | project switcher.
// Reads live data from the connection store.

import React from 'react'
import { Badge } from '../primitives/Badge'
import {
  useWsStatus,
  useActiveProject,
  useActiveProjectHash,
  useProjectList,
  useConnectionStore,
} from '../../stores/connection'

export function TopBar() {
  const wsStatus      = useWsStatus()
  const activeProject = useActiveProject()
  const activeHash    = useActiveProjectHash()
  const projectList   = useProjectList()
  const setActive     = useConnectionStore((s) => s.setActiveProject)

  return (
    <header
      className={[
        'flex items-center justify-between',
        'h-12 px-4 shrink-0',
        'bg-bg-secondary border-b border-border',
      ].join(' ')}
    >
      {/* ── Left: Project name ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-text-primary truncate">
          {activeProject?.name ?? 'No project'}
        </span>
      </div>

      {/* ── Right: Status badge + project switcher ──────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Connection status */}
        <Badge variant={wsStatus === 'connected' ? 'success' : 'warning'}>
          <span
            className={[
              'size-1.5 rounded-full',
              wsStatus === 'connected' ? 'bg-green-400' : 'bg-yellow-400',
            ].join(' ')}
          />
          {wsStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </Badge>

        {/* Project switcher — native select for simplicity */}
        {projectList.length > 0 && (
          <select
            value={activeHash ?? ''}
            onChange={(e) => setActive(e.target.value || null)}
            aria-label="Switch project"
            className={[
              'text-xs text-text-secondary bg-bg-tertiary',
              'border border-border rounded-md',
              'px-2 py-1 pr-6',
              'appearance-none cursor-pointer',
              'hover:border-border-active hover:text-text-primary',
              'focus:outline-none focus:ring-1 focus:ring-accent/40',
              'transition-colors duration-150',
              // Custom arrow via background-image isn't needed — appearance-none
              // already hides the default arrow; we keep it simple here
            ].join(' ')}
          >
            {projectList.map((p) => (
              <option key={p.hash} value={p.hash}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </header>
  )
}
