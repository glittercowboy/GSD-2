// ─── Shell ────────────────────────────────────────────────────────────────────
// Top-level app frame: NavRail (left) + main column (TopBar + ConnectionBanner + content).
// The `children` prop receives the router <Outlet /> (wired in T04).

import React from 'react'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'
import { ConnectionBanner } from '../connection/ConnectionBanner'

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-bg-primary">
      {/* ── Left: Navigation rail ─────────────────────────────────────────── */}
      <NavRail />

      {/* ── Right: Main column ────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Fixed top bar */}
        <TopBar />

        {/* Disconnection warning — renders only when not connected */}
        <ConnectionBanner />

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bg-primary">
          {children}
        </main>
      </div>
    </div>
  )
}
