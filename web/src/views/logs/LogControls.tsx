// ─── LogControls ──────────────────────────────────────────────────────────────
// Top toolbar for the live log viewer:
// Level filter button group, text search input, pause/resume, and clear.

import { Pause, Play, Trash } from '@phosphor-icons/react'

const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const

interface LogControlsProps {
  activeLevel: string
  onLevelChange: (level: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  autoScroll: boolean
  onToggleAutoScroll: () => void
  onClear: () => void
}

const levelVariant: Record<string, string> = {
  ALL:   'text-text-primary bg-accent/20 ring-1 ring-accent/30',
  DEBUG: 'text-text-secondary bg-bg-tertiary/80 ring-1 ring-border',
  INFO:  'text-accent bg-accent/10 ring-1 ring-accent/20',
  WARN:  'text-yellow-300 bg-yellow-900/30 ring-1 ring-yellow-700/30',
  ERROR: 'text-red-300 bg-red-900/30 ring-1 ring-red-700/30',
}

const levelInactive =
  'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/60 ring-1 ring-transparent'

export function LogControls({
  activeLevel,
  onLevelChange,
  searchQuery,
  onSearchChange,
  autoScroll,
  onToggleAutoScroll,
  onClear,
}: LogControlsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Level filter button group */}
      <div className="flex items-center rounded-md overflow-hidden border border-border">
        {LEVELS.map((level) => {
          const isActive = activeLevel === level
          return (
            <button
              key={level}
              onClick={() => onLevelChange(level)}
              className={[
                'px-2.5 py-1 text-[11px] font-medium leading-none tracking-wide',
                'transition-colors duration-150 focus:outline-none focus-visible:ring-1',
                'focus-visible:ring-accent',
                isActive ? levelVariant[level] : levelInactive,
              ].join(' ')}
            >
              {level}
            </button>
          )
        })}
      </div>

      {/* Search input */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search logs..."
        className={[
          'flex-1 min-w-[160px] h-7 px-2.5 rounded-md text-xs',
          'bg-bg-tertiary border border-border text-text-primary',
          'placeholder:text-text-muted',
          'focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30',
          'transition-colors duration-150',
        ].join(' ')}
      />

      {/* Pause / Resume auto-scroll */}
      <button
        onClick={onToggleAutoScroll}
        title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
        className={[
          'flex items-center gap-1.5 h-7 px-2.5 rounded-md',
          'text-[11px] font-medium leading-none',
          'border border-border transition-colors duration-150',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          autoScroll
            ? 'text-accent bg-accent-muted border-accent/30 hover:bg-accent/20'
            : 'text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80',
        ].join(' ')}
      >
        {autoScroll ? (
          <>
            <Pause size={12} weight="fill" />
            Pause
          </>
        ) : (
          <>
            <Play size={12} weight="fill" />
            Resume
          </>
        )}
      </button>

      {/* Clear */}
      <button
        onClick={onClear}
        title="Clear all log entries"
        className={[
          'flex items-center gap-1.5 h-7 px-2.5 rounded-md',
          'text-[11px] font-medium leading-none',
          'text-text-muted border border-border bg-bg-tertiary',
          'hover:text-red-300 hover:border-red-700/30 hover:bg-red-900/20',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        ].join(' ')}
      >
        <Trash size={12} />
        Clear
      </button>
    </div>
  )
}
