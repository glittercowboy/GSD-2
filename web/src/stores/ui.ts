// ─── UI Store ─────────────────────────────────────────────────────────────────
// Zustand v5 store for ephemeral UI state (sidebar, active panel/route).
// Uses double-parentheses create<State>()(...) — required for Zustand v5.

import { create } from 'zustand'

// ─── State shape ──────────────────────────────────────────────────────────────

interface UIState {
  sidebarCollapsed: boolean
  activePanel: string

  // Actions
  toggleSidebar: () => void
  setActivePanel: (panel: string) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  activePanel: 'dashboard',

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setActivePanel: (panel) => set({ activePanel: panel }),
}))

// ─── Typed selector hooks ─────────────────────────────────────────────────────

export const useSidebarCollapsed = (): boolean =>
  useUIStore((s) => s.sidebarCollapsed)

export const useActivePanel = (): string =>
  useUIStore((s) => s.activePanel)
