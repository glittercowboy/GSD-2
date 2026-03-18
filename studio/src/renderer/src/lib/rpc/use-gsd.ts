import { useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '@/stores/session-store'

/**
 * useGsd — Bridges the preload IPC layer to the Zustand session store and
 * exposes a stable command API. Call once (CenterPanel mounts with the layout).
 */
export function useGsd() {
  const mounted = useRef(false)

  useEffect(() => {
    // Guard against StrictMode double-mount
    if (mounted.current) return
    mounted.current = true

    const store = useSessionStore.getState()
    const bridge = window.studio

    // ---- IPC subscriptions ----
    const removeEvent = bridge.onEvent((raw: unknown) => {
      const data = raw as Record<string, unknown>
      const { addEvent, setStreaming, updateSessionState } = useSessionStore.getState()

      addEvent(data)

      const eventType = data.type ?? data.event

      if (eventType === 'state_update') {
        const payload = (data.data ?? data) as Record<string, unknown>
        updateSessionState(payload as Partial<{ model: { provider: string; id: string }; sessionName: string }>)
      }

      if (eventType === 'agent_start') setStreaming(true)
      if (eventType === 'agent_end') setStreaming(false)
    })

    const removeConnection = bridge.onConnectionChange((connected: boolean) => {
      useSessionStore.getState().setConnectionStatus(connected ? 'connected' : 'disconnected')
    })

    const removeStderr = bridge.onStderr((message: string) => {
      useSessionStore.getState().addEvent({ type: 'stderr', message })
    })

    // ---- Auto-spawn ----
    bridge.getStatus().then((status) => {
      if (!status.connected) {
        store.setConnectionStatus('connecting')
        bridge.spawn().catch((err: unknown) => {
          useSessionStore.getState().setError(String(err))
        })
      } else {
        store.setConnectionStatus('connected')
      }
    })

    return () => {
      mounted.current = false
      removeEvent()
      removeConnection()
      removeStderr()
    }
  }, [])

  // ---- Stable command API ----
  const sendPrompt = useCallback((message: string) => {
    window.studio.sendCommand({ type: 'prompt', message })
  }, [])

  const abort = useCallback(() => {
    window.studio.sendCommand({ type: 'abort' })
  }, [])

  const spawn = useCallback(() => {
    useSessionStore.getState().setConnectionStatus('connecting')
    window.studio.spawn().catch((err: unknown) => {
      useSessionStore.getState().setError(String(err))
    })
  }, [])

  return { sendPrompt, abort, spawn }
}
