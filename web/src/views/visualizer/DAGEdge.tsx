// ─── DAGEdge ──────────────────────────────────────────────────────────────────
// Pure SVG path rendering a single dependency edge.
// Converts the dagre edge `points` array to a polyline SVG path.

interface DAGEdgeProps {
  /** dagre-computed waypoints for this edge */
  points: Array<{ x: number; y: number }>
  isOnCriticalPath: boolean
}

/** Convert an array of {x,y} points into an SVG path `d` attribute (M + L chain) */
function pointsToPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  const move = `M ${first.x.toFixed(2)},${first.y.toFixed(2)}`
  const lines = rest.map(p => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
  return [move, ...lines].join(' ')
}

export function DAGEdge({ points, isOnCriticalPath }: DAGEdgeProps) {
  const d = pointsToPath(points)
  if (!d) return null

  return (
    <>
      {/* Drop-shadow pass for critical path so it stands out on dark background */}
      {isOnCriticalPath && (
        <path
          d={d}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.18}
        />
      )}

      {/* Main edge path */}
      <path
        d={d}
        fill="none"
        stroke={isOnCriticalPath ? 'var(--color-accent)' : 'var(--color-border-active, #333)'}
        strokeWidth={isOnCriticalPath ? 2.5 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={isOnCriticalPath ? 'url(#arrow-accent)' : 'url(#arrow-default)'}
      />
    </>
  )
}
