// ─── PhaseTimeline ────────────────────────────────────────────────────────────
// Renders the current GSD phase as a color-coded Badge.
// Unknown phase strings fall back to 'neutral' — no crash path.
//
// Observability:
//   - Receives `phase` from GSDState (string from server). If the server sends
//     an unrecognized phase, the badge renders as 'neutral' and no error is thrown.
//   - PhaseTimeline is a pure presentational component — all state lives in parent.

import React from 'react'
import { Badge } from '@/components/primitives/Badge'
import type { BadgeVariant } from '@/components/primitives/Badge'

/** Map GSD phase strings to Badge color variants */
const PHASE_VARIANT: Record<string, BadgeVariant> = {
  // Active execution phases
  executing: 'success',
  building:  'success',
  running:   'success',
  // Planning phases
  planning:  'info',
  researching: 'info',
  designing: 'info',
  // Paused / blocked
  paused:    'warning',
  waiting:   'warning',
  blocked:   'warning',
  reviewing: 'warning',
  // Error / terminal
  error:     'error',
  failed:    'error',
  cancelled: 'error',
  // Neutral / completed
  idle:      'neutral',
  complete:  'neutral',
  done:      'neutral',
}

interface PhaseTimelineProps {
  phase?: string
}

export function PhaseTimeline({ phase }: PhaseTimelineProps) {
  const variant: BadgeVariant = phase
    ? (PHASE_VARIANT[phase] ?? 'neutral')
    : 'neutral'

  return (
    <Badge variant={variant}>
      {phase || 'idle'}
    </Badge>
  )
}
