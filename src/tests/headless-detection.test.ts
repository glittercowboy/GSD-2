/**
 * Tests for headless completion detection.
 *
 * Verifies that isTerminalNotification only matches actual auto-mode stop
 * signals and does not false-positive on progress notifications that
 * happen to contain words like "complete" or "stopped".
 */

import test from "node:test";
import assert from "node:assert/strict";

// Import the module to get access to the functions via a dynamic import
// since headless.ts has side-effect-free detection functions but no exports.
// We'll test by extracting the logic inline.

// ─── Extracted detection logic (mirrors headless.ts) ────────────────────────

const PAUSED_PREFIXES = ['auto-mode paused', 'step-mode paused']
const TERMINAL_PREFIXES = [
  'auto-mode stopped',
  'step-mode stopped',
  'auto-mode complete',
  'no active milestone',
  'auto-mode idle',
]

function isManualResolutionNotification(message: string): boolean {
  return (
    message.includes('resolve manually and re-run /gsd auto') ||
    message.includes('resolve conflicts manually and run /gsd auto to resume') ||
    message.includes('resolve and run /gsd auto to resume')
  )
}

function isNonBlockingPauseNotification(message: string): boolean {
  return message.includes('idempotent advance: unit already active')
}

function isPauseNotification(message: string): boolean {
  return PAUSED_PREFIXES.some((prefix) => message.startsWith(prefix))
}

function isPauseNotificationRequiringIntervention(message: string): boolean {
  return isPauseNotification(message) && !isNonBlockingPauseNotification(message)
}

function getCommandBlockContent(event: Record<string, unknown>): string | null {
  if (event.type !== 'message_start' && event.type !== 'message_end') return null
  const message = event.message as Record<string, unknown> | undefined
  if (message?.customType !== 'gsd-command-block') return null
  return String(message.content ?? '').toLowerCase()
}

function isBlockingCommandBlock(event: Record<string, unknown>): boolean {
  const content = getCommandBlockContent(event)
  if (!content) return false
  return (
    (
      content.includes('cannot start new workflow work') &&
      content.includes('complete but not merged')
    ) ||
    content.includes('cannot run because the active milestone is blocked by validation')
  )
}

function isTerminalNotification(event: Record<string, unknown>): boolean {
  if (isBlockingCommandBlock(event)) return true
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  const message = String(event.message ?? '').toLowerCase()
  return (
    TERMINAL_PREFIXES.some((prefix) => message.startsWith(prefix)) ||
    isPauseNotification(message) ||
    isManualResolutionNotification(message)
  )
}

function isBlockedNotification(event: Record<string, unknown>): boolean {
  if (isBlockingCommandBlock(event)) return true
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  const message = String(event.message ?? '').toLowerCase()
  return (
    message.includes('blocked:') ||
    isPauseNotificationRequiringIntervention(message) ||
    isManualResolutionNotification(message)
  )
}

const QUICK_COMMANDS = new Set([
  'status', 'queue', 'history', 'hooks', 'export', 'stop', 'pause',
  'capture', 'skip', 'undo', 'knowledge', 'config', 'prefs',
  'cleanup', 'migrate', 'doctor', 'remote', 'help', 'steer',
  'triage', 'visualize',
])

const QUICK_WORKFLOW_SUBCOMMANDS = new Set(['list', 'validate'])

function isQuickCommand(command: string, commandArgs: readonly string[] = []): boolean {
  if (QUICK_COMMANDS.has(command)) return true
  return command === 'workflow' && QUICK_WORKFLOW_SUBCOMMANDS.has(commandArgs[0] ?? '')
}

function makeNotify(message: string): Record<string, unknown> {
  return { type: 'extension_ui_request', method: 'notify', message }
}

function makeCommandBlock(content: string): Record<string, unknown> {
  return {
    type: 'message_start',
    message: {
      role: 'custom',
      customType: 'gsd-command-block',
      content,
    },
  }
}

// ─── isTerminalNotification ─────────────────────────────────────────────────

test("detects 'Auto-mode stopped.' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Auto-mode stopped.")))
})

test("detects 'Auto-mode stopped (All milestones complete).' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Auto-mode stopped (All milestones complete). Session: $0.42 · 15K tokens · 8 units")))
})

test("detects 'Auto-mode stopped (Blocked: missing API key).' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Auto-mode stopped (Blocked: missing API key).")))
})

test("detects 'Auto-mode stopped (Milestone M001 complete).' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Auto-mode stopped (Milestone M001 complete).")))
})

test("detects 'Step-mode stopped.' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Step-mode stopped.")))
})

test("detects 'Auto-mode complete...' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify('Auto-mode complete — all milestones complete.')))
})

test("detects 'No active milestone...' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify('No active milestone in registry.')))
})

test("detects 'Auto-mode idle...' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify('Auto-mode idle: no roadmap work items found.')))
})

