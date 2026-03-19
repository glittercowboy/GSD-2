// ─── DAGNode ──────────────────────────────────────────────────────────────────
// Pure SVG component rendering a single milestone node.
// dagre returns center coordinates; we translate by (-w/2, -h/2) to position.

import type { VisualizerMilestone } from '@/lib/api/types'

interface DAGNodeProps {
  x: number
  y: number
  width: number
  height: number
  milestone: VisualizerMilestone
  isOnCriticalPath: boolean
}

/** Background fill per milestone status (RGBA for SVG compatibility) */
const STATUS_FILL: Record<VisualizerMilestone['status'], string> = {
  complete: 'rgba(20, 83, 45, 0.5)',        // green-900/50
  active:   'rgba(94, 106, 210, 0.2)',        // accent/20
  pending:  'var(--color-bg-tertiary)',
  parked:   'rgba(30, 32, 40, 0.8)',           // bg-tertiary/80
}

/** Border stroke per status */
const STATUS_STROKE: Record<VisualizerMilestone['status'], string> = {
  complete: 'rgba(34, 197, 94, 0.35)',
  active:   'var(--color-accent)',
  pending:  'var(--color-border)',
  parked:   'rgba(63, 63, 70, 0.5)',         // cool zinc border
}

export function DAGNode({ x, y, width, height, milestone, isOnCriticalPath }: DAGNodeProps) {
  // dagre center → top-left origin for our rect
  const tx = x - width / 2
  const ty = y - height / 2

  return (
    <g transform={`translate(${tx}, ${ty})`} role="img" aria-label={`${milestone.id}: ${milestone.title}`}>
      {/* Background fill rect */}
      <rect
        width={width}
        height={height}
        rx={7}
        ry={7}
        fill={STATUS_FILL[milestone.status]}
        stroke={STATUS_STROKE[milestone.status]}
        strokeWidth={1}
      />

      {/* Critical path accent ring */}
      {isOnCriticalPath && (
        <rect
          width={width}
          height={height}
          rx={7}
          ry={7}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          opacity={0.85}
        />
      )}

      {/* Text content via foreignObject */}
      <foreignObject x={0} y={0} width={width} height={height}>
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore — xmlns needed for foreignObject children in some renderers */}
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 10px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* Milestone ID — bold monospace, accent color */}
          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-accent)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '0.02em',
            }}
          >
            {milestone.id}
          </div>

          {/* Milestone title — readable, truncated */}
          <div
            style={{
              fontSize: '12px',
              color: 'var(--color-text-primary)',
              lineHeight: 1.35,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: '2px',
            }}
          >
            {milestone.title}
          </div>
        </div>
      </foreignObject>
    </g>
  )
}
