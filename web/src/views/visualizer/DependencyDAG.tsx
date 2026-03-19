// ─── DependencyDAG ────────────────────────────────────────────────────────────
// Computes milestone dependency layout with dagre (LR direction) and renders
// the full SVG: nodes colored by status, critical-path edges/nodes highlighted.
//
// Observability: renders the full milestone graph via dagre layout.
// TypeScript note: @dagrejs/dagre ESM exports a default object at runtime;
// we cast it so TypeScript is happy while Vite resolves the correct module.

import { useMemo } from 'react'
import { DAGNode } from './DAGNode'
import { DAGEdge } from './DAGEdge'
import type { CriticalPathInfo, VisualizerMilestone } from '@/lib/api/types'

// @dagrejs/dagre ESM exports `export default { graphlib, layout, ... }`.
// The type declaration uses named exports; cast via the type alias to satisfy both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DagreModule = {
  graphlib: {
    Graph: new (opts?: { directed?: boolean; multigraph?: boolean; compound?: boolean }) => {
      setGraph(label: object): void
      graph(): { width?: number; height?: number }
      setDefaultEdgeLabel(fn: () => object): void
      setNode(id: string, opts: object): void
      setEdge(v: string, w: string): void
      hasNode(id: string): boolean
      nodes(): string[]
      edges(): Array<{ v: string; w: string }>
      node(id: string): { x: number; y: number; width: number; height: number }
      edge(e: { v: string; w: string }): { points: Array<{ x: number; y: number }> }
    }
  }
  layout(g: InstanceType<DagreModule['graphlib']['Graph']>): void
}

// Vite resolves `@dagrejs/dagre` → dagre.esm.js which has `export default ...`
// allowSyntheticDefaultImports handles the type-system side; at runtime it's the default obj.
import dagreDefault from '@dagrejs/dagre'
const dagre = dagreDefault as unknown as DagreModule

// ─── Constants ──────────────────────────────────────────────────────────────
const NODE_WIDTH = 160
const NODE_HEIGHT = 56
const GRAPH_PADDING = 16

interface DependencyDAGProps {
  milestones: VisualizerMilestone[]
  criticalPath: CriticalPathInfo
}

interface LayoutEdge {
  v: string
  w: string
  points: Array<{ x: number; y: number }>
  isCritical: boolean
}

interface LayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  milestone: VisualizerMilestone
  isCritical: boolean
}

interface Layout {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

/** Returns true if edge (v → w) is part of the critical path */
function isEdgeCritical(v: string, w: string, criticalPath: CriticalPathInfo): boolean {
  const { milestoneSlack, milestonePath } = criticalPath
  if ((milestoneSlack[v] ?? 1) !== 0 || (milestoneSlack[w] ?? 1) !== 0) return false
  // Both nodes on critical path — check that they appear consecutively in milestonePath
  const vi = milestonePath.indexOf(v)
  const wi = milestonePath.indexOf(w)
  return vi !== -1 && wi !== -1 && wi === vi + 1
}

/** Build dagre layout from milestones + criticalPath. Pure computation — no React state. */
function buildLayout(
  milestones: VisualizerMilestone[],
  criticalPath: CriticalPathInfo
): Layout {
  const g = new dagre.graphlib.Graph()

  g.setGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: 80,
    marginx: GRAPH_PADDING,
    marginy: GRAPH_PADDING,
  })

  g.setDefaultEdgeLabel(() => ({}))

  // Add all milestone nodes
  for (const m of milestones) {
    g.setNode(m.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Add dependency edges
  for (const m of milestones) {
    for (const dep of m.dependsOn) {
      // Only add edge if dep node exists in graph (guard against orphan refs)
      if (g.hasNode(dep)) {
        g.setEdge(dep, m.id)
      }
    }
  }

  // Run layout
  dagre.layout(g)

  const graphInfo = g.graph()
  const width = (graphInfo.width ?? 400) + GRAPH_PADDING * 2
  const height = (graphInfo.height ?? 200) + GRAPH_PADDING * 2

  // Map milestone id → VisualizerMilestone for O(1) lookup
  const milestoneMap = new Map(milestones.map(m => [m.id, m]))

  // Extract node positions
  const nodes: LayoutNode[] = g.nodes().map(id => {
    const pos = g.node(id)
    const milestone = milestoneMap.get(id)!
    return {
      id,
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
      milestone,
      isCritical: (criticalPath.milestoneSlack[id] ?? 1) === 0,
    }
  })

  // Extract edge points
  const edges: LayoutEdge[] = g.edges().map(e => {
    const edgeData = g.edge(e)
    return {
      v: e.v,
      w: e.w,
      points: edgeData.points ?? [],
      isCritical: isEdgeCritical(e.v, e.w, criticalPath),
    }
  })

  return { nodes, edges, width, height }
}

export function DependencyDAG({ milestones, criticalPath }: DependencyDAGProps) {
  const layout = useMemo(
    () => buildLayout(milestones, criticalPath),
    [milestones, criticalPath]
  )

  const viewBox = `0 0 ${layout.width} ${layout.height}`

  return (
    <div className="overflow-auto rounded-lg border border-border bg-bg-secondary">
      <svg
        viewBox={viewBox}
        width={layout.width}
        height={layout.height}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Milestone dependency graph"
        role="img"
        style={{ display: 'block', minWidth: layout.width }}
      >
        {/* ── Arrowhead marker definitions ─────────────────────────────── */}
        <defs>
          {/* Default (muted border) arrowhead */}
          <marker
            id="arrow-default"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
          >
            <path
              d="M0,0 L0,6 L8,3 z"
              fill="var(--color-border-active, #333)"
              opacity={0.7}
            />
          </marker>

          {/* Critical-path (accent) arrowhead */}
          <marker
            id="arrow-accent"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="var(--color-accent)" />
          </marker>
        </defs>

        {/* ── Edges first (behind nodes) ───────────────────────────────── */}
        <g className="dag-edges">
          {layout.edges.map(edge => (
            <DAGEdge
              key={`${edge.v}→${edge.w}`}
              points={edge.points}
              isOnCriticalPath={edge.isCritical}
            />
          ))}
        </g>

        {/* ── Nodes on top ─────────────────────────────────────────────── */}
        <g className="dag-nodes">
          {layout.nodes.map(node => (
            <DAGNode
              key={node.id}
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              milestone={node.milestone}
              isOnCriticalPath={node.isCritical}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
