import { CaretRight, Check, XCircle, CircleNotch } from '@phosphor-icons/react'

type Props = {
  toolName: string
  status: 'running' | 'done' | 'error'
}

/**
 * Format a tool name for display: strip underscores, capitalize words.
 * Falls through to the raw name if already clean (e.g. "Edit", "Read").
 */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Minimal placeholder for tool execution events.
 * Shows tool name + compact status indicator. S04 replaces this
 * with bespoke tool-specific cards.
 */
export function ToolStub({ toolName, status }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-border/60 bg-bg-secondary/30 px-4 py-2.5">
      <StatusIcon status={status} />
      <span className="text-[13px] font-mono text-text-secondary">
        {formatToolName(toolName)}
      </span>
      <CaretRight size={14} weight="bold" className="ml-auto text-text-tertiary/60" />
    </div>
  )
}

function StatusIcon({ status }: { status: Props['status'] }) {
  switch (status) {
    case 'running':
      return <CircleNotch size={14} weight="bold" className="animate-spin text-accent/70" />
    case 'done':
      return <Check size={14} weight="bold" className="text-emerald-500/70" />
    case 'error':
      return <XCircle size={14} weight="bold" className="text-red-500/70" />
  }
}
