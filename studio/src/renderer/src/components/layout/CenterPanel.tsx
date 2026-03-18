import { useCallback, useEffect, useRef, useState } from 'react'
import { SparkleIcon } from '@phosphor-icons/react'
import { Button } from '../ui/Button'
import { Text } from '../ui/Text'
import { useGsd } from '@/lib/rpc/use-gsd'
import { useSessionStore, type ConnectionStatus, type StoreEvent } from '@/stores/session-store'

// ---------------------------------------------------------------------------
// Connection status badge
// ---------------------------------------------------------------------------

const statusConfig: Record<
  ConnectionStatus,
  { dotClass: string; label: string }
> = {
  disconnected: { dotClass: 'bg-text-tertiary', label: 'Disconnected' },
  connecting: { dotClass: 'bg-accent animate-pulse', label: 'Connecting…' },
  connected: { dotClass: 'bg-emerald-500', label: 'Connected' },
  error: { dotClass: 'bg-red-500', label: 'Error' }
}

function ConnectionBadge() {
  const status = useSessionStore((s) => s.connectionStatus)
  const lastError = useSessionStore((s) => s.lastError)
  const cfg = statusConfig[status]

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-bg-secondary/80 px-3 py-1.5 text-text-tertiary shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <span className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`} />
      <span className="text-[12px] font-medium">
        {status === 'error' && lastError ? lastError : cfg.label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event type badge
// ---------------------------------------------------------------------------

function eventTypeColor(type: string): string {
  if (type === 'message_update') return 'bg-accent/20 text-accent'
  if (type.startsWith('tool_')) return 'bg-sky-500/15 text-sky-400'
  if (type === 'stderr') return 'bg-red-500/15 text-red-400'
  return 'bg-bg-tertiary text-text-tertiary'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function truncateJson(data: Record<string, unknown>, maxLen = 2000): string {
  const json = JSON.stringify(data, null, 2)
  if (json.length <= maxLen) return json
  return json.slice(0, maxLen) + '\n… (truncated)'
}

// ---------------------------------------------------------------------------
// Single event row
// ---------------------------------------------------------------------------

function EventRow({ event }: { event: StoreEvent }) {
  const eventType = String(event.data.type ?? event.data.event ?? 'unknown')

  return (
    <div className="rounded-[10px] border border-border bg-bg-secondary/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${eventTypeColor(eventType)}`}
        >
          {eventType}
        </span>
        <span className="font-mono text-[11px] text-text-tertiary">
          {formatTime(event.timestamp)}
        </span>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-[8px] bg-[#0b0b0b] p-3 font-mono text-[12px] leading-5 text-[#e7d4b0]">
        {truncateJson(event.data)}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <SparkleIcon size={32} weight="duotone" className="text-accent/50" />
        <Text className="text-text-tertiary">
          Send a prompt to start a session
        </Text>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CenterPanel
// ---------------------------------------------------------------------------

export function CenterPanel() {
  const { sendPrompt } = useGsd()
  const connectionStatus = useSessionStore((s) => s.connectionStatus)
  const events = useSessionStore((s) => s.events)

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)

  // Track scroll position to decide auto-scroll behavior
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 80 // px from bottom
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  // Auto-scroll when new events arrive, but only if user is near bottom
  useEffect(() => {
    if (isNearBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  const isConnected = connectionStatus === 'connected'

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || !isConnected) return
    sendPrompt(trimmed)
    setInput('')
  }, [input, isConnected, sendPrompt])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-border bg-[radial-gradient(circle_at_top,rgba(212,160,78,0.09),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Text as="h2" preset="subheading">
            Conversation
          </Text>
          <Text preset="label" className="mt-1">
            Raw event stream
          </Text>
        </div>
        <ConnectionBadge />
      </div>

      {/* Event log */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto border-t border-border px-6 py-4"
      >
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {events.map((evt) => (
              <EventRow key={evt.id} event={evt} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-3 rounded-[8px] border border-border bg-bg-primary/90 p-3 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
            <label className="flex-1 rounded-[6px] transition-shadow duration-150 focus-within:shadow-[0_0_0_2px_rgba(212,160,78,0.35)]">
              <span className="sr-only">Prompt</span>
              <textarea
                className="min-h-24 w-full resize-none border-0 bg-transparent px-3 py-2 font-sans text-[14px] leading-6 text-text-primary outline-none ring-0 placeholder:text-text-tertiary focus-visible:outline-none disabled:opacity-50"
                disabled={!isConnected}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isConnected
                    ? 'Ask gsd-2 to reason, plan, or execute…'
                    : 'Waiting for connection…'
                }
                value={input}
              />
            </label>
            <Button
              className="rounded-[8px] px-4"
              disabled={!isConnected || !input.trim()}
              onClick={handleSend}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
