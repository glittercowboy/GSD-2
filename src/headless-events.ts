/**
 * Headless Event Detection — notification classification and command detection
 *
 * Detects terminal notifications, blocked notifications, milestone-ready signals,
 * and classifies commands as quick (single-turn) vs long-running.
 *
 * Also defines exit code constants and the status→exit-code mapping function.
 */

// ---------------------------------------------------------------------------
// Exit Code Constants
// ---------------------------------------------------------------------------

export const EXIT_SUCCESS = 0
export const EXIT_ERROR = 1
export const EXIT_BLOCKED = 10
export const EXIT_CANCELLED = 11

/**
 * Map a headless session status string to its standardized exit code.
 *
 *   success   → 0
 *   complete  → 0
 *   completed → 0
 *   error     → 1
 *   timeout   → 1
 *   blocked   → 10
 *   paused    → 10
 *   cancelled → 11
 *
 * Unknown statuses default to EXIT_ERROR (1).
 */
export function mapStatusToExitCode(status: string): number {
  switch (status) {
    case 'success':
    case 'complete':
    case 'completed':
      return EXIT_SUCCESS
    case 'error':
    case 'timeout':
      return EXIT_ERROR
    case 'blocked':
    case 'paused':
      return EXIT_BLOCKED
    case 'cancelled':
      return EXIT_CANCELLED
    default:
      return EXIT_ERROR
  }
}

// ---------------------------------------------------------------------------
// Completion Detection
// ---------------------------------------------------------------------------

/**
 * Detect genuine auto-mode termination notifications.
 *
 * Matches the actual stop/pause signals emitted by stopAuto()/pauseAuto():
 *   "Auto-mode stopped..."
 *   "Step-mode stopped..."
 *   "Auto-mode paused..."
 *   "Step-mode paused..."
 * plus bootstrap-time manual-resolution failures that return before auto-mode
 * can emit a formal pause/stop notification.
 *
 * Does NOT match progress notifications that happen to contain words like
 * "complete" or "stopped" (e.g., "Override resolved — rewrite-docs completed",
 * "All slices are complete — nothing to discuss", "Skipped 5+ completed units").
 *
 * Blocked detection is separate — checked via isBlockedNotification.
 */
export const PAUSED_PREFIXES = ['auto-mode paused', 'step-mode paused']
export const TERMINAL_PREFIXES = [
  'auto-mode stopped',
  'step-mode stopped',
  'auto-mode complete',
  'no active milestone',
  'auto-mode idle',
]
export const IDLE_TIMEOUT_MS = 15_000
// new-milestone is a long-running creative task where the LLM may pause
// between tool calls (e.g. after mkdir, before writing files). Use a
// longer idle timeout to avoid killing the session prematurely (#808).
export const NEW_MILESTONE_IDLE_TIMEOUT_MS = 120_000
const INTERACTIVE_HEADLESS_TOOLS = new Set(['ask_user_questions', 'secure_env_collect'])

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

export function isTerminalNotification(event: Record<string, unknown>): boolean {
  if (isBlockingCommandBlock(event)) return true
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  const message = String(event.message ?? '').toLowerCase()
  return (
    TERMINAL_PREFIXES.some((prefix) => message.startsWith(prefix)) ||
    isPauseNotification(message) ||
    isManualResolutionNotification(message)
  )
}

export function isBlockedNotification(event: Record<string, unknown>): boolean {
  if (isBlockingCommandBlock(event)) return true
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  const message = String(event.message ?? '').toLowerCase()
  // Recoverable pauses need operator intervention in headless mode.
  return (
    message.includes('blocked:') ||
    isPauseNotificationRequiringIntervention(message) ||
    isManualResolutionNotification(message)
  )
}

export function isMilestoneReadyNotification(event: Record<string, unknown>): boolean {
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  return /milestone\s+m\d+.*ready/i.test(String(event.message ?? ''))
}

export function isInteractiveHeadlessTool(toolName: string | undefined): boolean {
  return INTERACTIVE_HEADLESS_TOOLS.has(String(toolName ?? ''))
}

export function shouldArmHeadlessIdleTimeout(toolCallCount: number, interactiveToolCount: number): boolean {
  return toolCallCount > 0 && interactiveToolCount === 0
}

// ---------------------------------------------------------------------------
// Quick Command Detection
// ---------------------------------------------------------------------------

export const FIRE_AND_FORGET_METHODS = new Set(['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'])

export const QUICK_COMMANDS = new Set([
  'status', 'queue', 'history', 'hooks', 'export', 'stop', 'pause',
  'capture', 'skip', 'undo', 'knowledge', 'config', 'prefs',
  'cleanup', 'migrate', 'doctor', 'remote', 'help', 'steer',
  'triage', 'visualize',
])

const QUICK_WORKFLOW_SUBCOMMANDS = new Set(['list', 'validate'])

export function isQuickCommand(command: string, commandArgs: readonly string[] = []): boolean {
  if (QUICK_COMMANDS.has(command)) return true
  return command === 'workflow' && QUICK_WORKFLOW_SUBCOMMANDS.has(commandArgs[0] ?? '')
}
