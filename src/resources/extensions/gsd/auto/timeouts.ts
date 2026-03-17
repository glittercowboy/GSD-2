/**
 * Timeout and watchdog management for auto-mode dispatch.
 *
 * Manages three timing mechanisms:
 * - Unit timeout: fires when a dispatched unit takes too long
 * - Wrapup warning: signals the agent to finish up before hard timeout
 * - Dispatch gap watchdog: catches stalled dispatch chains where no new
 *   unit is dispatched after handleAgentEnd completes
 *
 * All timers operate on an AutoSession instance rather than module globals.
 */

import type { AutoSession } from "./session.js";
import { DISPATCH_GAP_TIMEOUT_MS } from "./session.js";

/**
 * Clear all unit-related timers and in-flight tool tracking.
 */
export function clearUnitTimeout(session: AutoSession): void {
  session.clearAllTimers();
  session.inFlightTools.clear();
}

/**
 * Clear just the dispatch gap watchdog.
 */
export function clearDispatchGapWatchdog(session: AutoSession): void {
  if (session.dispatchGapHandle) {
    clearTimeout(session.dispatchGapHandle);
    session.dispatchGapHandle = null;
  }
}

/**
 * Start a watchdog that fires if no new unit is dispatched within
 * DISPATCH_GAP_TIMEOUT_MS after handleAgentEnd completes.
 *
 * This catches cases where the dispatch chain silently breaks
 * (e.g., unhandled exception in dispatchNextUnit) and auto-mode
 * is left active but idle.
 *
 * @param onGapDetected - Called when the gap fires. Receives the session
 *   for state inspection and should handle re-dispatch or stop.
 */
export function startDispatchGapWatchdog(
  session: AutoSession,
  onGapDetected: () => Promise<void>,
): void {
  clearDispatchGapWatchdog(session);
  session.dispatchGapHandle = setTimeout(async () => {
    session.dispatchGapHandle = null;
    if (!session.active || !session.cmdCtx) return;
    await onGapDetected();
  }, DISPATCH_GAP_TIMEOUT_MS);
}
