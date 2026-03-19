// ─── Spinner ──────────────────────────────────────────────────────────────────
// Animated SVG loading indicator. No store dependencies.

import React from 'react'

type SpinnerSize = 'sm' | 'md' | 'lg'

interface SpinnerProps {
  size?: SpinnerSize
  className?: string
}

const sizeMap: Record<SpinnerSize, { px: number; stroke: number }> = {
  sm: { px: 14, stroke: 2 },
  md: { px: 20, stroke: 2 },
  lg: { px: 28, stroke: 2.5 },
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const { px, stroke } = sizeMap[size]
  const r = (px - stroke * 2) / 2
  const circ = 2 * Math.PI * r

  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      fill="none"
      aria-label="Loading"
      role="status"
      className={['text-accent animate-spin', className].filter(Boolean).join(' ')}
      style={{ animationDuration: '0.8s', animationTimingFunction: 'linear' }}
    >
      {/* Track */}
      <circle
        cx={px / 2}
        cy={px / 2}
        r={r}
        stroke="currentColor"
        strokeWidth={stroke}
        opacity={0.15}
      />
      {/* Arc */}
      <circle
        cx={px / 2}
        cy={px / 2}
        r={r}
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
        transform={`rotate(-90 ${px / 2} ${px / 2})`}
      />
    </svg>
  )
}
