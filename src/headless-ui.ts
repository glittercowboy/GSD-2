/**
 * Headless UI Handling — auto-response, progress formatting, and supervised stdin
 *
 * Handles extension UI requests (auto-responding in headless mode),
 * formats progress events for stderr output, and reads orchestrator
 * commands from stdin in supervised mode.
 */

import type { Readable } from 'node:stream'

import { RpcClient, attachJsonlLineReader } from '@gsd/pi-coding-agent'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtensionUIRequest {
  type: 'extension_ui_request'
  id: string
  method: string
  title?: string
  options?: string[]
  message?: string
  prefill?: string
  timeout?: number
  [key: string]: unknown
}

export type { ExtensionUIRequest }

// ---------------------------------------------------------------------------
// Extension UI Auto-Responder
// ---------------------------------------------------------------------------

export function handleExtensionUIRequest(
  event: ExtensionUIRequest,
  client: RpcClient,
): void {
  const { id, method } = event

  switch (method) {
    case 'select': {
      // Lock-guard prompts list "View status" first, but headless needs "Force start"
      // to proceed. Detect by title and pick the force option.
      const title = String(event.title ?? '')
      let selected = event.options?.[0] ?? ''
      if (title.includes('Auto-mode is running') && event.options) {
        const forceOption = event.options.find(o => o.toLowerCase().includes('force start'))
        if (forceOption) selected = forceOption
      }
      client.sendUIResponse(id, { value: selected })
      break
    }
    case 'confirm':
      client.sendUIResponse(id, { confirmed: true })
      break
    case 'input':
      client.sendUIResponse(id, { value: '' })
      break
    case 'editor':
      client.sendUIResponse(id, { value: event.prefill ?? '' })
      break
    case 'notify':
    case 'setStatus':
    case 'setWidget':
    case 'setTitle':
    case 'set_editor_text':
      client.sendUIResponse(id, { value: '' })
      break
    default:
      process.stderr.write(`[headless] Warning: unknown extension_ui_request method "${method}", cancelling\n`)
      client.sendUIResponse(id, { cancelled: true })
      break
  }
}

// ---------------------------------------------------------------------------
// Progress Formatter
// ---------------------------------------------------------------------------

export function formatProgress(event: Record<string, unknown>, verbose: boolean): string | null {
  const type = String(event.type ?? '')

  switch (type) {
    case 'tool_execution_start': {
      const name = String(event.toolName ?? 'unknown')
      const summary = summarizeToolArgs(name, event.args as Record<string, unknown> | undefined)
      return summary ? `  [tool]    ${name} ${summary}` : `  [tool]    ${name}`
    }

    case 'tool_execution_end': {
      if (verbose) {
        const name = String(event.toolName ?? 'unknown')
        const isError = Boolean(event.isError)
        return isError ? `  [tool]    ${name} ✗ error` : null
      }
      // In non-verbose, only surface errors
      if (event.isError) {
        const name = String(event.toolName ?? 'unknown')
        return `  [tool]    ${name} ✗ error`
      }
      return null
    }

    case 'cost_update': {
      const cumCost = event.cumulativeCost as Record<string, unknown> | undefined
      const costUsd = Number(cumCost?.costUsd ?? 0)
      if (costUsd > 0) {
        const tokens = event.tokens as Record<string, number> | undefined
        const inK = tokens ? (tokens.input / 1000).toFixed(1) : '?'
        const outK = tokens ? (tokens.output / 1000).toFixed(1) : '?'
        return `  [cost]    $${costUsd.toFixed(4)} (${inK}k in / ${outK}k out)`
      }
      return null
    }

    case 'agent_start':
      return '[agent]   Session started'

    case 'agent_end':
      return '[agent]   Session ended'

    case 'extension_ui_request':
      if (event.method === 'notify') {
        const msg = String(event.message ?? '')
        return msg ? `[gsd]     ${msg}` : null
      }
      // setStatus / setWidget are TUI-specific — suppress in text mode
      return null

    default:
      return null
  }
}

/**
 * Extract a short summary from tool arguments for display.
 * Returns null if nothing useful can be summarized.
 */
function summarizeToolArgs(toolName: string, args: Record<string, unknown> | undefined): string | null {
  if (!args) return null

  switch (toolName) {
    case 'Read':
    case 'read':
      return args.path ? String(args.path) : null
    case 'Write':
    case 'write':
      return args.path ? String(args.path) : null
    case 'Edit':
    case 'edit':
      return args.path ? String(args.path) : null
    case 'Bash':
    case 'bash': {
      const cmd = String(args.command ?? '')
      return cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd || null
    }
    case 'Grep':
    case 'grep':
      return args.pattern ? `/${args.pattern}/` + (args.path ? ` in ${args.path}` : '') : null
    case 'find':
      return args.pattern ? String(args.pattern) + (args.path ? ` in ${args.path}` : '') : null
    case 'lsp':
      return args.action ? String(args.action) + (args.symbol ? ` ${args.symbol}` : '') : null
    default: {
      // For GSD tools, show the first string arg that looks like an ID or path
      const first = Object.values(args).find(v => typeof v === 'string' && String(v).length < 80)
      return first ? String(first) : null
    }
  }
}

// ---------------------------------------------------------------------------
// Supervised Stdin Reader
// ---------------------------------------------------------------------------

export function startSupervisedStdinReader(
  client: RpcClient,
  onResponse: (id: string) => void,
): () => void {
  return attachJsonlLineReader(process.stdin as Readable, (line) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      process.stderr.write(`[headless] Warning: invalid JSON from orchestrator stdin, skipping\n`)
      return
    }

    const type = String(msg.type ?? '')

    switch (type) {
      case 'extension_ui_response': {
        const id = String(msg.id ?? '')
        const value = msg.value !== undefined ? String(msg.value) : undefined
        const confirmed = typeof msg.confirmed === 'boolean' ? msg.confirmed : undefined
        const cancelled = typeof msg.cancelled === 'boolean' ? msg.cancelled : undefined
        client.sendUIResponse(id, { value, confirmed, cancelled })
        if (id) {
          onResponse(id)
        }
        break
      }
      case 'prompt':
        client.prompt(String(msg.message ?? ''))
        break
      case 'steer':
        client.steer(String(msg.message ?? ''))
        break
      case 'follow_up':
        client.followUp(String(msg.message ?? ''))
        break
      default:
        process.stderr.write(`[headless] Warning: unknown message type "${type}" from orchestrator stdin\n`)
        break
    }
  })
}
