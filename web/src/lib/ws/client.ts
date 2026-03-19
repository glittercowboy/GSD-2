// ─── WebSocket Singleton Client ───────────────────────────────────────────────
// Single WS connection with exponential backoff reconnect.
// Derives URL from VITE_API_URL — never hardcodes ws://127.0.0.1:4242.

import { BASE_URL } from '../api/client'
import type { StudioEvent } from '../api/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type WsStatus = 'connected' | 'connecting' | 'disconnected'
type WsListener = (event: StudioEvent) => void

// ─── Module-level singleton state ────────────────────────────────────────────

let ws: WebSocket | null = null
let status: WsStatus = 'disconnected'
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let shouldReconnect = true

const listeners = new Set<WsListener>()

// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
const BASE_DELAY = 1000
const MAX_DELAY = 30000

function getReconnectDelay(): number {
  return Math.min(BASE_DELAY * Math.pow(2, reconnectAttempt), MAX_DELAY)
}

/** Derive the WebSocket URL from BASE_URL (handles http/https → ws/wss) */
function getWsUrl(): string {
  try {
    const u = new URL(BASE_URL)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}`
  } catch {
    // BASE_URL may be a path-relative string in test environments
    const u = new URL(BASE_URL, window.location.href)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}`
  }
}

// ─── Connection management ────────────────────────────────────────────────────

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect(): void {
  if (!shouldReconnect) return
  clearReconnectTimer()
  const delay = getReconnectDelay()
  reconnectAttempt++
  console.log(
    `[gsd-ws] reconnecting in ${delay}ms (attempt ${reconnectAttempt})`
  )
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function dispatch(event: StudioEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (err) {
      console.error('[gsd-ws] listener error:', err)
    }
  }
}

/** Connect (or reconnect) to the GSD WebSocket server. Idempotent. */
export function connect(): void {
  if (ws !== null && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  shouldReconnect = true
  status = 'connecting'
  const url = getWsUrl()
  console.log(`[gsd-ws] connecting to ${url}`)

  try {
    ws = new WebSocket(url)
  } catch (err) {
    console.error('[gsd-ws] WebSocket construction error:', err)
    status = 'disconnected'
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    console.log('[gsd-ws] connected')
    status = 'connected'
    reconnectAttempt = 0 // reset backoff on success
  }

  ws.onclose = (ev) => {
    console.log(`[gsd-ws] disconnected (code=${ev.code}, clean=${ev.wasClean})`)
    status = 'disconnected'
    ws = null
    scheduleReconnect()
  }

  ws.onerror = (err) => {
    console.error('[gsd-ws] error:', err)
    // onclose fires after onerror — reconnect is handled there
  }

  ws.onmessage = (ev) => {
    let event: StudioEvent
    try {
      event = JSON.parse(ev.data as string) as StudioEvent
    } catch (err) {
      console.error('[gsd-ws] message parse error:', err, ev.data)
      return
    }
    dispatch(event)
  }
}

/** Permanently disconnect — no reconnect will be attempted until connect() is called again. */
export function disconnect(): void {
  shouldReconnect = false
  clearReconnectTimer()
  if (ws !== null) {
    ws.onclose = null // prevent scheduleReconnect on manual close
    ws.close()
    ws = null
  }
  status = 'disconnected'
  console.log('[gsd-ws] disconnected (manual)')
}

/**
 * Subscribe to WebSocket events.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribe(listener: WsListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Current connection status — safe to read synchronously. */
export function getStatus(): WsStatus {
  return status
}