test("detects 'Auto-mode paused.' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Auto-mode paused (Escape). Type to interact, or /gsd auto to resume.")))
})

test("detects 'Step-mode paused.' as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Step-mode paused (Escape). Type to interact, or /gsd next to resume.")))
})

test("detects manual merge-resolution notification as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Survivor-branch finalization for M001 failed: merge conflict. Resolve manually and re-run /gsd auto.")))
})

test("detects unmerged milestone command block as terminal", () => {
  assert.ok(isTerminalNotification(makeCommandBlock("/gsd auto cannot start new workflow work because M001 is complete but not merged.")))
})

test("detects validation-blocked command block as terminal", () => {
  assert.ok(isTerminalNotification(makeCommandBlock("/gsd auto cannot run because the active milestone is blocked by validation.")))
})

// ─── False positives that previously triggered early exit (#879) ────────────

test("does NOT match 'All slices are complete — nothing to discuss.'", () => {
  assert.ok(!isTerminalNotification(makeNotify("All slices are complete — nothing to discuss.")))
})

test("does NOT match 'Override(s) resolved — rewrite-docs completed.'", () => {
  assert.ok(!isTerminalNotification(makeNotify("Override(s) resolved — rewrite-docs completed.")))
})

test("does NOT match 'Skipped 5+ completed units. Yielding to UI before continuing.'", () => {
  assert.ok(!isTerminalNotification(makeNotify("Skipped 5+ completed units. Yielding to UI before continuing.")))
})

test("does NOT match 'Cannot dispatch reassess-roadmap: no completed slices.'", () => {
  assert.ok(!isTerminalNotification(makeNotify("Cannot dispatch reassess-roadmap: no completed slices.")))
})

test("does NOT match 'Committed: feat(S03): complete task implementation'", () => {
  assert.ok(!isTerminalNotification(makeNotify("Committed: feat(S03): complete task implementation")))
})

test("does NOT match 'Post-hook: applied 3 fix(es).'", () => {
  assert.ok(!isTerminalNotification(makeNotify("Post-hook: applied 3 fix(es).")))
})

test("detects idempotent auto-mode advance pause as terminal", () => {
  assert.ok(isTerminalNotification(makeNotify("Auto-mode paused: idempotent advance: unit already active")))
})

test("does NOT match non-notify events", () => {
  assert.ok(!isTerminalNotification({ type: 'agent_end' }))
  assert.ok(!isTerminalNotification({ type: 'extension_ui_request', method: 'select', message: 'Auto-mode stopped.' }))
})

// ─── isBlockedNotification ──────────────────────────────────────────────────

test("detects blocked notification with 'Blocked:' prefix", () => {
  assert.ok(isBlockedNotification(makeNotify("Auto-mode stopped (Blocked: missing API key).")))
})

test("detects inline 'Blocked:' message", () => {
  assert.ok(isBlockedNotification(makeNotify("Blocked: no active milestone. Fix and run /gsd auto.")))
})

test("detects pause notifications as blocked in headless mode", () => {
  assert.ok(isBlockedNotification(makeNotify("Auto-mode paused due to provider error: connection reset")))
})

test("detects manual merge-resolution notifications as blocked", () => {
  assert.ok(isBlockedNotification(makeNotify("Merge conflict on milestone M001: src/conflict.js. Resolve conflicts manually and run /gsd auto to resume.")))
  assert.ok(isBlockedNotification(makeNotify("Merge error on milestone M001: remote rejected push. Resolve and run /gsd auto to resume.")))
})

test("detects blocking command blocks as blocked", () => {
  assert.ok(isBlockedNotification(makeCommandBlock("/gsd auto cannot start new workflow work because M001 is complete but not merged.")))
  assert.ok(isBlockedNotification(makeCommandBlock("/gsd auto cannot run because the active milestone is blocked by validation.")))
})

test("does NOT match 'blocked' without colon (avoids false positives)", () => {
  assert.ok(!isBlockedNotification(makeNotify("The request was blocked by the firewall")))
})

test("does NOT match idempotent auto-mode advance pause as blocked", () => {
  assert.ok(!isBlockedNotification(makeNotify("Auto-mode paused: idempotent advance: unit already active")))
})

// ─── isQuickCommand ─────────────────────────────────────────────────────────

test("treats workflow validate as a quick command", () => {
  assert.ok(isQuickCommand('workflow', ['validate', 'upgrade-probe']))
})

test("treats workflow list as a quick command", () => {
  assert.ok(isQuickCommand('workflow', ['list']))
})

test("does NOT treat workflow run as a quick command", () => {
  assert.ok(!isQuickCommand('workflow', ['run', 'upgrade-probe']))
})

test("does NOT treat bare workflow as a quick command", () => {
  assert.ok(!isQuickCommand('workflow'))
})
