// ─── Connection Store ─────────────────────────────────────────────────────────
// Zustand v5 store for WebSocket + project state.
// Uses double-parentheses create<State>()(...) — required for Zustand v5.

import { create } from 'zustand'
import { connect, subscribe, getStatus } from '../lib/ws/client'
import { fetchProjects } from '../lib/api/client'
import type { ProjectEntry } from '../lib/api/types'

// ─── State shape ──────────────────────────────────────────────────────────────

type WsStatus = 'connected' | 'connecting' | 'disconnected'

interface ConnectionState {
  wsStatus: WsStatus
  activeProjectHash: string | null
  projectList: ProjectEntry[]

  // Actions
  setWsStatus: (status: WsStatus) => void
  setActiveProject: (hash: string | null) => void
  setProjectList: (list: ProjectEntry[]) => void
  initConnection: () => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  // Initial state
  wsStatus: getStatus(),
  activeProjectHash: null,
  projectList: [],

  // Actions
  setWsStatus: (status) => set({ wsStatus: status }),

  setActiveProject: (hash) => set({ activeProjectHash: hash }),

  setProjectList: (list) => {
    set({ projectList: list })
    // Auto-select first project when none is active
    if (get().activeProjectHash === null && list.length > 0) {
      set({ activeProjectHash: list[0].hash })
    }
  },

  initConnection: () => {
    // Fetch initial project list
    fetchProjects()
      .then((list) => {
        set({ projectList: list })
        // Auto-select first if nothing active yet
        if (get().activeProjectHash === null && list.length > 0) {
          set({ activeProjectHash: list[0].hash })
        }
      })
      .catch((err: unknown) => {
        console.error('[gsd-connection] failed to fetch projects:', err)
      })

    // Subscribe to WS events
    subscribe((event) => {
      switch (event.type) {
        case 'connected': {
          set({ wsStatus: 'connected' })
          // If the server identifies a project, activate it
          if (event.data.project !== null) {
            set({ activeProjectHash: event.data.project })
          }
          break
        }
        case 'ping': {
          // no-op — keepalive
          break
        }
        default: {
          // state_change and others don't affect connection store directly
          break
        }
      }
    })

    // Handle WS close by watching the ws module's status via polling-free approach:
    // The WS close is surfaced through the 'disconnected' status — we patch the
    // onclose indirectly by subscribing to a synthetic 'wsStatusChange' via a
    // second subscribe that wraps the original disconnect handler.
    //
    // Simpler approach: patch ws disconnect reporting into the store by using a
    // lightweight interval only while connecting/connected.
    // ACTUALLY: the cleanest pattern is to expose a separate "statusChange" listener
    // in the WS client. For now we use a module-augmentation approach — extend
    // ws/client.ts with an onStatusChange callback registration.
    //
    // Simplest correct approach for v0: use a polling shim that reads getStatus()
    // every 500ms and updates the store. This avoids modifying the ws client API.

    let lastKnownStatus: WsStatus = getStatus()
    const pollInterval = setInterval(() => {
      const current = getStatus()
      if (current !== lastKnownStatus) {
        lastKnownStatus = current
        set({ wsStatus: current })
      }
    }, 500)

    // Connect to WebSocket
    connect()

    // Note: pollInterval is intentionally not cleared — it persists for the
    // app lifetime (called once at app start from main.tsx). A future task can
    // expose an onStatusChange hook in ws/client to replace the poll.
    void pollInterval
  },
}))

// ─── Typed selector hooks ─────────────────────────────────────────────────────
// Each hook subscribes to only the slice it reads — minimizes re-renders.

export const useWsStatus = (): WsStatus =>
  useConnectionStore((s) => s.wsStatus)

export const useActiveProjectHash = (): string | null =>
  useConnectionStore((s) => s.activeProjectHash)

export const useProjectList = (): ProjectEntry[] =>
  useConnectionStore((s) => s.projectList)

/** Returns the ProjectEntry for the currently active project, or null. */
export const useActiveProject = (): ProjectEntry | null =>
  useConnectionStore((s) =>
    s.projectList.find((p) => p.hash === s.activeProjectHash) ?? null
  )
