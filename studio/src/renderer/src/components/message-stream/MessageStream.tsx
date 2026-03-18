import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import { Text } from '../ui/Text'
import { useSessionStore } from '@/stores/session-store'
import { buildMessageBlocks, type MessageBlock } from '@/lib/message-model'
import { AssistantBlock } from './AssistantBlock'
import { UserBlock } from './UserBlock'
import { ToolStub } from './ToolStub'

// ---------------------------------------------------------------------------
// Empty state — shown when no messages yet
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <Sparkle size={32} weight="duotone" className="text-accent/50" />
        <Text className="text-text-tertiary">
          Send a prompt to start a session
        </Text>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block dispatcher
// ---------------------------------------------------------------------------

function BlockRenderer({ block, isLastAssistant }: { block: MessageBlock; isLastAssistant: boolean }) {
  switch (block.type) {
    case 'assistant-text':
      return <AssistantBlock content={block.content} isLastBlock={isLastAssistant} />
    case 'tool-use':
      return <ToolStub toolName={block.toolName} status={block.status} />
    case 'user-prompt':
      return <UserBlock text={block.text} />
  }
}

// ---------------------------------------------------------------------------
// MessageStream — scrollable container with auto-scroll
// ---------------------------------------------------------------------------

export function MessageStream() {
  const events = useSessionStore((s) => s.events)
  const blocks = useMemo(() => buildMessageBlocks(events), [events])

  // Find the last assistant-text block index for caret logic
  const lastAssistantIdx = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === 'assistant-text') return i
    }
    return -1
  }, [blocks])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 80
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  // Auto-scroll when blocks change, but only if user hasn't scrolled up.
  useEffect(() => {
    if (isNearBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [blocks])

  if (blocks.length === 0) {
    return <EmptyState />
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
        {blocks.map((block, idx) => (
          <BlockRenderer
            key={block.id}
            block={block}
            isLastAssistant={idx === lastAssistantIdx}
          />
        ))}
      </div>
    </div>
  )
}
