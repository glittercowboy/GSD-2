/**
 * Auto-mode module index.
 *
 * Decomposition of the monolithic auto.ts into focused modules:
 *
 *   session.ts   — AutoSession class (centralized mutable state)
 *   budget.ts    — Budget alert levels and enforcement actions
 *   timeouts.ts  — Unit timeouts, dispatch gap watchdog
 *
 * The remaining logic in auto.ts imports from these modules and will
 * be progressively extracted as the refactor continues.
 */

export { AutoSession, type BudgetAlertLevel as SessionBudgetAlertLevel, type CompletedUnit, type CurrentUnit, type UnitRouting, MAX_UNIT_DISPATCHES, STUB_RECOVERY_THRESHOLD, MAX_LIFETIME_DISPATCHES, MAX_CONSECUTIVE_SKIPS, DISPATCH_GAP_TIMEOUT_MS } from "./session.js";
export { getBudgetAlertLevel, getNewBudgetAlertLevel, getBudgetEnforcementAction, type BudgetAlertLevel, type BudgetEnforcementMode } from "./budget.js";
export { clearUnitTimeout, clearDispatchGapWatchdog, startDispatchGapWatchdog } from "./timeouts.js";
export { state, resetState, stateSnapshot } from "./shared-state.js";
export { syncStateToProjectRoot, cleanStaleRuntimeUnits, checkResourcesStale, readResourceSyncedAt } from "./worktree-sync.js";
