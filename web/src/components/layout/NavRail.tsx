// ─── NavRail ──────────────────────────────────────────────────────────────────
// Left sidebar navigation rail with 8 primary entries + 1 preferences footer.
// Reads sidebarCollapsed from UI store; supports expand/collapse toggle.

import React from 'react'
import { Link } from '@tanstack/react-router'
import {
  House,
  FlagBanner,
  ChartBar,
  TreeStructure,
  Heartbeat,
  Terminal,
  Scales,
  ClipboardText,
  Gear,
  CaretDoubleLeft,
  CaretDoubleRight,
} from '@phosphor-icons/react'
import { useSidebarCollapsed, useUIStore } from '../../stores/ui'

// ─── Nav entry definition ─────────────────────────────────────────────────────

interface NavEntry {
  label: string
  path: string
  Icon: React.ElementType
}

const PRIMARY_ENTRIES: NavEntry[] = [
  { label: 'Dashboard',    path: '/',             Icon: House },
  { label: 'Milestones',   path: '/milestones',   Icon: FlagBanner },
  { label: 'Metrics',      path: '/metrics',      Icon: ChartBar },
  { label: 'Visualizer',   path: '/visualizer',   Icon: TreeStructure },
  { label: 'Health',       path: '/health',       Icon: Heartbeat },
  { label: 'Logs',         path: '/logs',         Icon: Terminal },
  { label: 'Decisions',    path: '/decisions',    Icon: Scales },
  { label: 'Requirements', path: '/requirements', Icon: ClipboardText },
]

const FOOTER_ENTRY: NavEntry = {
  label: 'Preferences',
  path: '/preferences',
  Icon: Gear,
}

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
  entry,
  collapsed,
}: {
  entry: NavEntry
  collapsed: boolean
}) {
  const { Icon, label, path } = entry

  // Base classes — structural only (no color), shared across all states
  const baseClass = [
    'group relative flex items-center gap-3',
    'rounded-lg transition-colors duration-150',
    'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50',
    collapsed
      ? 'justify-center w-10 h-10 mx-auto p-0'
      : 'px-3 py-2 w-full',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Link
      to={path}
      className={baseClass}
      // Active: accent color + muted accent background
      activeProps={{ className: 'text-accent bg-accent-muted' }}
      // Inactive: tertiary text + hover
      inactiveProps={{ className: 'text-text-tertiary hover:text-text-primary hover:bg-bg-hover' }}
      title={collapsed ? label : undefined}
    >
      <Icon size={18} weight="regular" className="shrink-0" />

      {!collapsed && (
        <span className="truncate text-sm font-medium leading-none">
          {label}
        </span>
      )}

      {/* Tooltip when collapsed */}
      {collapsed && (
        <span
          className={[
            'pointer-events-none absolute left-full ml-2 z-50',
            'rounded-md bg-bg-tertiary border border-border px-2 py-1',
            'text-xs font-medium text-text-primary whitespace-nowrap',
            'opacity-0 translate-x-1 scale-95',
            'group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100',
            'transition-all duration-150',
            'shadow-lg shadow-black/40',
          ].join(' ')}
          aria-hidden
        >
          {label}
        </span>
      )}
    </Link>
  )
}

// ─── NavRail ──────────────────────────────────────────────────────────────────

export function NavRail() {
  const collapsed      = useSidebarCollapsed()
  const toggleSidebar  = useUIStore((s) => s.toggleSidebar)

  return (
    <aside
      className={[
        'relative flex flex-col h-screen shrink-0',
        'bg-bg-secondary border-r border-border',
        'transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-[200px]',
      ].join(' ')}
      aria-label="Primary navigation"
    >
      {/* ── Header: Logo + collapse toggle ─────────────────────────────────── */}
      <div
        className={[
          'flex items-center h-12 shrink-0 border-b border-border px-3',
          collapsed ? 'justify-center' : 'justify-between',
        ].join(' ')}
      >
        {!collapsed && (
          <span className="text-xs font-semibold tracking-widest uppercase text-text-tertiary select-none">
            GSD
          </span>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          className={[
            'flex items-center justify-center rounded-md',
            'w-7 h-7',
            'text-text-tertiary hover:text-text-primary hover:bg-bg-hover',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50',
          ].join(' ')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <CaretDoubleRight size={14} weight="bold" />
          ) : (
            <CaretDoubleLeft size={14} weight="bold" />
          )}
        </button>
      </div>

      {/* ── Primary nav entries ─────────────────────────────────────────────── */}
      <nav
        className={[
          'flex flex-col flex-1 gap-0.5 overflow-y-auto overflow-x-hidden py-2',
          collapsed ? 'px-1' : 'px-2',
        ].join(' ')}
        aria-label="Main navigation"
      >
        {PRIMARY_ENTRIES.map((entry) => (
          <NavItem key={entry.path} entry={entry} collapsed={collapsed} />
        ))}
      </nav>

      {/* ── Footer: Preferences ────────────────────────────────────────────── */}
      <div
        className={[
          'shrink-0 border-t border-border py-2',
          collapsed ? 'px-1' : 'px-2',
        ].join(' ')}
      >
        <NavItem entry={FOOTER_ENTRY} collapsed={collapsed} />
      </div>
    </aside>
  )
}
