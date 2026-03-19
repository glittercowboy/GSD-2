// ─── Tooltip Primitive ────────────────────────────────────────────────────────
// Lightweight hover tooltip using CSS group/group-hover pattern.
// Falls back to native `title` attribute for accessibility.

import type { ReactNode } from 'react'

interface TooltipProps {
  /** Content that triggers the tooltip */
  children: ReactNode
  /** Tooltip text shown on hover */
  text: string
  /** Optional extra class names for the wrapper element */
  className?: string
}

/**
 * Simple tooltip wrapper. Shows a styled tooltip on hover using Tailwind
 * `group`/`group-hover` pattern. Includes `title` attr for screen readers.
 */
export function Tooltip({ children, text, className = '' }: TooltipProps) {
  return (
    <span
      className={`relative inline-flex group ${className}`}
      title={text}
    >
      {children}
      <span
        className={[
          'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5',
          'whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white shadow-md',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          'z-50',
        ].join(' ')}
        role="tooltip"
        aria-hidden="true"
      >
        {text}
        {/* Arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
      </span>
    </span>
  )
}

export default Tooltip
