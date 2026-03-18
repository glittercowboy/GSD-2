import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type StoreEvent = {
  id: number
  timestamp: number
  data: Record<string, unknown>
}

export type SessionState = {
  model?: { provider: string; id: string }
  sessionName?: string
} | null

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type SessionStore = {
  connectionStatus: ConnectionStatus
  events: StoreEvent[]
  lastError: string | null
  isStreaming: boolean
  sessionState: SessionState

  // Actions
  addEvent: (data: Record<string, unknown>) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setError: (message: string) => void
  clearEvents: () => void
  setStreaming: (value: boolean) => void
  updateSessionState: (partial: Partial<NonNullable<SessionState>>) => void
}

const MAX_EVENTS = 500
let nextEventId = 1

export const useSessionStore = create<SessionStore>((set) => ({
  connectionStatus: 'disconnected',
  events: [],
  lastError: null,
  isStreaming: false,
  sessionState: null,

  addEvent: (data) =>
    set((state) => {
      const event: StoreEvent = {
        id: nextEventId++,
        timestamp: Date.now(),
        data
      }
      const events = [...state.events, event]
      // Cap at MAX_EVENTS — drop oldest
      if (events.length > MAX_EVENTS) {
        return { events: events.slice(events.length - MAX_EVENTS) }
      }
      return { events }
    }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setError: (message) => set({ lastError: message, connectionStatus: 'error' }),

  clearEvents: () => set({ events: [] }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  updateSessionState: (partial) =>
    set((state) => ({
      sessionState: { ...state.sessionState, ...partial }
    }))
}))
