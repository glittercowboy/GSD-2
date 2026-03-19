// ─── ConnectionBanner ─────────────────────────────────────────────────────────
// Full-width warning strip shown when disconnected from the GSD server.
// Returns null when connected — zero DOM output in the happy path.

import React from 'react'
import { Spinner } from '../primitives/Spinner'
import { useWsStatus } from '../../stores/connection'

export function ConnectionBanner() {
  const wsStatus = useWsStatus()

  if (wsStatus === 'connected') return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'flex items-center justify-center gap-2.5',
        'px-4 py-2',
        'bg-yellow-900/30 border-b border-yellow-700/30',
        'text-yellow-200 text-xs font-medium',
        'transition-all duration-300',
      ].join(' ')}
    >
      <Spinner size="sm" className="text-yellow-400" />
      <span>
        {wsStatus === 'connecting'
          ? 'Connecting to GSD server…'
          : 'Disconnected from GSD server — reconnecting…'}
      </span>
    </div>
  )
}
