// ─── Logs Store ───────────────────────────────────────────────────────────────
// Zustand ring buffer store for live log entries.
// Seeded from /api/activity on mount; updated via WS log_line events.
// Max 1000 entries — prepends on add, trims oldest.

import { create } from 'zustand'
import type { ActivityEntry } from '@/lib/api/types'

const MAX_ENTRIES = 1000

// ─── State shape ──────────────────────────────────────────────────────────────

interface LogsState {
  entries: ActivityEntry[]

  // Actions
  addEntry: (entry: ActivityEntry) => void
  clearEntries: () => void
  setEntries: (entries: ActivityEntry[]) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLogsStore = create<LogsState>()((set) => ({
  entries: [],

  /** Prepend a new entry and trim to MAX_ENTRIES. Newest entries first. */
  addEntry: (entry) =>
    set((state) => ({
      entries:
        state.entries.length >= MAX_ENTRIES
          ? [entry, ...state.entries.slice(0, MAX_ENTRIES - 1)]
          : [entry, ...state.entries],
    })),

  /** Clear all log entries. */
  clearEntries: () => set({ entries: [] }),

  /** Bulk-replace all entries (used to seed from /api/activity on mount). */
  setEntries: (entries) => set({ entries }),
}))

// ─── Typed selector hooks ─────────────────────────────────────────────────────
// Each hook subscribes to only the slice it reads — minimizes re-renders.

export const useLogEntries = (): ActivityEntry[] =>
  useLogsStore((s) => s.entries)

export const useClearLogs = (): (() => void) =>
  useLogsStore((s) => s.clearEntries)

export const useAddLogEntry = (): ((entry: ActivityEntry) => void) =>
  useLogsStore((s) => s.addEntry)

export const useSetLogEntries = (): ((entries: ActivityEntry[]) => void) =>
  useLogsStore((s) => s.setEntries)
