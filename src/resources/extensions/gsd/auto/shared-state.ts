/**
 * Shared module-level state for auto-mode.
 *
 * This module owns all mutable state that was previously scattered as bare
 * `let`/`const` declarations in auto.ts. Functions in other auto/* modules
 * import from here instead of closing over module-level variables.
 *
 * Why a module singleton instead of a class instance: the existing codebase
 * has hundreds of call sites that reference these variables directly. A
 * module-level export is the lowest-friction migration path — existing code
 * can switch from `variable` to `state.variable` with a find-replace,
 * while new code gets the benefit of centralized, inspectable state.
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import type { GitServiceImpl } from "../git-service.js";
import type { BudgetAlertLevel } from "./budget.js";
import type { CaptureEntry } from "../captures.js";

export const state = {
  // ── Lifecycle ─────────────────────────────────────────────────────────
  active: false,
  paused: false,
  stepMode: false,
  verbose: false,
  cmdCtx: null as ExtensionCommandContext | null,

  // ── Paths ─────────────────────────────────────────────────────────────
  basePath: "",
  originalBasePath: "",

  // ── Git ───────────────────────────────────────────────────────────────
  gitService: null as GitServiceImpl | null,

  // ── Dispatch tracking ─────────────────────────────────────────────────
  unitDispatchCount: new Map<string, number>(),
  unitLifetimeDispatches: new Map<string, number>(),
  unitRecoveryCount: new Map<string, number>(),
  unitConsecutiveSkips: new Map<string, number>(),
  completedKeySet: new Set<string>(),

  // ── Timers ────────────────────────────────────────────────────────────
  unitTimeoutHandle: null as ReturnType<typeof setTimeout> | null,
  wrapupWarningHandle: null as ReturnType<typeof setTimeout> | null,
  idleWatchdogHandle: null as ReturnType<typeof setInterval> | null,
  dispatchGapHandle: null as ReturnType<typeof setTimeout> | null,

  // ── Context ───────────────────────────────────────────────────────────
  pendingCrashRecovery: null as string | null,
  pausedSessionFile: null as string | null,
  currentMilestoneId: null as string | null,
  pendingQuickTasks: [] as CaptureEntry[],
  resourceSyncedAtOnStart: null as number | null,

  // ── Model ─────────────────────────────────────────────────────────────
  autoModeStartModel: null as { provider: string; id: string } | null,
  originalModelId: null as string | null,
  originalModelProvider: null as string | null,
  currentUnitRouting: null as { tier: string; modelDowngraded: boolean } | null,
  lastBudgetAlertLevel: 0 as BudgetAlertLevel,

  // ── Metrics ───────────────────────────────────────────────────────────
  autoStartTime: 0,
  completedUnits: [] as Array<{ type: string; id: string; startedAt: number; finishedAt: number }>,
  currentUnit: null as { type: string; id: string; startedAt: number } | null,
  lastPromptCharCount: undefined as number | undefined,
  lastBaselineCharCount: undefined as number | undefined,

  // ── In-flight tool tracking ───────────────────────────────────────────
  inFlightTools: new Map<string, number>(),

  // ── Internal flags ────────────────────────────────────────────────────
  handlingAgentEnd: false,
  sigtermHandler: null as (() => void) | null,
  dispatching: false,
  skipDepth: 0,
};

/** Reset all state to initial values. Called by stopAuto. */
export function resetState(): void {
  state.active = false;
  state.paused = false;
  state.stepMode = false;
  state.verbose = false;
  state.cmdCtx = null;
  state.basePath = "";
  state.originalBasePath = "";
  state.gitService = null;
  state.unitDispatchCount.clear();
  state.unitLifetimeDispatches.clear();
  state.unitRecoveryCount.clear();
  state.unitConsecutiveSkips.clear();
  // completedKeySet is NOT cleared — it persists across stop/start
  state.unitTimeoutHandle = null;
  state.wrapupWarningHandle = null;
  state.idleWatchdogHandle = null;
  state.dispatchGapHandle = null;
  state.pendingCrashRecovery = null;
  state.pausedSessionFile = null;
  state.currentMilestoneId = null;
  state.pendingQuickTasks = [];
  state.resourceSyncedAtOnStart = null;
  state.autoModeStartModel = null;
  state.originalModelId = null;
  state.originalModelProvider = null;
  state.currentUnitRouting = null;
  state.lastBudgetAlertLevel = 0;
  state.autoStartTime = 0;
  state.completedUnits = [];
  state.currentUnit = null;
  state.lastPromptCharCount = undefined;
  state.lastBaselineCharCount = undefined;
  state.inFlightTools.clear();
  state.handlingAgentEnd = false;
  state.sigtermHandler = null;
  state.dispatching = false;
  state.skipDepth = 0;
}

/** Dump state for diagnostics. */
export function stateSnapshot(): Record<string, unknown> {
  return {
    active: state.active,
    paused: state.paused,
    stepMode: state.stepMode,
    basePath: state.basePath,
    originalBasePath: state.originalBasePath,
    currentMilestoneId: state.currentMilestoneId,
    currentUnit: state.currentUnit,
    completedUnits: state.completedUnits.length,
    completedKeySet: state.completedKeySet.size,
    unitDispatchCount: Object.fromEntries(state.unitDispatchCount),
    unitLifetimeDispatches: Object.fromEntries(state.unitLifetimeDispatches),
    unitConsecutiveSkips: Object.fromEntries(state.unitConsecutiveSkips),
    inFlightTools: state.inFlightTools.size,
    autoStartTime: state.autoStartTime,
    lastBudgetAlertLevel: state.lastBudgetAlertLevel,
    dispatching: state.dispatching,
    skipDepth: state.skipDepth,
  };
}
