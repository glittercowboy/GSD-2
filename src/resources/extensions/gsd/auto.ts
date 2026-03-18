/**
 * GSD Auto Mode — Fresh Session Per Unit
 *
 * State machine driven by .gsd/ files on disk. Each "unit" of work
 * (plan slice, execute task, complete slice) gets a fresh session via
 * the stashed ctx.newSession() pattern.
 *
 * The extension reads disk state after each agent_end, determines the
 * next unit type, creates a fresh session, and injects a focused prompt
 * telling the LLM which files to read and what to do.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@gsd/pi-coding-agent";

import { deriveState } from "./state.js";
import type { GSDState } from "./types.js";
import { getManifestStatus } from "./files.js";
export { inlinePriorMilestoneSummary } from "./files.js";
import { collectSecretsFromManifest } from "../get-secrets-from-user.js";
import {
  gsdRoot,
  resolveMilestoneFile,
  resolveSliceFile,
  resolveSlicePath,
  resolveMilestonePath,
  resolveDir,
  resolveTasksDir,
  resolveTaskFile,
  milestonesDir,
  buildTaskFileName,
} from "./paths.js";
import { invalidateAllCaches } from "./cache.js";
import { clearActivityLogState } from "./activity-log.js";
import {
  synthesizeCrashRecovery,
  getDeepDiagnostic,
} from "./session-forensics.js";
import {
  writeLock,
  clearLock,
  readCrashLock,
  isLockProcessAlive,
} from "./crash-recovery.js";
import {
  acquireSessionLock,
  getSessionLockStatus,
  releaseSessionLock,
  updateSessionLock,
} from "./session-lock.js";
import type { SessionLockStatus } from "./session-lock.js";
import {
  clearUnitRuntimeRecord,
  inspectExecuteTaskDurability,
  readUnitRuntimeRecord,
  writeUnitRuntimeRecord,
} from "./unit-runtime.js";
import {
  resolveAutoSupervisorConfig,
  loadEffectiveGSDPreferences,
  getIsolationMode,
} from "./preferences.js";
import { sendDesktopNotification } from "./notifications.js";
import type { GSDPreferences } from "./preferences.js";
import {
  type BudgetAlertLevel,
  getBudgetAlertLevel,
  getNewBudgetAlertLevel,
  getBudgetEnforcementAction,
} from "./auto-budget.js";
import {
  markToolStart as _markToolStart,
  markToolEnd as _markToolEnd,
  getOldestInFlightToolAgeMs as _getOldestInFlightToolAgeMs,
  getInFlightToolCount,
  getOldestInFlightToolStart,
  clearInFlightTools,
} from "./auto-tool-tracking.js";
import {
  collectObservabilityWarnings as _collectObservabilityWarnings,
  buildObservabilityRepairBlock,
} from "./auto-observability.js";
import { closeoutUnit } from "./auto-unit-closeout.js";
import { recoverTimedOutUnit } from "./auto-timeout-recovery.js";
import { selectAndApplyModel } from "./auto-model-selection.js";
import {
  syncProjectRootToWorktree,
  syncStateToProjectRoot,
  readResourceVersion,
  checkResourcesStale,
  escapeStaleWorktree,
} from "./auto-worktree-sync.js";
import { resetRoutingHistory, recordOutcome } from "./routing-history.js";
import {
  checkPostUnitHooks,
  getActiveHook,
  resetHookState,
  isRetryPending,
  consumeRetryTrigger,
  runPreDispatchHooks,
  persistHookState,
  restoreHookState,
  clearPersistedHookState,
} from "./post-unit-hooks.js";
import { runGSDDoctor, rebuildState } from "./doctor.js";
import {
  preDispatchHealthGate,
  recordHealthSnapshot,
  checkHealEscalation,
  resetProactiveHealing,
  formatHealthSummary,
  getConsecutiveErrorUnits,
} from "./doctor-proactive.js";
import { clearSkillSnapshot } from "./skill-discovery.js";
import {
  captureAvailableSkills,
  resetSkillTelemetry,
} from "./skill-telemetry.js";
import {
  initMetrics,
  resetMetrics,
  getLedger,
  getProjectTotals,
  formatCost,
  formatTokenCount,
} from "./metrics.js";
import { join } from "node:path";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { atomicWriteSync } from "./atomic-write.js";
import {
  autoCommitCurrentBranch,
  captureIntegrationBranch,
  detectWorktreeName,
  getCurrentBranch,
  getMainBranch,
  MergeConflictError,
  parseSliceBranch,
  setActiveMilestoneId,
} from "./worktree.js";
import { GitServiceImpl } from "./git-service.js";
import { getPriorSliceCompletionBlocker } from "./dispatch-guard.js";
import {
  createAutoWorktree,
  enterAutoWorktree,
  teardownAutoWorktree,
  isInAutoWorktree,
  getAutoWorktreePath,
  getAutoWorktreeOriginalBase,
  mergeMilestoneToMain,
  autoWorktreeBranch,
  syncWorktreeStateBack,
} from "./auto-worktree.js";
import { pruneQueueOrder } from "./queue-order.js";

import { debugLog, isDebugEnabled, writeDebugSummary } from "./debug-logger.js";
import {
  resolveExpectedArtifactPath,
  verifyExpectedArtifact,
  writeBlockerPlaceholder,
  diagnoseExpectedArtifact,
  skipExecuteTask,
  buildLoopRemediationSteps,
  reconcileMergeState,
} from "./auto-recovery.js";
import { resolveDispatch } from "./auto-dispatch.js";
import {
  type AutoDashboardData,
  updateProgressWidget as _updateProgressWidget,
  updateSliceProgressCache,
  clearSliceProgressCache,
  describeNextUnit as _describeNextUnit,
  unitVerb,
  formatAutoElapsed as _formatAutoElapsed,
  formatWidgetTokens,
  hideFooter,
  type WidgetStateAccessors,
} from "./auto-dashboard.js";
import {
  registerSigtermHandler as _registerSigtermHandler,
  deregisterSigtermHandler as _deregisterSigtermHandler,
  detectWorkingTreeActivity,
} from "./auto-supervisor.js";
import { isDbAvailable } from "./gsd-db.js";
import { countPendingCaptures } from "./captures.js";
import { clearCmuxSidebar, logCmuxEvent, syncCmuxSidebar } from "../cmux/index.js";

// ── Extracted modules ──────────────────────────────────────────────────────
import { startUnitSupervision } from "./auto-timers.js";
import { runPostUnitVerification } from "./auto-verification.js";
import {
  postUnitPreVerification,
  postUnitPostVerification,
} from "./auto-post-unit.js";
import { bootstrapAutoSession, type BootstrapDeps } from "./auto-start.js";
import { autoLoop, resolveAgentEnd, type LoopDeps } from "./auto-loop.js";
import {
  WorktreeResolver,
  type WorktreeResolverDeps,
} from "./worktree-resolver.js";
import { reorderForCaching } from "./prompt-ordering.js";

// Worktree sync, resource staleness, stale worktree escape → auto-worktree-sync.ts

// ─── Session State ─────────────────────────────────────────────────────────

import {
  AutoSession,
  MAX_UNIT_DISPATCHES,
  STUB_RECOVERY_THRESHOLD,
  MAX_LIFETIME_DISPATCHES,
  NEW_SESSION_TIMEOUT_MS,
} from "./auto/session.js";
import type {
  CompletedUnit,
  CurrentUnit,
  UnitRouting,
  StartModel,
} from "./auto/session.js";
export {
  MAX_UNIT_DISPATCHES,
  STUB_RECOVERY_THRESHOLD,
  MAX_LIFETIME_DISPATCHES,
  NEW_SESSION_TIMEOUT_MS,
} from "./auto/session.js";
export type {
  CompletedUnit,
  CurrentUnit,
  UnitRouting,
  StartModel,
} from "./auto/session.js";

// ── ENCAPSULATION INVARIANT ─────────────────────────────────────────────────
// ALL mutable auto-mode state lives in the AutoSession class (auto/session.ts).
// This file must NOT declare module-level `let` or `var` variables for state.
// The single `s` instance below is the only mutable module-level binding.
//
// When adding features or fixing bugs:
//   - New mutable state → add a property to AutoSession, not a module-level variable
//   - New constants → module-level `const` is fine (immutable)
//   - New state that needs reset on stopAuto → add to AutoSession.reset()
//
// Tests in auto-session-encapsulation.test.ts enforce this invariant.
// ─────────────────────────────────────────────────────────────────────────────
const s = new AutoSession();

/** Throttle STATE.md rebuilds — at most once per 30 seconds */
const STATE_REBUILD_MIN_INTERVAL_MS = 30_000;

export function shouldUseWorktreeIsolation(): boolean {
  const prefs = loadEffectiveGSDPreferences()?.preferences?.git;
  if (prefs?.isolation === "none") return false;
  if (prefs?.isolation === "branch") return false;
  return true; // default: worktree
}

/** Crash recovery prompt — set by startAuto, consumed by the main loop */

/** Pending verification retry — set when gate fails with retries remaining, consumed by autoLoop */

/** Verification retry count per unitId — separate from s.unitDispatchCount which tracks artifact-missing retries */

/** Session file path captured at pause — used to synthesize recovery briefing on resume */

/** Dashboard tracking */

/** Track dynamic routing decision for the current unit (for metrics) */

/** Queue of quick-task captures awaiting dispatch after triage resolution */

/**
 * Model captured at auto-mode start. Used to prevent model bleed between
 * concurrent GSD instances sharing the same global settings.json (#650).
 * When preferences don't specify a model for a unit type, this ensures
 * the session's original model is re-applied instead of reading from
 * the shared global settings (which another instance may have overwritten).
 */

/** Track current milestone to detect transitions */

/** Model the user had selected before auto-mode started */

/** Progress-aware timeout supervision */

/** Context-pressure continue-here monitor — fires once when context usage >= 70% */

/** Prompt character measurement for token savings analysis (R051). */

/** SIGTERM handler registered while auto-mode is active — cleared on stop/pause. */

/**
 * Tool calls currently being executed — prevents false idle detection during long-running tools.
 * Maps toolCallId → start timestamp (ms) so the idle watchdog can detect tools that have been
 * running suspiciously long (e.g., a Bash command hung because `&` kept stdout open).
 */
// Re-export budget utilities for external consumers
export {
  getBudgetAlertLevel,
  getNewBudgetAlertLevel,
  getBudgetEnforcementAction,
} from "./auto-budget.js";

/** Wrapper: register SIGTERM handler and store reference. */
function registerSigtermHandler(currentBasePath: string): void {
  s.sigtermHandler = _registerSigtermHandler(currentBasePath, s.sigtermHandler);
}

/** Wrapper: deregister SIGTERM handler and clear reference. */
function deregisterSigtermHandler(): void {
  _deregisterSigtermHandler(s.sigtermHandler);
  s.sigtermHandler = null;
}

export { type AutoDashboardData } from "./auto-dashboard.js";

export function getAutoDashboardData(): AutoDashboardData {
  const ledger = getLedger();
  const totals = ledger ? getProjectTotals(ledger.units) : null;
  // Pending capture count — lazy check, non-fatal
  let pendingCaptureCount = 0;
  try {
    if (s.basePath) {
      pendingCaptureCount = countPendingCaptures(s.basePath);
    }
  } catch {
    // Non-fatal — captures module may not be loaded
  }
  return {
    active: s.active,
    paused: s.paused,
    stepMode: s.stepMode,
    startTime: s.autoStartTime,
    elapsed: s.active || s.paused ? Date.now() - s.autoStartTime : 0,
    currentUnit: s.currentUnit ? { ...s.currentUnit } : null,
    completedUnits: [...s.completedUnits],
    basePath: s.basePath,
    totalCost: totals?.cost ?? 0,
    totalTokens: totals?.tokens.total ?? 0,
    pendingCaptureCount,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isAutoActive(): boolean {
  return s.active;
}

export function isAutoPaused(): boolean {
  return s.paused;
}

/**
 * Return the model captured at auto-mode start for this session.
 * Used by error-recovery to fall back to the session's own model
 * instead of reading (potentially stale) preferences from disk (#1065).
 */
export function getAutoModeStartModel(): {
  provider: string;
  id: string;
} | null {
  return s.autoModeStartModel;
}

// Tool tracking — delegates to auto-tool-tracking.ts
export function markToolStart(toolCallId: string): void {
  _markToolStart(toolCallId, s.active);
}

export function markToolEnd(toolCallId: string): void {
  _markToolEnd(toolCallId);
}

export function getOldestInFlightToolAgeMs(): number {
  return _getOldestInFlightToolAgeMs();
}

/**
 * Return the base path to use for the auto.lock file.
 * Always uses the original project root (not the worktree) so that
 * a second terminal can discover and stop a running auto-mode session.
 *
 * Delegates to AutoSession.lockBasePath — the single source of truth.
 */
function lockBase(): string {
  return s.lockBasePath;
}

/**
 * Attempt to stop a running auto-mode session from a different process.
 * Reads the lock file at the project root, checks if the PID is alive,
 * and sends SIGTERM to gracefully stop it.
 *
 * Returns true if a remote session was found and signaled, false otherwise.
 */
export function stopAutoRemote(projectRoot: string): {
  found: boolean;
  pid?: number;
  error?: string;
} {
  const lock = readCrashLock(projectRoot);
  if (!lock) return { found: false };

  if (!isLockProcessAlive(lock)) {
    // Stale lock — clean it up
    clearLock(projectRoot);
    return { found: false };
  }

  // Send SIGTERM — the auto-mode process has a handler that clears the lock and exits
  try {
    process.kill(lock.pid, "SIGTERM");
    return { found: true, pid: lock.pid };
  } catch (err) {
    return { found: false, error: (err as Error).message };
  }
}

/**
 * Check if a remote auto-mode session is running (from a different process).
 * Reads the crash lock, checks PID liveness, and returns session details.
 * Used by the guard in commands.ts to prevent bare /gsd, /gsd next, and
 * /gsd auto from stealing the session lock.
 */
export function checkRemoteAutoSession(projectRoot: string): {
  running: boolean;
  pid?: number;
  unitType?: string;
  unitId?: string;
  startedAt?: string;
  completedUnits?: number;
} {
  const lock = readCrashLock(projectRoot);
  if (!lock) return { running: false };

  if (!isLockProcessAlive(lock)) {
    // Stale lock from a dead process — not a live remote session
    return { running: false };
  }

  return {
    running: true,
    pid: lock.pid,
    unitType: lock.unitType,
    unitId: lock.unitId,
    startedAt: lock.startedAt,
    completedUnits: lock.completedUnits,
  };
}

export function isStepMode(): boolean {
  return s.stepMode;
}

function clearUnitTimeout(): void {
  if (s.unitTimeoutHandle) {
    clearTimeout(s.unitTimeoutHandle);
    s.unitTimeoutHandle = null;
  }
  if (s.wrapupWarningHandle) {
    clearTimeout(s.wrapupWarningHandle);
    s.wrapupWarningHandle = null;
  }
  if (s.idleWatchdogHandle) {
    clearInterval(s.idleWatchdogHandle);
    s.idleWatchdogHandle = null;
  }
  if (s.continueHereHandle) {
    clearInterval(s.continueHereHandle);
    s.continueHereHandle = null;
  }
  clearInFlightTools();
}

/** Build snapshot metric opts, enriching with continueHereFired from the runtime record. */
function buildSnapshotOpts(
  unitType: string,
  unitId: string,
): {
  continueHereFired?: boolean;
  promptCharCount?: number;
  baselineCharCount?: number;
} & Record<string, unknown> {
  const runtime = s.currentUnit
    ? readUnitRuntimeRecord(s.basePath, unitType, unitId)
    : null;
  return {
    promptCharCount: s.lastPromptCharCount,
    baselineCharCount: s.lastBaselineCharCount,
    ...(s.currentUnitRouting ?? {}),
    ...(runtime?.continueHereFired ? { continueHereFired: true } : {}),
  };
}

function handleLostSessionLock(
  ctx?: ExtensionContext,
  lockStatus?: SessionLockStatus,
): void {
  debugLog("session-lock-lost", {
    lockBase: lockBase(),
    reason: lockStatus?.failureReason,
    existingPid: lockStatus?.existingPid,
    expectedPid: lockStatus?.expectedPid,
  });
  s.active = false;
  s.paused = false;
  clearUnitTimeout();
  deregisterSigtermHandler();
  clearCmuxSidebar(loadEffectiveGSDPreferences()?.preferences);
  const message =
    lockStatus?.failureReason === "pid-mismatch"
      ? lockStatus.existingPid
        ? `Session lock moved to PID ${lockStatus.existingPid} — another GSD process appears to have taken over. Stopping gracefully.`
        : "Session lock moved to a different process — another GSD process appears to have taken over. Stopping gracefully."
      : lockStatus?.failureReason === "missing-metadata"
        ? "Session lock metadata disappeared, so ownership could not be confirmed. Stopping gracefully."
        : lockStatus?.failureReason === "compromised"
          ? "Session lock was compromised or invalidated during heartbeat checks; takeover was not confirmed. Stopping gracefully."
          : "Session lock lost. Stopping gracefully.";
  ctx?.ui.notify(
    message,
    "error",
  );
  ctx?.ui.setStatus("gsd-auto", undefined);
  ctx?.ui.setWidget("gsd-progress", undefined);
  ctx?.ui.setFooter(undefined);
}

export async function stopAuto(
  ctx?: ExtensionContext,
  pi?: ExtensionAPI,
  reason?: string,
): Promise<void> {
  if (!s.active && !s.paused) return;
  const loadedPreferences = loadEffectiveGSDPreferences()?.preferences;
  const reasonSuffix = reason ? ` — ${reason}` : "";
  clearUnitTimeout();
  if (lockBase()) clearLock(lockBase());
  if (lockBase()) releaseSessionLock(lockBase());
  clearSkillSnapshot();
  resetSkillTelemetry();

  // Remove SIGTERM handler registered at auto-mode start
  deregisterSigtermHandler();

  // ── Auto-worktree: exit worktree and reset s.basePath on stop ──
  if (s.currentMilestoneId) {
    const notifyCtx = ctx
      ? { notify: ctx.ui.notify.bind(ctx.ui) }
      : { notify: () => {} };
    buildResolver().exitMilestone(s.currentMilestoneId, notifyCtx, {
      preserveBranch: true,
    });
  }

  // ── DB cleanup: close the SQLite connection ──
  if (isDbAvailable()) {
    try {
      const { closeDatabase } = await import("./gsd-db.js");
      closeDatabase();
    } catch (e) {
      debugLog("db-close-failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (s.originalBasePath) {
    s.basePath = s.originalBasePath;
    try {
      process.chdir(s.basePath);
    } catch {
      /* best-effort */
    }
  }

  const ledger = getLedger();
  if (ledger && ledger.units.length > 0) {
    const totals = getProjectTotals(ledger.units);
    ctx?.ui.notify(
      `Auto-mode stopped${reasonSuffix}. Session: ${formatCost(totals.cost)} · ${formatTokenCount(totals.tokens.total)} tokens · ${ledger.units.length} units`,
      "info",
    );
  } else {
    ctx?.ui.notify(`Auto-mode stopped${reasonSuffix}.`, "info");
  }

  if (s.basePath) {
    try {
      await rebuildState(s.basePath);
    } catch (e) {
      debugLog("stop-rebuild-state-failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  clearCmuxSidebar(loadedPreferences);
  logCmuxEvent(
    loadedPreferences,
    `Auto-mode stopped${reasonSuffix || ""}.`,
    reason?.startsWith("Blocked:") ? "warning" : "info",
  );

  if (isDebugEnabled()) {
    const logPath = writeDebugSummary();
    if (logPath) {
      ctx?.ui.notify(`Debug log written → ${logPath}`, "info");
    }
  }

  resetMetrics();
  resetRoutingHistory();
  resetHookState();
  if (s.basePath) clearPersistedHookState(s.basePath);

  // Remove paused-session metadata if present (#1383)
  try {
    const pausedPath = join(gsdRoot(s.originalBasePath || s.basePath), "runtime", "paused-session.json");
    if (existsSync(pausedPath)) unlinkSync(pausedPath);
  } catch { /* non-fatal */ }

  s.active = false;
  s.paused = false;
  s.stepMode = false;
  s.unitDispatchCount.clear();
  s.unitRecoveryCount.clear();
  clearInFlightTools();
  s.lastBudgetAlertLevel = 0;
  s.lastStateRebuildAt = 0;
  s.unitLifetimeDispatches.clear();
  s.currentUnit = null;
  s.autoModeStartModel = null;
  s.currentMilestoneId = null;
  s.originalBasePath = "";
  s.completedUnits = [];
  s.pendingQuickTasks = [];
  clearSliceProgressCache();
  clearActivityLogState();
  resetProactiveHealing();
  s.pendingCrashRecovery = null;
  s.pendingVerificationRetry = null;
  s.verificationRetryCount.clear();
  s.pausedSessionFile = null;
  ctx?.ui.setStatus("gsd-auto", undefined);
  ctx?.ui.setWidget("gsd-progress", undefined);
  ctx?.ui.setFooter(undefined);

  if (pi && ctx && s.originalModelId && s.originalModelProvider) {
    const original = ctx.modelRegistry.find(
      s.originalModelProvider,
      s.originalModelId,
    );
    if (original) await pi.setModel(original);
    s.originalModelId = null;
    s.originalModelProvider = null;
  }

  s.cmdCtx = null;
}

/**
 * Pause auto-mode without destroying state. Context is preserved.
 * The user can interact with the agent, then `/gsd auto` resumes
 * from disk state. Called when the user presses Escape during auto-mode.
 */
export async function pauseAuto(
  ctx?: ExtensionContext,
  _pi?: ExtensionAPI,
): Promise<void> {
  if (!s.active) return;
  clearUnitTimeout();

  s.pausedSessionFile = ctx?.sessionManager?.getSessionFile() ?? null;

  // Persist paused-session metadata so resume survives /exit (#1383).
  // The fresh-start bootstrap checks for this file and restores worktree context.
  try {
    const pausedMeta = {
      milestoneId: s.currentMilestoneId,
      worktreePath: isInAutoWorktree(s.basePath) ? s.basePath : null,
      originalBasePath: s.originalBasePath,
      stepMode: s.stepMode,
      pausedAt: new Date().toISOString(),
      sessionFile: s.pausedSessionFile,
    };
    const runtimeDir = join(gsdRoot(s.originalBasePath || s.basePath), "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(
      join(runtimeDir, "paused-session.json"),
      JSON.stringify(pausedMeta, null, 2),
      "utf-8",
    );
  } catch {
    // Non-fatal — resume will still work via full bootstrap, just without worktree context
  }

  if (lockBase()) {
    releaseSessionLock(lockBase());
    clearLock(lockBase());
  }

  deregisterSigtermHandler();

  s.active = false;
  s.paused = true;
  s.pendingVerificationRetry = null;
  s.verificationRetryCount.clear();
  ctx?.ui.setStatus("gsd-auto", "paused");
  ctx?.ui.setWidget("gsd-progress", undefined);
  ctx?.ui.setFooter(undefined);
  const resumeCmd = s.stepMode ? "/gsd next" : "/gsd auto";
  ctx?.ui.notify(
    `${s.stepMode ? "Step" : "Auto"}-mode paused (Escape). Type to interact, or ${resumeCmd} to resume.`,
    "info",
  );
}

/**
 * Build a WorktreeResolverDeps from auto.ts private scope.
 * Shared by buildResolver() and buildLoopDeps().
 */
function buildResolverDeps(): WorktreeResolverDeps {
  return {
    isInAutoWorktree,
    shouldUseWorktreeIsolation,
    getIsolationMode,
    mergeMilestoneToMain,
    syncWorktreeStateBack,
    teardownAutoWorktree,
    createAutoWorktree,
    enterAutoWorktree,
    getAutoWorktreePath,
    autoCommitCurrentBranch,
    getCurrentBranch,
    autoWorktreeBranch,
    resolveMilestoneFile,
    readFileSync: (path: string, encoding: string) =>
      readFileSync(path, encoding as BufferEncoding),
    GitServiceImpl:
      GitServiceImpl as unknown as WorktreeResolverDeps["GitServiceImpl"],
    loadEffectiveGSDPreferences:
      loadEffectiveGSDPreferences as unknown as WorktreeResolverDeps["loadEffectiveGSDPreferences"],
    invalidateAllCaches,
    captureIntegrationBranch,
  };
}

/**
 * Build a WorktreeResolver wrapping the current session.
 * Cheap to construct — it's just a thin wrapper over `s` + deps.
 * Used by stopAuto(), resume path, and buildLoopDeps().
 */
function buildResolver(): WorktreeResolver {
  return new WorktreeResolver(s, buildResolverDeps());
}

/**
 * Build the LoopDeps object from auto.ts private scope.
 * This bundles all private functions that autoLoop needs without exporting them.
 */
function buildLoopDeps(): LoopDeps {
  return {
    lockBase,
    buildSnapshotOpts,
    stopAuto,
    pauseAuto,
    clearUnitTimeout,
    updateProgressWidget,
    syncCmuxSidebar,
    logCmuxEvent,

    // State and cache
    invalidateAllCaches,
    deriveState,
    loadEffectiveGSDPreferences,

    // Pre-dispatch health gate
    preDispatchHealthGate,

    // Worktree sync
    syncProjectRootToWorktree,

    // Resource version guard
    checkResourcesStale,

    // Session lock
    validateSessionLock: getSessionLockStatus,
    updateSessionLock,
    handleLostSessionLock,

    // Milestone transition
    sendDesktopNotification,
    setActiveMilestoneId,
    pruneQueueOrder,
    isInAutoWorktree,
    shouldUseWorktreeIsolation,
    mergeMilestoneToMain,
    teardownAutoWorktree,
    createAutoWorktree,
    captureIntegrationBranch,
    getIsolationMode,
    getCurrentBranch,
    autoWorktreeBranch,
    resolveMilestoneFile,
    reconcileMergeState,

    // Budget/context/secrets
    getLedger,
    getProjectTotals,
    formatCost,
    getBudgetAlertLevel,
    getNewBudgetAlertLevel,
    getBudgetEnforcementAction,
    getManifestStatus,
    collectSecretsFromManifest,

    // Dispatch
    resolveDispatch,
    runPreDispatchHooks,
    getPriorSliceCompletionBlocker,
    getMainBranch,
    collectObservabilityWarnings: _collectObservabilityWarnings,
    buildObservabilityRepairBlock,

    // Unit closeout + runtime records
    closeoutUnit,
    verifyExpectedArtifact,
    clearUnitRuntimeRecord,
    writeUnitRuntimeRecord,
    recordOutcome,
    writeLock,
    captureAvailableSkills,
    ensurePreconditions,
    updateSliceProgressCache,

    // Model selection + supervision
    selectAndApplyModel,
    startUnitSupervision,

    // Prompt helpers
    getDeepDiagnostic,
    isDbAvailable,
    reorderForCaching,

    // Filesystem
    existsSync,
    readFileSync: (path: string, encoding: string) =>
      readFileSync(path, encoding as BufferEncoding),
    atomicWriteSync,

    // Git
    GitServiceImpl: GitServiceImpl as unknown as LoopDeps["GitServiceImpl"],

    // WorktreeResolver
    resolver: buildResolver(),

    // Post-unit processing
    postUnitPreVerification,
    runPostUnitVerification,
    postUnitPostVerification,

    // Session manager
    getSessionFile: (ctx: ExtensionContext) => {
      try {
        return ctx.sessionManager?.getSessionFile() ?? "";
      } catch {
        return "";
      }
    },
  } as unknown as LoopDeps;
}

export async function startAuto(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  base: string,
  verboseMode: boolean,
  options?: { step?: boolean },
): Promise<void> {
  const requestedStepMode = options?.step ?? false;

  // Escape stale worktree cwd from a previous milestone (#608).
  base = escapeStaleWorktree(base);

  // If resuming from paused state, just re-activate and dispatch next unit.
  // Check persisted paused-session first (#1383) — survives /exit.
  if (!s.paused) {
    try {
      const pausedPath = join(gsdRoot(base), "runtime", "paused-session.json");
      if (existsSync(pausedPath)) {
        const meta = JSON.parse(readFileSync(pausedPath, "utf-8"));
        if (meta.milestoneId) {
          s.currentMilestoneId = meta.milestoneId;
          s.originalBasePath = meta.originalBasePath || base;
          s.stepMode = meta.stepMode ?? requestedStepMode;
          s.paused = true;
          // Clean up the persisted file — we're consuming it
          try { unlinkSync(pausedPath); } catch { /* non-fatal */ }
          ctx.ui.notify(
            `Resuming paused session for ${meta.milestoneId}${meta.worktreePath ? ` (worktree)` : ""}.`,
            "info",
          );
        }
      }
    } catch {
      // Malformed or missing — proceed with fresh bootstrap
    }
  }

  if (s.paused) {
    const resumeLock = acquireSessionLock(base);
    if (!resumeLock.acquired) {
      ctx.ui.notify(`Cannot resume: ${resumeLock.reason}`, "error");
      return;
    }

    s.paused = false;
    s.active = true;
    s.verbose = verboseMode;
    s.stepMode = requestedStepMode;
    s.cmdCtx = ctx;
    s.basePath = base;
    s.unitDispatchCount.clear();
    s.unitLifetimeDispatches.clear();
    if (!getLedger()) initMetrics(base);
    if (s.currentMilestoneId) setActiveMilestoneId(base, s.currentMilestoneId);

    // ── Auto-worktree: re-enter worktree on resume ──
    if (
      s.currentMilestoneId &&
      shouldUseWorktreeIsolation() &&
      s.originalBasePath &&
      !isInAutoWorktree(s.basePath) &&
      !detectWorktreeName(s.basePath) &&
      !detectWorktreeName(s.originalBasePath)
    ) {
      buildResolver().enterMilestone(s.currentMilestoneId, {
        notify: ctx.ui.notify.bind(ctx.ui),
      });
    }

    registerSigtermHandler(lockBase());

    ctx.ui.setStatus("gsd-auto", s.stepMode ? "next" : "auto");
    ctx.ui.setFooter(hideFooter);
    ctx.ui.notify(
      s.stepMode ? "Step-mode resumed." : "Auto-mode resumed.",
      "info",
    );
    restoreHookState(s.basePath);
    try {
      await rebuildState(s.basePath);
      syncCmuxSidebar(loadEffectiveGSDPreferences()?.preferences, await deriveState(s.basePath));
    } catch (e) {
      debugLog("resume-rebuild-state-failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    try {
      const report = await runGSDDoctor(s.basePath, { fix: true });
      if (report.fixesApplied.length > 0) {
        ctx.ui.notify(
          `Resume: applied ${report.fixesApplied.length} fix(es) to state.`,
          "info",
        );
      }
    } catch (e) {
      debugLog("resume-doctor-failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    invalidateAllCaches();

    if (s.pausedSessionFile) {
      const activityDir = join(gsdRoot(s.basePath), "activity");
      const recovery = synthesizeCrashRecovery(
        s.basePath,
        s.currentUnit?.type ?? "unknown",
        s.currentUnit?.id ?? "unknown",
        s.pausedSessionFile ?? undefined,
        activityDir,
      );
      if (recovery && recovery.trace.toolCallCount > 0) {
        s.pendingCrashRecovery = recovery.prompt;
        ctx.ui.notify(
          `Recovered ${recovery.trace.toolCallCount} tool calls from paused session. Resuming with context.`,
          "info",
        );
      }
      s.pausedSessionFile = null;
    }

    updateSessionLock(
      lockBase(),
      "resuming",
      s.currentMilestoneId ?? "unknown",
      s.completedUnits.length,
    );
    writeLock(
      lockBase(),
      "resuming",
      s.currentMilestoneId ?? "unknown",
      s.completedUnits.length,
    );
    logCmuxEvent(loadEffectiveGSDPreferences()?.preferences, s.stepMode ? "Step-mode resumed." : "Auto-mode resumed.", "progress");

    await autoLoop(ctx, pi, s, buildLoopDeps());
    return;
  }

  // ── Fresh start path — delegated to auto-start.ts ──
  const bootstrapDeps: BootstrapDeps = {
    shouldUseWorktreeIsolation,
    registerSigtermHandler,
    lockBase,
    buildResolver,
  };

  const ready = await bootstrapAutoSession(
    s,
    ctx,
    pi,
    base,
    verboseMode,
    requestedStepMode,
    bootstrapDeps,
  );
  if (!ready) return;

  try {
    syncCmuxSidebar(loadEffectiveGSDPreferences()?.preferences, await deriveState(s.basePath));
  } catch {
    // Best-effort only — sidebar sync must never block auto-mode startup
  }
  logCmuxEvent(loadEffectiveGSDPreferences()?.preferences, requestedStepMode ? "Step-mode started." : "Auto-mode started.", "progress");

  // Dispatch the first unit
  await autoLoop(ctx, pi, s, buildLoopDeps());
}

// ─── Agent End Handler ────────────────────────────────────────────────────────

/**
 * Deprecated thin wrapper — kept as export for backward compatibility.
 * The actual agent_end processing now happens via resolveAgentEnd() in auto-loop.ts,
 * which is called directly from index.ts. The autoLoop() while loop handles all
 * post-unit processing (verification, hooks, dispatch) that this function used to do.
 *
 * If called by straggler code, it simply resolves the pending promise so the loop
 * can continue.
 */
export async function handleAgentEnd(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!s.active || !s.cmdCtx) return;
  clearUnitTimeout();
  resolveAgentEnd({ messages: [] });
}
// describeNextUnit is imported from auto-dashboard.ts and re-exported
export { describeNextUnit } from "./auto-dashboard.js";

/** Thin wrapper: delegates to auto-dashboard.ts, passing state accessors. */
function updateProgressWidget(
  ctx: ExtensionContext,
  unitType: string,
  unitId: string,
  state: GSDState,
): void {
  const badge = s.currentUnitRouting?.tier
    ? ({ light: "L", standard: "S", heavy: "H" }[s.currentUnitRouting.tier] ??
      undefined)
    : undefined;
  _updateProgressWidget(
    ctx,
    unitType,
    unitId,
    state,
    widgetStateAccessors,
    badge,
  );
}

/** State accessors for the widget — closures over module globals. */
const widgetStateAccessors: WidgetStateAccessors = {
  getAutoStartTime: () => s.autoStartTime,
  isStepMode: () => s.stepMode,
  getCmdCtx: () => s.cmdCtx,
  getBasePath: () => s.basePath,
  isVerbose: () => s.verbose,
};

// ─── Core Loop ────────────────────────────────────────────────────────────────

/** Tracks recursive skip depth to prevent TUI freeze on cascading completed-unit skips */
let _skipDepth = 0;
const MAX_SKIP_DEPTH = 20;

/** Reentrancy guard for dispatchNextUnit itself (not just handleAgentEnd).
 *  Prevents concurrent dispatch from watchdog timers, step wizard, and direct calls
 *  that bypass the _handlingAgentEnd guard. Recursive calls (from skip paths) are
 *  allowed via _skipDepth > 0. */
let _dispatching = false;

async function dispatchNextUnit(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!active || !cmdCtx) {
    debugLog(`dispatchNextUnit early return — active=${active}, cmdCtx=${!!cmdCtx}`);
    if (active && !cmdCtx) {
      ctx.ui.notify("Auto-mode session expired. Run /gsd auto to restart.", "info");
    }
    return;
  }

  // Reentrancy guard: allow recursive calls from skip paths (_skipDepth > 0)
  // but block concurrent external calls (watchdog, step wizard, etc.)
  if (_dispatching && _skipDepth === 0) {
    debugLog("dispatchNextUnit reentrancy guard — another dispatch in progress, bailing");
    return; // Another dispatch is in progress — bail silently
  }
  _dispatching = true;
  try {
  // Recursion depth guard: when many units are skipped in sequence (e.g., after
  // crash recovery with 10+ completed units), recursive dispatchNextUnit calls
  // can freeze the TUI or overflow the stack. Yield generously after MAX_SKIP_DEPTH.
  if (_skipDepth > MAX_SKIP_DEPTH) {
    _skipDepth = 0;
    ctx.ui.notify(`Skipped ${MAX_SKIP_DEPTH}+ completed units. Yielding to UI before continuing.`, "info");
    await new Promise(r => setTimeout(r, 200));
  }

  // Resource version guard: detect mid-session resource updates.
  // Templates are read from disk on each dispatch but extension code is loaded
  // once at startup. If resources were re-synced (e.g. /gsd:update, npm update,
  // or dev copy-resources), templates may expect variables the in-memory code
  // doesn't provide. Stop gracefully instead of crashing.
  const staleMsg = checkResourcesStale();
  if (staleMsg) {
    await stopAuto(ctx, pi, staleMsg);
    return;
  }

  // Clear all caches so deriveState sees fresh disk state (#431).
  // Parse cache is also cleared — doctor may have re-populated it with
  // stale data between handleAgentEnd and this dispatch call (Path B fix).
  invalidateAllCaches();
  lastPromptCharCount = undefined;
  lastBaselineCharCount = undefined;

  // ── Pre-dispatch health gate ──────────────────────────────────────────
  // Lightweight check for critical issues that would cause the next unit
  // to fail or corrupt state. Auto-heals what it can, blocks on the rest.
  try {
    const healthGate = await preDispatchHealthGate(basePath);
    if (healthGate.fixesApplied.length > 0) {
      ctx.ui.notify(`Pre-dispatch: ${healthGate.fixesApplied.join(", ")}`, "info");
    }
    if (!healthGate.proceed) {
      ctx.ui.notify(healthGate.reason ?? "Pre-dispatch health check failed.", "error");
      await pauseAuto(ctx, pi);
      return;
    }
  } catch {
    // Non-fatal — health gate failure should never block dispatch
  }

  // ── Sync project root artifacts into worktree (#853) ─────────────────
  // When the LLM writes artifacts to the main repo filesystem instead of
  // the worktree, the worktree's gsd.db becomes stale. Sync before
  // deriveState to ensure the worktree has the latest artifacts.
  if (originalBasePath && basePath !== originalBasePath && currentMilestoneId) {
    syncProjectRootToWorktree(originalBasePath, basePath, currentMilestoneId);
  }

  const stopDeriveTimer = debugTime("derive-state");
  let state = await deriveState(basePath);
  stopDeriveTimer({
    phase: state.phase,
    milestone: state.activeMilestone?.id,
    slice: state.activeSlice?.id,
    task: state.activeTask?.id,
  });
  let mid = state.activeMilestone?.id;
  let midTitle = state.activeMilestone?.title;

  // Detect milestone transition
  if (mid && currentMilestoneId && mid !== currentMilestoneId) {
    ctx.ui.notify(
      `Milestone ${currentMilestoneId} complete. Advancing to ${mid}: ${midTitle}.`,
      "info",
    );
    sendDesktopNotification("GSD", `Milestone ${currentMilestoneId} complete!`, "success", "milestone");
    // Hint: visualizer available after milestone transition
    const vizPrefs = loadEffectiveGSDPreferences()?.preferences;
    if (vizPrefs?.auto_visualize) {
      ctx.ui.notify("Run /gsd visualize to see progress overview.", "info");
    }
    // Reset stuck detection for new milestone
    unitDispatchCount.clear();
    unitRecoveryCount.clear();
  unitConsecutiveSkips.clear();
    unitLifetimeDispatches.clear();
    // Clear completed-units.json for the finished milestone
    try {
      const file = completedKeysPath(basePath);
      if (existsSync(file)) writeFileSync(file, JSON.stringify([]), "utf-8");
      completedKeySet.clear();
    } catch { /* non-fatal */ }

    // ── Worktree lifecycle on milestone transition (#616) ──────────────
    // When transitioning from M_old to M_new inside a worktree, we must:
    // 1. Merge the completed milestone's worktree back to main
    // 2. Re-derive state from the project root
    // 3. Create a new worktree for the incoming milestone
    // Without this, M_new runs inside M_old's worktree on the wrong branch,
    // and artifact paths resolve against the wrong .gsd/ directory.
    if (isInAutoWorktree(basePath) && originalBasePath && shouldUseWorktreeIsolation()) {
      try {
        const roadmapPath = resolveMilestoneFile(originalBasePath, currentMilestoneId, "ROADMAP");
        if (roadmapPath) {
          const roadmapContent = readFileSync(roadmapPath, "utf-8");
          const mergeResult = mergeMilestoneToMain(originalBasePath, currentMilestoneId, roadmapContent);
          ctx.ui.notify(
            `Milestone ${currentMilestoneId} merged to main.${mergeResult.pushed ? " Pushed to remote." : ""}`,
            "info",
          );
        } else {
          // No roadmap found — teardown worktree without merge
          teardownAutoWorktree(originalBasePath, currentMilestoneId);
          ctx.ui.notify(`Exited worktree for ${currentMilestoneId} (no roadmap for merge).`, "info");
        }
      } catch (err) {
        ctx.ui.notify(
          `Milestone merge failed during transition: ${err instanceof Error ? err.message : String(err)}`,
          "warning",
        );
        // Force cwd back to project root even if merge failed
        if (originalBasePath) {
          try { process.chdir(originalBasePath); } catch { /* best-effort */ }
        }
      }

      // Update basePath to project root (mergeMilestoneToMain already chdir'd)
      basePath = originalBasePath;
      gitService = new GitServiceImpl(basePath, loadEffectiveGSDPreferences()?.preferences?.git ?? {});
      invalidateAllCaches();

      // Re-derive state from project root before creating new worktree
      state = await deriveState(basePath);
      mid = state.activeMilestone?.id;
      midTitle = state.activeMilestone?.title;

      // Create new worktree for the incoming milestone
      if (mid) {
        captureIntegrationBranch(basePath, mid, { commitDocs: loadEffectiveGSDPreferences()?.preferences?.git?.commit_docs });
        try {
          const wtPath = createAutoWorktree(basePath, mid);
          basePath = wtPath;
          gitService = new GitServiceImpl(basePath, loadEffectiveGSDPreferences()?.preferences?.git ?? {});
          ctx.ui.notify(`Created auto-worktree for ${mid} at ${wtPath}`, "info");
        } catch (err) {
          ctx.ui.notify(
            `Auto-worktree creation for ${mid} failed: ${err instanceof Error ? err.message : String(err)}. Continuing in project root.`,
            "warning",
          );
        }
      }
    } else {
      // Not in worktree — capture integration branch for the new milestone (branch mode only).
      // In none mode there's no milestone branch to merge back to, so skip.
      if (getIsolationMode() !== "none") {
        captureIntegrationBranch(originalBasePath || basePath, mid, { commitDocs: loadEffectiveGSDPreferences()?.preferences?.git?.commit_docs });
      }
    }

    // Prune completed milestone from queue order file
    const pendingIds = state.registry
      .filter(m => m.status !== "complete")
      .map(m => m.id);
    pruneQueueOrder(basePath, pendingIds);
  }
  if (mid) {
    currentMilestoneId = mid;
    setActiveMilestoneId(basePath, mid);
  }

  if (!mid) {
    // Save final session before stopping
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    }

    const incomplete = state.registry.filter(m => m.status !== "complete");
    if (incomplete.length === 0) {
      // Genuinely all complete
      sendDesktopNotification("GSD", "All milestones complete!", "success", "milestone");
      await stopAuto(ctx, pi, "All milestones complete");
    } else if (state.phase === "blocked") {
      // Milestones exist but are dependency-blocked
      const blockerMsg = `Blocked: ${state.blockers.join(", ")}`;
      await stopAuto(ctx, pi, blockerMsg);
      ctx.ui.notify(`${blockerMsg}. Fix and run /gsd auto.`, "warning");
      sendDesktopNotification("GSD", blockerMsg, "error", "attention");
    } else {
      // Milestones with remaining work exist but none became active — unexpected
      const ids = incomplete.map(m => m.id).join(", ");
      const diag = `basePath=${basePath}, milestones=[${state.registry.map(m => `${m.id}:${m.status}`).join(", ")}], phase=${state.phase}`;
      ctx.ui.notify(`Unexpected: ${incomplete.length} incomplete milestone(s) (${ids}) but no active milestone.\n   Diagnostic: ${diag}`, "error");
      await stopAuto(ctx, pi, `No active milestone — ${incomplete.length} incomplete (${ids}), see diagnostic above`);
    }
    return;
  }

  // Guard: mid/midTitle must be defined strings from this point onward.
  // The !mid check above returns early if mid is falsy; midTitle comes from
  // the same object so it should always be present when mid is.
  if (!midTitle) {
    midTitle = mid; // Defensive fallback: use milestone ID as title
    ctx.ui.notify(`Milestone ${mid} has no title in roadmap — using ID as fallback.`, "warning");
  }

  // ── Mid-merge safety check: detect leftover merge state from a prior session ──
  if (reconcileMergeState(basePath, ctx)) {
    invalidateAllCaches();
    state = await deriveState(basePath);
    mid = state.activeMilestone?.id;
    midTitle = state.activeMilestone?.title;
  }

  // After merge guard removal (branchless architecture), mid/midTitle could be undefined
  if (!mid || !midTitle) {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    }
    const noMilestoneReason = !mid
      ? "No active milestone after merge reconciliation"
      : `Milestone ${mid} has no title after reconciliation`;
    await stopAuto(ctx, pi, noMilestoneReason);
    return;
  }

  // Determine next unit
  let unitType: string;
  let unitId: string;
  let prompt: string;

  if (state.phase === "complete") {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    }
    // Clear completed-units.json for the finished milestone so it doesn't grow unbounded.
    try {
      const file = completedKeysPath(basePath);
      if (existsSync(file)) writeFileSync(file, JSON.stringify([]), "utf-8");
      completedKeySet.clear();
    } catch { /* non-fatal */ }
    // ── Milestone merge: squash-merge milestone branch to main before stopping ──
    if (currentMilestoneId && isInAutoWorktree(basePath) && originalBasePath) {
      try {
        const roadmapPath = resolveMilestoneFile(originalBasePath, currentMilestoneId, "ROADMAP");
        if (!roadmapPath) throw new Error(`Cannot resolve ROADMAP file for milestone ${currentMilestoneId}`);
        const roadmapContent = readFileSync(roadmapPath, "utf-8");
        const mergeResult = mergeMilestoneToMain(originalBasePath, currentMilestoneId, roadmapContent);
        basePath = originalBasePath;
        gitService = new GitServiceImpl(basePath, loadEffectiveGSDPreferences()?.preferences?.git ?? {});
        ctx.ui.notify(
          `Milestone ${currentMilestoneId} merged to main.${mergeResult.pushed ? " Pushed to remote." : ""}`,
          "info",
        );
      } catch (err) {
        ctx.ui.notify(
          `Milestone merge failed: ${err instanceof Error ? err.message : String(err)}`,
          "warning",
        );
        // Ensure cwd is restored even if merge failed partway through (#608).
        // mergeMilestoneToMain may have chdir'd but then thrown, leaving us
        // in an indeterminate location.
        if (originalBasePath) {
          basePath = originalBasePath;
          try { process.chdir(basePath); } catch { /* best-effort */ }
        }
      }
    } else if (currentMilestoneId && getIsolationMode() === "branch") {
      // Branch isolation mode (#603): only run this path when isolation is
      // explicitly branch. In worktree mode, a transient worktree-context
      // detection failure must not fall through here, or we can attempt to
      // check out the integration branch even though it's already attached to
      // the project-root worktree.
      // Squash-merge back to the integration branch (or main) before stopping.
      try {
        const currentBranch = getCurrentBranch(basePath);
        const milestoneBranch = autoWorktreeBranch(currentMilestoneId);
        if (currentBranch === milestoneBranch) {
          const roadmapPath = resolveMilestoneFile(basePath, currentMilestoneId, "ROADMAP");
          if (roadmapPath) {
            const roadmapContent = readFileSync(roadmapPath, "utf-8");
            // mergeMilestoneToMain handles: auto-commit, checkout integration branch,
            // squash merge, commit, optional push, branch deletion.
            const mergeResult = mergeMilestoneToMain(basePath, currentMilestoneId, roadmapContent);
            gitService = new GitServiceImpl(basePath, loadEffectiveGSDPreferences()?.preferences?.git ?? {});
            ctx.ui.notify(
              `Milestone ${currentMilestoneId} merged (branch mode).${mergeResult.pushed ? " Pushed to remote." : ""}`,
              "info",
            );
          }
        }
      } catch (err) {
        ctx.ui.notify(
          `Milestone merge failed (branch mode): ${err instanceof Error ? err.message : String(err)}`,
          "warning",
        );
      }
    }
    sendDesktopNotification("GSD", `Milestone ${mid} complete!`, "success", "milestone");
    await stopAuto(ctx, pi, `Milestone ${mid} complete`);
    return;
  }

  if (state.phase === "blocked") {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    }
    const blockerMsg = `Blocked: ${state.blockers.join(", ")}`;
    await stopAuto(ctx, pi, blockerMsg);
    ctx.ui.notify(`${blockerMsg}. Fix and run /gsd auto.`, "warning");
    sendDesktopNotification("GSD", blockerMsg, "error", "attention");
    return;
  }

  // ── UAT Dispatch: run-uat fires after complete-slice merge, before reassessment ──
  // Ensures the UAT file and slice summary are both on main when UAT runs.
  const prefs = loadEffectiveGSDPreferences()?.preferences;

  // Budget ceiling guard — enforce budget with configurable action
  const budgetCeiling = prefs?.budget_ceiling;
  if (budgetCeiling !== undefined && budgetCeiling > 0) {
    const currentLedger = getLedger();
    const totalCost = currentLedger ? getProjectTotals(currentLedger.units).cost : 0;
    const budgetPct = totalCost / budgetCeiling;
    const budgetAlertLevel = getBudgetAlertLevel(budgetPct);
    const newBudgetAlertLevel = getNewBudgetAlertLevel(lastBudgetAlertLevel, budgetPct);
    const enforcement = prefs?.budget_enforcement ?? "pause";

    const budgetEnforcementAction = getBudgetEnforcementAction(enforcement, budgetPct);

    if (newBudgetAlertLevel === 100 && budgetEnforcementAction !== "none") {
      const msg = `Budget ceiling ${formatCost(budgetCeiling)} reached (spent ${formatCost(totalCost)}).`;
      lastBudgetAlertLevel = newBudgetAlertLevel;
      if (budgetEnforcementAction === "halt") {
        sendDesktopNotification("GSD", msg, "error", "budget");
        await stopAuto(ctx, pi, "Budget ceiling reached");
        return;
      }
      if (budgetEnforcementAction === "pause") {
        ctx.ui.notify(`${msg} Pausing auto-mode — /gsd auto to override and continue.`, "warning");
        sendDesktopNotification("GSD", msg, "warning", "budget");
        await pauseAuto(ctx, pi);
        return;
      }
      ctx.ui.notify(`${msg} Continuing (enforcement: warn).`, "warning");
      sendDesktopNotification("GSD", msg, "warning", "budget");
    } else if (newBudgetAlertLevel === 90) {
      lastBudgetAlertLevel = newBudgetAlertLevel;
      ctx.ui.notify(`Budget 90%: ${formatCost(totalCost)} / ${formatCost(budgetCeiling)}`, "warning");
      sendDesktopNotification("GSD", `Budget 90%: ${formatCost(totalCost)} / ${formatCost(budgetCeiling)}`, "warning", "budget");
    } else if (newBudgetAlertLevel === 80) {
      lastBudgetAlertLevel = newBudgetAlertLevel;
      ctx.ui.notify(`Approaching budget ceiling — 80%: ${formatCost(totalCost)} / ${formatCost(budgetCeiling)}`, "warning");
      sendDesktopNotification("GSD", `Approaching budget ceiling — 80%: ${formatCost(totalCost)} / ${formatCost(budgetCeiling)}`, "warning", "budget");
    } else if (newBudgetAlertLevel === 75) {
      lastBudgetAlertLevel = newBudgetAlertLevel;
      ctx.ui.notify(`Budget 75%: ${formatCost(totalCost)} / ${formatCost(budgetCeiling)}`, "info");
      sendDesktopNotification("GSD", `Budget 75%: ${formatCost(totalCost)} / ${formatCost(budgetCeiling)}`, "info", "budget");
    } else if (budgetAlertLevel === 0) {
      lastBudgetAlertLevel = 0;
    }
  } else {
    lastBudgetAlertLevel = 0;
  }

  // Context window guard — pause if approaching context limits
  const contextThreshold = prefs?.context_pause_threshold ?? 0; // 0 = disabled by default
  if (contextThreshold > 0 && cmdCtx) {
    const contextUsage = cmdCtx.getContextUsage();
    if (contextUsage && contextUsage.percent !== null && contextUsage.percent >= contextThreshold) {
      const msg = `Context window at ${contextUsage.percent}% (threshold: ${contextThreshold}%). Pausing to prevent truncated output.`;
      ctx.ui.notify(`${msg} Run /gsd auto to continue (will start fresh session).`, "warning");
      sendDesktopNotification("GSD", `Context ${contextUsage.percent}% — paused`, "warning", "attention");
      await pauseAuto(ctx, pi);
      return;
    }
  }

  // ── Secrets re-check gate — runs before every dispatch, not just at startAuto ──
  // plan-milestone writes the milestone SECRETS file (e.g., M001-SECRETS.md) during its unit. By the time we
  // reach the next dispatchNextUnit call the manifest exists but hasn't been
  // presented to the user yet. Without this re-check the model would proceed
  // into plan-slice / execute-task with no real credentials and mock everything.
  const runSecretsGate = async () => {
    try {
      const manifestStatus = await getManifestStatus(basePath, mid);
      if (manifestStatus && manifestStatus.pending.length > 0) {
        const result = await collectSecretsFromManifest(basePath, mid, ctx);
        if (result && result.applied && result.skipped && result.existingSkipped) {
          ctx.ui.notify(
            `Secrets collected: ${result.applied.length} applied, ${result.skipped.length} skipped, ${result.existingSkipped.length} already set.`,
            "info",
          );
        } else {
          ctx.ui.notify("Secrets collection skipped.", "info");
        }
      }
    } catch (err) {
      ctx.ui.notify(
        `Secrets collection error: ${err instanceof Error ? err.message : String(err)}. Continuing with next task.`,
        "warning",
      );
    }
  };

  await runSecretsGate();

  // ── Dispatch table: resolve phase → unit type + prompt ──
  const dispatchResult = await resolveDispatch({
    basePath, mid, midTitle: midTitle!, state, prefs,
  });

  if (dispatchResult.action === "stop") {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
      saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);
    }
    await stopAuto(ctx, pi, dispatchResult.reason);
    return;
  }

  if (dispatchResult.action !== "dispatch") {
    // skip action — yield and re-dispatch
    await new Promise(r => setImmediate(r));
    await dispatchNextUnit(ctx, pi);
    return;
  }

  unitType = dispatchResult.unitType;
  unitId = dispatchResult.unitId;
  prompt = dispatchResult.prompt;
  let pauseAfterUatDispatch = dispatchResult.pauseAfterDispatch ?? false;

  // ── Pre-dispatch hooks: modify, skip, or replace the unit before dispatch ──
  const preDispatchResult = runPreDispatchHooks(unitType, unitId, prompt, basePath);
  if (preDispatchResult.firedHooks.length > 0) {
    ctx.ui.notify(
      `Pre-dispatch hook${preDispatchResult.firedHooks.length > 1 ? "s" : ""}: ${preDispatchResult.firedHooks.join(", ")}`,
      "info",
    );
  }
  if (preDispatchResult.action === "skip") {
    ctx.ui.notify(`Skipping ${unitType} ${unitId} (pre-dispatch hook).`, "info");
    // Yield then re-dispatch to advance to next unit
    await new Promise(r => setImmediate(r));
    await dispatchNextUnit(ctx, pi);
    return;
  }
  if (preDispatchResult.action === "replace") {
    prompt = preDispatchResult.prompt ?? prompt;
    if (preDispatchResult.unitType) unitType = preDispatchResult.unitType;
  } else if (preDispatchResult.prompt) {
    prompt = preDispatchResult.prompt;
  }

  const priorSliceBlocker = getPriorSliceCompletionBlocker(basePath, getMainBranch(basePath), unitType, unitId);
  if (priorSliceBlocker) {
    await stopAuto(ctx, pi, priorSliceBlocker);
    return;
  }

  const observabilityIssues = await collectObservabilityWarnings(ctx, unitType, unitId);

  // Idempotency: skip units already completed in a prior session.
  const idempotencyKey = `${unitType}/${unitId}`;
  if (completedKeySet.has(idempotencyKey)) {
    // Cross-validate: does the expected artifact actually exist?
    const artifactExists = verifyExpectedArtifact(unitType, unitId, basePath);
    if (artifactExists) {
      // Guard against infinite skip loops: if deriveState keeps returning the
      // same completed unit, consecutive skips will trip this breaker. Evict the
      // key so the next dispatch forces full reconciliation instead of looping.
      const skipCount = (unitConsecutiveSkips.get(idempotencyKey) ?? 0) + 1;
      unitConsecutiveSkips.set(idempotencyKey, skipCount);
      if (skipCount > MAX_CONSECUTIVE_SKIPS) {
        // Cross-check: verify deriveState actually returns this unit (#790).
        // If the unit's milestone is already complete, this is a phantom skip
        // loop from stale crash recovery context — don't evict.
        const skippedMid = unitId.split("/")[0];
        const skippedMilestoneComplete = skippedMid
          ? !!resolveMilestoneFile(basePath, skippedMid, "SUMMARY")
          : false;
        if (skippedMilestoneComplete) {
          // Milestone is complete — evicting this key would fight self-heal.
          // Clear skip counter and re-dispatch from fresh state.
          unitConsecutiveSkips.delete(idempotencyKey);
          invalidateAllCaches();
          ctx.ui.notify(
            `Phantom skip loop cleared: ${unitType} ${unitId} belongs to completed milestone ${skippedMid}. Re-dispatching from fresh state.`,
            "info",
          );
          _skipDepth++;
          await new Promise(r => setTimeout(r, 50));
          await dispatchNextUnit(ctx, pi);
          _skipDepth = Math.max(0, _skipDepth - 1);
          return;
        }
        unitConsecutiveSkips.delete(idempotencyKey);
        completedKeySet.delete(idempotencyKey);
        removePersistedKey(basePath, idempotencyKey);
        invalidateAllCaches();
        ctx.ui.notify(
          `Skip loop detected: ${unitType} ${unitId} skipped ${skipCount} times without advancing. Evicting completion record and forcing reconciliation.`,
          "warning",
        );
        if (!active) return;
        _skipDepth++;
        await new Promise(r => setTimeout(r, 150));
        await dispatchNextUnit(ctx, pi);
        _skipDepth = Math.max(0, _skipDepth - 1);
        return;
      }
      // Count toward lifetime cap so hard-stop fires during skip loops (#792)
      const lifeSkip = (unitLifetimeDispatches.get(idempotencyKey) ?? 0) + 1;
      unitLifetimeDispatches.set(idempotencyKey, lifeSkip);
      if (lifeSkip > MAX_LIFETIME_DISPATCHES) {
        await stopAuto(ctx, pi, `Hard loop: ${unitType} ${unitId} (skip cycle)`);
        ctx.ui.notify(
          `Hard loop detected: ${unitType} ${unitId} hit lifetime cap during skip cycle (${lifeSkip} iterations).`,
          "error",
        );
        return;
      }
      ctx.ui.notify(
        `Skipping ${unitType} ${unitId} — already completed in a prior session. Advancing.`,
        "info",
      );
      if (!active) return;
      _skipDepth++;
      await new Promise(r => setTimeout(r, 150));
      await dispatchNextUnit(ctx, pi);
      _skipDepth = Math.max(0, _skipDepth - 1);
      return;
    } else {
      // Stale completion record — artifact missing. Remove and re-run.
      completedKeySet.delete(idempotencyKey);
      removePersistedKey(basePath, idempotencyKey);
      ctx.ui.notify(
        `Re-running ${unitType} ${unitId} — marked complete but expected artifact missing.`,
        "warning",
      );
    }
  }

  // Fallback: if the idempotency key is missing but the expected artifact already
  // exists on disk, the task completed in a prior session without persisting the key.
  // Persist it now and skip re-dispatch. This prevents infinite loops where a task
  // completes successfully but the completion key was never written (e.g., completed
  // on the first attempt before hitting the retry-threshold persistence logic).
  if (verifyExpectedArtifact(unitType, unitId, basePath)) {
    persistCompletedKey(basePath, idempotencyKey);
    completedKeySet.add(idempotencyKey);
    invalidateAllCaches();
    // Same consecutive-skip guard as the idempotency path above.
    const skipCount2 = (unitConsecutiveSkips.get(idempotencyKey) ?? 0) + 1;
    unitConsecutiveSkips.set(idempotencyKey, skipCount2);
    if (skipCount2 > MAX_CONSECUTIVE_SKIPS) {
      // Cross-check: verify the unit's milestone is still active (#790).
      const skippedMid2 = unitId.split("/")[0];
      const skippedMilestoneComplete2 = skippedMid2
        ? !!resolveMilestoneFile(basePath, skippedMid2, "SUMMARY")
        : false;
      if (skippedMilestoneComplete2) {
        unitConsecutiveSkips.delete(idempotencyKey);
        invalidateAllCaches();
        ctx.ui.notify(
          `Phantom skip loop cleared: ${unitType} ${unitId} belongs to completed milestone ${skippedMid2}. Re-dispatching from fresh state.`,
          "info",
        );
        _skipDepth++;
        await new Promise(r => setTimeout(r, 50));
        await dispatchNextUnit(ctx, pi);
        _skipDepth = Math.max(0, _skipDepth - 1);
        return;
      }
      unitConsecutiveSkips.delete(idempotencyKey);
      completedKeySet.delete(idempotencyKey);
      removePersistedKey(basePath, idempotencyKey);
      invalidateAllCaches();
      ctx.ui.notify(
        `Skip loop detected: ${unitType} ${unitId} skipped ${skipCount2} times without advancing. Evicting completion record and forcing reconciliation.`,
        "warning",
      );
      if (!active) return;
      _skipDepth++;
      await new Promise(r => setTimeout(r, 150));
      await dispatchNextUnit(ctx, pi);
      _skipDepth = Math.max(0, _skipDepth - 1);
      return;
    }
    // Count toward lifetime cap so hard-stop fires during skip loops (#792)
    const lifeSkip2 = (unitLifetimeDispatches.get(idempotencyKey) ?? 0) + 1;
    unitLifetimeDispatches.set(idempotencyKey, lifeSkip2);
    if (lifeSkip2 > MAX_LIFETIME_DISPATCHES) {
      await stopAuto(ctx, pi, `Hard loop: ${unitType} ${unitId} (skip cycle)`);
      ctx.ui.notify(
        `Hard loop detected: ${unitType} ${unitId} hit lifetime cap during skip cycle (${lifeSkip2} iterations).`,
        "error",
      );
      return;
    }
    ctx.ui.notify(
      `Skipping ${unitType} ${unitId} — artifact exists but completion key was missing. Repaired and advancing.`,
      "info",
    );
    if (!active) return;
    _skipDepth++;
    await new Promise(r => setTimeout(r, 150));
    await dispatchNextUnit(ctx, pi);
    _skipDepth = Math.max(0, _skipDepth - 1);
    return;
  }

  // Stuck detection — tracks total dispatches per unit (not just consecutive repeats).
  // Pattern A→B→A→B would reset retryCount every time; this map catches it.
  const dispatchKey = `${unitType}/${unitId}`;
  const prevCount = unitDispatchCount.get(dispatchKey) ?? 0;
  // Real dispatch reached — clear the consecutive-skip counter for this unit.
  unitConsecutiveSkips.delete(dispatchKey);

  debugLog("dispatch-unit", {
    type: unitType,
    id: unitId,
    cycle: prevCount + 1,
    lifetime: (unitLifetimeDispatches.get(dispatchKey) ?? 0) + 1,
  });
  debugCount("dispatches");

  // Hard lifetime cap — survives counter resets from loop-recovery/self-repair.
  // Catches the case where reconciliation "succeeds" (artifacts exist) but
  // deriveState keeps returning the same unit, creating an infinite cycle.
  const lifetimeCount = (unitLifetimeDispatches.get(dispatchKey) ?? 0) + 1;
  unitLifetimeDispatches.set(dispatchKey, lifetimeCount);
  if (lifetimeCount > MAX_LIFETIME_DISPATCHES) {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
    }
    saveActivityLog(ctx, basePath, unitType, unitId);
    const expected = diagnoseExpectedArtifact(unitType, unitId, basePath);
    await stopAuto(ctx, pi, `Hard loop: ${unitType} ${unitId}`);
    ctx.ui.notify(
      `Hard loop detected: ${unitType} ${unitId} dispatched ${lifetimeCount} times total (across reconciliation cycles).${expected ? `\n   Expected artifact: ${expected}` : ""}\n   This may indicate deriveState() keeps returning the same unit despite artifacts existing.\n   Check .gsd/completed-units.json and the slice plan checkbox state.`,
      "error",
    );
    return;
  }
  if (prevCount >= MAX_UNIT_DISPATCHES) {
    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
    }
    saveActivityLog(ctx, basePath, unitType, unitId);

    // Final reconciliation pass for execute-task: write any missing durable
    // artifacts (summary placeholder + [x] checkbox) so the pipeline can
    // advance instead of stopping. This is the last resort before halting.
    if (unitType === "execute-task") {
      const [mid, sid, tid] = unitId.split("/");
      if (mid && sid && tid) {
        const status = await inspectExecuteTaskDurability(basePath, unitId);
        if (status) {
          const reconciled = skipExecuteTask(basePath, mid, sid, tid, status, "loop-recovery", prevCount);
          // reconciled: skipExecuteTask attempted to write missing artifacts.
          // verifyExpectedArtifact: confirms physical artifacts (summary + [x]) now exist on disk.
          // Both must pass before we clear the dispatch counter and advance.
          if (reconciled && verifyExpectedArtifact(unitType, unitId, basePath)) {
            ctx.ui.notify(
              `Loop recovery: ${unitId} reconciled after ${prevCount + 1} dispatches — blocker artifacts written, pipeline advancing.\n   Review ${status.summaryPath} and replace the placeholder with real work.`,
              "warning",
            );
            // Persist completion so idempotency check prevents re-dispatch
            // if deriveState keeps returning this unit (#462).
            const reconciledKey = `${unitType}/${unitId}`;
            persistCompletedKey(basePath, reconciledKey);
            completedKeySet.add(reconciledKey);
            unitDispatchCount.delete(dispatchKey);
            invalidateAllCaches();
            await new Promise(r => setImmediate(r));
            await dispatchNextUnit(ctx, pi);
            return;
          }
        }
      }
    }

    // General reconciliation: if the last attempt DID produce the expected
    // artifact on disk, clear the counter and advance instead of stopping.
    // The execute-task path above handles its special case (writing placeholder
    // summaries). This catch-all covers complete-slice, plan-slice,
    // research-slice, and all other unit types where the Nth attempt at the
    // dispatch limit succeeded but the counter check fires before anyone
    // verifies disk state. Without this, a successful final attempt is
    // indistinguishable from a failed one.
    if (verifyExpectedArtifact(unitType, unitId, basePath)) {
      ctx.ui.notify(
        `Loop recovery: ${unitType} ${unitId} — artifact verified after ${prevCount + 1} dispatches. Advancing.`,
        "info",
      );
      // Persist completion so the idempotency check prevents re-dispatch
      // if deriveState keeps returning this unit (see #462).
      persistCompletedKey(basePath, dispatchKey);
      completedKeySet.add(dispatchKey);
      unitDispatchCount.delete(dispatchKey);
      invalidateAllCaches();
      await new Promise(r => setImmediate(r));
      await dispatchNextUnit(ctx, pi);
      return;
    }

    // Last resort for complete-milestone: generate stub summary to unblock pipeline.
    // All slices are done (otherwise we wouldn't be in completing-milestone phase),
    // but the LLM failed to write the summary N times. A stub lets the pipeline advance.
    if (unitType === "complete-milestone") {
      try {
        const mPath = resolveMilestonePath(basePath, unitId);
        if (mPath) {
          const stubPath = join(mPath, `${unitId}-SUMMARY.md`);
          if (!existsSync(stubPath)) {
            writeFileSync(stubPath, `# ${unitId} Summary\n\nAuto-generated stub — milestone tasks completed but summary generation failed after ${prevCount + 1} attempts.\nReview and replace this stub with a proper summary.\n`);
            ctx.ui.notify(`Generated stub summary for ${unitId} to unblock pipeline. Review later.`, "warning");
            persistCompletedKey(basePath, dispatchKey);
            completedKeySet.add(dispatchKey);
            unitDispatchCount.delete(dispatchKey);
            invalidateAllCaches();
            await new Promise(r => setImmediate(r));
            await dispatchNextUnit(ctx, pi);
            return;
          }
        }
      } catch { /* non-fatal — fall through to normal stop */ }
    }

    const expected = diagnoseExpectedArtifact(unitType, unitId, basePath);
    const remediation = buildLoopRemediationSteps(unitType, unitId, basePath);
    await stopAuto(ctx, pi, `Loop: ${unitType} ${unitId}`);
    sendDesktopNotification("GSD", `Loop detected: ${unitType} ${unitId}`, "error", "error");
    ctx.ui.notify(
      `Loop detected: ${unitType} ${unitId} dispatched ${prevCount + 1} times total. Expected artifact not found.${expected ? `\n   Expected: ${expected}` : ""}${remediation ? `\n\n   Remediation steps:\n${remediation}` : "\n   Check branch state and .gsd/ artifacts."}`,
      "error",
    );
    return;
  }
  unitDispatchCount.set(dispatchKey, prevCount + 1);
  if (prevCount > 0) {
    // Adaptive self-repair: each retry attempts a different remediation step.
    if (unitType === "execute-task") {
      const status = await inspectExecuteTaskDurability(basePath, unitId);
      const [mid, sid, tid] = unitId.split("/");
      if (status && mid && sid && tid) {
        if (status.summaryExists && !status.taskChecked) {
          // Retry 1+: summary exists but checkbox not marked — mark [x] and advance.
          const repaired = skipExecuteTask(basePath, mid, sid, tid, status, "self-repair", 0);
          // repaired: skipExecuteTask updated metadata (returned early-true even if regex missed).
          // verifyExpectedArtifact: confirms the physical artifact (summary + [x]) now exists.
          if (repaired && verifyExpectedArtifact(unitType, unitId, basePath)) {
            ctx.ui.notify(
              `Self-repaired ${unitId}: summary existed but checkbox was unmarked. Marked [x] and advancing.`,
              "warning",
            );
            // Persist completion so idempotency check prevents re-dispatch (#462).
            const repairedKey = `${unitType}/${unitId}`;
            persistCompletedKey(basePath, repairedKey);
            completedKeySet.add(repairedKey);
            unitDispatchCount.delete(dispatchKey);
            invalidateAllCaches();
            await new Promise(r => setImmediate(r));
            await dispatchNextUnit(ctx, pi);
            return;
          }
        } else if (prevCount >= STUB_RECOVERY_THRESHOLD && !status.summaryExists) {
          // Retry STUB_RECOVERY_THRESHOLD+: summary still missing after multiple attempts.
          // Write a minimal stub summary so the next agent session has a recovery artifact
          // to overwrite, rather than starting from scratch again.
          const tasksDir = resolveTasksDir(basePath, mid, sid);
          const sDir = resolveSlicePath(basePath, mid, sid);
          const targetDir = tasksDir ?? (sDir ? join(sDir, "tasks") : null);
          if (targetDir) {
            if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
            const summaryPath = join(targetDir, buildTaskFileName(tid, "SUMMARY"));
            if (!existsSync(summaryPath)) {
              const stubContent = [
                `# PARTIAL RECOVERY — attempt ${prevCount + 1} of ${MAX_UNIT_DISPATCHES}`,
                ``,
                `Task \`${tid}\` in slice \`${sid}\` (milestone \`${mid}\`) has not yet produced a real summary.`,
                `This placeholder was written by auto-mode after ${prevCount} dispatch attempts.`,
                ``,
                `The next agent session will retry this task. Replace this file with real work when done.`,
              ].join("\n");
              writeFileSync(summaryPath, stubContent, "utf-8");
              ctx.ui.notify(
                `Stub recovery (attempt ${prevCount + 1}/${MAX_UNIT_DISPATCHES}): ${unitId} stub summary placeholder written. Retrying with recovery context.`,
                "warning",
              );
            }
          }
        }
      }
    }
    ctx.ui.notify(
      `${unitType} ${unitId} didn't produce expected artifact. Retrying (${prevCount + 1}/${MAX_UNIT_DISPATCHES}).`,
      "warning",
    );
  }
  // Snapshot metrics + activity log for the PREVIOUS unit before we reassign.
  // The session still holds the previous unit's data (newSession hasn't fired yet).
  if (currentUnit) {
    const modelId = ctx.model?.id ?? "unknown";
    snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
    const activityFile = saveActivityLog(ctx, basePath, currentUnit.type, currentUnit.id);

    // Fire-and-forget memory extraction from completed unit
    if (activityFile) {
      try {
        const { buildMemoryLLMCall, extractMemoriesFromUnit } = await import('./memory-extractor.js');
        const llmCallFn = buildMemoryLLMCall(ctx);
        if (llmCallFn) {
          extractMemoriesFromUnit(activityFile, currentUnit.type, currentUnit.id, llmCallFn).catch(() => {});
        }
      } catch { /* non-fatal */ }
    }

    // Record routing outcome for adaptive learning
    if (currentUnitRouting) {
      const isRetry = currentUnit.type === unitType && currentUnit.id === unitId;
      recordOutcome(
        currentUnit.type,
        currentUnitRouting.tier as "light" | "standard" | "heavy",
        !isRetry, // success = not being retried
      );
    }

    // Only mark the previous unit as completed if:
    // 1. We're not about to re-dispatch the same unit (retry scenario)
    // 2. The expected artifact actually exists on disk
    // For hook units, skip artifact verification — hooks don't produce standard
    // artifacts and their runtime records were already finalized in handleAgentEnd.
    const closeoutKey = `${currentUnit.type}/${currentUnit.id}`;
    const incomingKey = `${unitType}/${unitId}`;
    const isHookUnit = currentUnit.type.startsWith("hook/");
    const artifactVerified = isHookUnit || verifyExpectedArtifact(currentUnit.type, currentUnit.id, basePath);
    if (closeoutKey !== incomingKey && artifactVerified) {
      if (!isHookUnit) {
        // Only persist completion keys for real units — hook keys are
        // ephemeral and should not pollute the idempotency set.
        persistCompletedKey(basePath, closeoutKey);
        completedKeySet.add(closeoutKey);
      }

      completedUnits.push({
        type: currentUnit.type,
        id: currentUnit.id,
        startedAt: currentUnit.startedAt,
        finishedAt: Date.now(),
      });
      // Cap to last 200 entries to prevent unbounded growth (#611)
      if (completedUnits.length > 200) {
        completedUnits = completedUnits.slice(-200);
      }
      clearUnitRuntimeRecord(basePath, currentUnit.type, currentUnit.id);
      unitDispatchCount.delete(`${currentUnit.type}/${currentUnit.id}`);
      unitRecoveryCount.delete(`${currentUnit.type}/${currentUnit.id}`);
    }
  }
  currentUnit = { type: unitType, id: unitId, startedAt: Date.now() };
  captureAvailableSkills(); // Capture skill telemetry at dispatch time (#599)
  writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
    phase: "dispatched",
    wrapupWarningSent: false,
    timeoutAt: null,
    lastProgressAt: currentUnit.startedAt,
    progressCount: 0,
    lastProgressKind: "dispatch",
  });

  // Status bar + progress widget
  ctx.ui.setStatus("gsd-auto", "auto");
  if (mid) updateSliceProgressCache(basePath, mid, state.activeSlice?.id);
  updateProgressWidget(ctx, unitType, unitId, state);

  // Ensure preconditions — create directories, branches, etc.
  // so the LLM doesn't have to get these right
  ensurePreconditions(unitType, unitId, basePath, state);

  // Fresh session
  const result = await cmdCtx!.newSession();
  if (result.cancelled) {
    await stopAuto(ctx, pi, "Session cancelled");
    return;
  }

  // Branchless architecture: all work commits sequentially on the milestone
  // branch — no per-slice branches or slice-level merges. Milestone merge
  // happens when phase === "complete" (see mergeMilestoneToMain above).

  // Write lock AFTER newSession so we capture the session file path.
  // Pi appends entries incrementally via appendFileSync, so on crash the
  // session file survives with every tool call up to the crash point.
  const sessionFile = ctx.sessionManager.getSessionFile();
  writeLock(lockBase(), unitType, unitId, completedUnits.length, sessionFile);

  // On crash recovery, prepend the full recovery briefing
  // On retry (stuck detection), prepend deep diagnostic from last attempt
  // Cap injected content to prevent unbounded prompt growth → OOM
  const MAX_RECOVERY_CHARS = 50_000;
  let finalPrompt = prompt;

  // Verification retry — inject failure context so the agent can auto-fix
  if (pendingVerificationRetry) {
    const retryCtx = pendingVerificationRetry;
    pendingVerificationRetry = null;
    const capped = retryCtx.failureContext.length > MAX_RECOVERY_CHARS
      ? retryCtx.failureContext.slice(0, MAX_RECOVERY_CHARS) + "\n\n[...failure context truncated]"
      : retryCtx.failureContext;
    finalPrompt = `**VERIFICATION FAILED — AUTO-FIX ATTEMPT ${retryCtx.attempt}**\n\nThe verification gate ran after your previous attempt and found failures. Fix these issues before completing the task.\n\n${capped}\n\n---\n\n${finalPrompt}`;
  }

  if (pendingCrashRecovery) {
    const capped = pendingCrashRecovery.length > MAX_RECOVERY_CHARS
      ? pendingCrashRecovery.slice(0, MAX_RECOVERY_CHARS) + "\n\n[...recovery briefing truncated to prevent memory exhaustion]"
      : pendingCrashRecovery;
    finalPrompt = `${capped}\n\n---\n\n${finalPrompt}`;
    pendingCrashRecovery = null;
  } else if ((unitDispatchCount.get(`${unitType}/${unitId}`) ?? 0) > 1) {
    const diagnostic = getDeepDiagnostic(basePath);
    if (diagnostic) {
      const cappedDiag = diagnostic.length > MAX_RECOVERY_CHARS
        ? diagnostic.slice(0, MAX_RECOVERY_CHARS) + "\n\n[...diagnostic truncated to prevent memory exhaustion]"
        : diagnostic;
      finalPrompt = `**RETRY — your previous attempt did not produce the required artifact.**\n\nDiagnostic from previous attempt:\n${cappedDiag}\n\nFix whatever went wrong and make sure you write the required file this time.\n\n---\n\n${finalPrompt}`;
    }
  }

  // Inject observability repair instructions so the agent fixes gaps before
  // proceeding with the unit (see #174).
  const repairBlock = buildObservabilityRepairBlock(observabilityIssues);
  if (repairBlock) {
    finalPrompt = `${finalPrompt}${repairBlock}`;
  }

  // ── Prompt char measurement (R051) ──
  lastPromptCharCount = finalPrompt.length;
  lastBaselineCharCount = undefined;
  if (isDbAvailable()) {
    try {
      const { inlineGsdRootFile } = await import("./auto-prompts.js");
      const [decisionsContent, requirementsContent, projectContent] = await Promise.all([
        inlineGsdRootFile(basePath, "decisions.md", "Decisions"),
        inlineGsdRootFile(basePath, "requirements.md", "Requirements"),
        inlineGsdRootFile(basePath, "project.md", "Project"),
      ]);
      lastBaselineCharCount =
        (decisionsContent?.length ?? 0) +
        (requirementsContent?.length ?? 0) +
        (projectContent?.length ?? 0);
    } catch {
      // Non-fatal — baseline measurement is best-effort
    }
  }

  // Switch model if preferences specify one for this unit type
  // Try primary model, then fallbacks in order if setting fails
  const modelConfig = resolveModelWithFallbacksForUnit(unitType);
  if (modelConfig) {
    const availableModels = ctx.modelRegistry.getAvailable();

    // ─── Dynamic Model Routing ─────────────────────────────────────────
    // If enabled, classify unit complexity and potentially downgrade to a
    // cheaper model. The user's configured model is the ceiling.
    const routingConfig = resolveDynamicRoutingConfig();
    let effectiveModelConfig = modelConfig;
    let routingTierLabel = "";
    currentUnitRouting = null;

    if (routingConfig.enabled) {
      // Compute budget pressure if budget ceiling is set
      let budgetPct: number | undefined;
      if (routingConfig.budget_pressure !== false) {
        const budgetCeiling = prefs?.budget_ceiling;
        if (budgetCeiling !== undefined && budgetCeiling > 0) {
          const currentLedger = getLedger();
          const totalCost = currentLedger ? getProjectTotals(currentLedger.units).cost : 0;
          budgetPct = totalCost / budgetCeiling;
        }
      }

      // Classify complexity (hook routing controlled by config.hooks)
      const isHook = unitType.startsWith("hook/");
      const shouldClassify = !isHook || routingConfig.hooks !== false;

      if (shouldClassify) {
        const classification = classifyUnitComplexity(unitType, unitId, basePath, budgetPct);
        const availableModelIds = availableModels.map(m => m.id);
        const routing = resolveModelForComplexity(classification, modelConfig, routingConfig, availableModelIds);

        if (routing.wasDowngraded) {
          effectiveModelConfig = {
            primary: routing.modelId,
            fallbacks: routing.fallbacks,
          };
          if (verbose) {
            ctx.ui.notify(
              `Dynamic routing [${tierLabel(classification.tier)}]: ${routing.modelId} (${classification.reason})`,
              "info",
            );
          }
        }
        routingTierLabel = ` [${tierLabel(classification.tier)}]`;
        currentUnitRouting = { tier: classification.tier, modelDowngraded: routing.wasDowngraded };
      }
    }

    const modelsToTry = [effectiveModelConfig.primary, ...effectiveModelConfig.fallbacks];
    let modelSet = false;

    for (const modelId of modelsToTry) {
      // Resolve model from available models.
      // Handles multiple formats:
      //   "provider/model"           → explicit provider targeting (e.g. "anthropic/claude-opus-4-6")
      //   "bare-id"                  → match by ID across providers
      //   "org/model-name"           → OpenRouter-style IDs where the full string is the model ID
      //   "openrouter/org/model"     → explicit provider + OpenRouter model ID
      const slashIdx = modelId.indexOf("/");
      let model;
      if (slashIdx !== -1) {
        const maybeProvider = modelId.substring(0, slashIdx);
        const id = modelId.substring(slashIdx + 1);

        // Check if the prefix before the first slash is a known provider
        const knownProviders = new Set(availableModels.map(m => m.provider.toLowerCase()));
        if (knownProviders.has(maybeProvider.toLowerCase())) {
          // Explicit "provider/model" format (handles "openrouter/org/model" too)
          model = availableModels.find(
            m => m.provider.toLowerCase() === maybeProvider.toLowerCase()
              && m.id.toLowerCase() === id.toLowerCase(),
          );
        }

        // If the prefix wasn't a known provider, or no match was found within that provider,
        // try matching the full string as a model ID (OpenRouter-style IDs like "org/model-name")
        if (!model) {
          const lower = modelId.toLowerCase();
          model = availableModels.find(
            m => m.id.toLowerCase() === lower
              || `${m.provider}/${m.id}`.toLowerCase() === lower,
          );
        }
      } else {
        // For bare IDs, prefer the current session's provider, then first available match
        const currentProvider = ctx.model?.provider;
        const exactProviderMatch = availableModels.find(
          m => m.id === modelId && m.provider === currentProvider,
        );
        const anyMatch = availableModels.find(m => m.id === modelId);
        model = exactProviderMatch ?? anyMatch;

        // Warn if the ID is ambiguous across providers
        if (anyMatch && !exactProviderMatch) {
          const providers = availableModels
            .filter(m => m.id === modelId)
            .map(m => m.provider);
          if (providers.length > 1) {
            ctx.ui.notify(
              `Model ID "${modelId}" exists in multiple providers (${providers.join(", ")}). ` +
              `Resolved to ${anyMatch.provider}. Use "provider/model" format for explicit targeting.`,
              "warning",
            );
          }
        }
      }
      if (!model) {
        if (verbose) ctx.ui.notify(`Model ${modelId} not found, trying fallback.`, "info");
        continue;
      }

      const ok = await pi.setModel(model, { persist: false });
      if (ok) {
        const fallbackNote = modelId === effectiveModelConfig.primary
          ? ""
          : ` (fallback from ${effectiveModelConfig.primary})`;
        const phase = unitPhaseLabel(unitType);
        ctx.ui.notify(`Model [${phase}]${routingTierLabel}: ${model.provider}/${model.id}${fallbackNote}`, "info");
        modelSet = true;
        break;
      } else {
        const nextModel = modelsToTry[modelsToTry.indexOf(modelId) + 1];
        if (nextModel) {
          if (verbose) ctx.ui.notify(`Failed to set model ${modelId}, trying ${nextModel}...`, "info");
        } else {
          ctx.ui.notify(`All preferred models unavailable for ${unitType}. Using default.`, "warning");
        }
      }
    }

    // modelSet=false is already handled by the "all fallbacks exhausted" warning above
  } else if (autoModeStartModel) {
    // No model preference for this unit type — re-apply the model captured
    // at auto-mode start to prevent bleed from the shared global settings.json
    // when multiple GSD instances run concurrently (#650).
    const availableModels = ctx.modelRegistry.getAvailable();
    const startModel = availableModels.find(
      m => m.provider === autoModeStartModel!.provider && m.id === autoModeStartModel!.id,
    );
    if (startModel) {
      const ok = await pi.setModel(startModel, { persist: false });
      if (!ok) {
        // Fallback: try matching just by ID across providers
        const byId = availableModels.find(m => m.id === autoModeStartModel!.id);
        if (byId) await pi.setModel(byId, { persist: false });
      }
    }
  }

  // Start progress-aware supervision: a soft warning, an idle watchdog, and
  // a larger hard ceiling. Productive long-running tasks may continue past the
  // soft timeout; only idle/stalled tasks pause early.
  clearUnitTimeout();
  const supervisor = resolveAutoSupervisorConfig();
  const softTimeoutMs = (supervisor.soft_timeout_minutes ?? 0) * 60 * 1000;
  const idleTimeoutMs = (supervisor.idle_timeout_minutes ?? 0) * 60 * 1000;
  const hardTimeoutMs = (supervisor.hard_timeout_minutes ?? 0) * 60 * 1000;

  wrapupWarningHandle = setTimeout(() => {
    wrapupWarningHandle = null;
    if (!active || !currentUnit) return;
    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "wrapup-warning-sent",
      wrapupWarningSent: true,
    });
    pi.sendMessage(
      {
        customType: "gsd-auto-wrapup",
        display: verbose,
        content: [
          "**TIME BUDGET WARNING — keep going only if progress is real.**",
          "This unit crossed the soft time budget.",
          "If you are making progress, continue. If not, switch to wrap-up mode now:",
          "1. rerun the minimal required verification",
          "2. write or update the required durable artifacts",
          "3. mark task or slice state on disk correctly",
          "4. leave precise resume notes if anything remains unfinished",
        ].join("\n"),
      },
      { triggerTurn: true },
    );
  }, softTimeoutMs);

  idleWatchdogHandle = setInterval(async () => {
    if (!active || !currentUnit) return;
    const runtime = readUnitRuntimeRecord(basePath, unitType, unitId);
    if (!runtime) return;
    if (Date.now() - runtime.lastProgressAt < idleTimeoutMs) return;

    // Agent has tool calls currently executing (await_job, long bash, etc.) —
    // not idle, just waiting for tool completion. But only suppress recovery
    // if the tool started recently. A tool in-flight for longer than the idle
    // timeout is likely stuck — e.g., `python -m http.server 8080 &` keeps the
    // shell's stdout/stderr open, causing the Bash tool to hang indefinitely.
    if (inFlightTools.size > 0) {
      const oldestStart = Math.min(...inFlightTools.values());
      const toolAgeMs = Date.now() - oldestStart;
      if (toolAgeMs < idleTimeoutMs) {
        writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
          lastProgressAt: Date.now(),
          lastProgressKind: "tool-in-flight",
        });
        return;
      }
      // Oldest tool has been running >= idleTimeoutMs — treat as a stuck/hung
      // tool (e.g., background process holding stdout open). Fall through to
      // idle recovery without resetting the progress clock.
      ctx.ui.notify(
        `Stalled tool detected: a tool has been in-flight for ${Math.round(toolAgeMs / 60000)}min. Treating as hung — attempting idle recovery.`,
        "warning",
      );
    }

    // Before triggering recovery, check if the agent is actually producing
    // work on disk.  `git status --porcelain` is cheap and catches any
    // staged/unstaged/untracked changes the agent made since lastProgressAt.
    if (detectWorkingTreeActivity(basePath)) {
      writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
        lastProgressAt: Date.now(),
        lastProgressKind: "filesystem-activity",
      });
      return;
    }

    if (currentUnit) {
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
    }
    saveActivityLog(ctx, basePath, unitType, unitId);

    const recovery = await recoverTimedOutUnit(ctx, pi, unitType, unitId, "idle");
    if (recovery === "recovered") return;

    writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
      phase: "paused",
    });
    ctx.ui.notify(
      `Unit ${unitType} ${unitId} made no meaningful progress for ${supervisor.idle_timeout_minutes}min. Pausing auto-mode.`,
      "warning",
    );
    await pauseAuto(ctx, pi);
  }, 15000);

  unitTimeoutHandle = setTimeout(async () => {
    unitTimeoutHandle = null;
    if (!active) return;
    if (currentUnit) {
      writeUnitRuntimeRecord(basePath, unitType, unitId, currentUnit.startedAt, {
        phase: "timeout",
        timeoutAt: Date.now(),
      });
      const modelId = ctx.model?.id ?? "unknown";
      snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId, { promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount, ...(currentUnitRouting ?? {}) });
    }
    saveActivityLog(ctx, basePath, unitType, unitId);

    const recovery = await recoverTimedOutUnit(ctx, pi, unitType, unitId, "hard");
    if (recovery === "recovered") return;

    ctx.ui.notify(
      `Unit ${unitType} ${unitId} exceeded ${supervisor.hard_timeout_minutes}min hard timeout. Pausing auto-mode.`,
      "warning",
    );
    await pauseAuto(ctx, pi);
  }, hardTimeoutMs);

  // Inject prompt — verify auto-mode still active (guards against race with timeout/pause)
  if (!active) return;
  pi.sendMessage(
    { customType: "gsd-auto", content: finalPrompt, display: verbose },
    { triggerTurn: true },
  );

  // For non-artifact-driven UAT types, pause auto-mode after sending the prompt.
  // The agent will write the UAT result file surfacing it for human review,
  // then on resume the result file exists and run-uat is skipped automatically.
  if (pauseAfterUatDispatch) {
    ctx.ui.notify(
      "UAT requires human execution. Auto-mode will pause after this unit writes the result file.",
      "info",
    );
    await pauseAuto(ctx, pi);
  }
  } finally {
    _dispatching = false;
  }
}

// ─── Preconditions ────────────────────────────────────────────────────────────

/**
 * Ensure directories, branches, and other prerequisites exist before
 * dispatching a unit. The LLM should never need to mkdir or git checkout.
 */
function ensurePreconditions(
  unitType: string,
  unitId: string,
  base: string,
  state: GSDState,
): void {
  const parts = unitId.split("/");
  const mid = parts[0]!;

  const mDir = resolveMilestonePath(base, mid);
  if (!mDir) {
    const newDir = join(milestonesDir(base), mid);
    mkdirSync(join(newDir, "slices"), { recursive: true });
  }

  if (parts.length >= 2) {
    const sid = parts[1]!;

    const mDirResolved = resolveMilestonePath(base, mid);
    if (mDirResolved) {
      const slicesDir = join(mDirResolved, "slices");
      const sDir = resolveDir(slicesDir, sid);
      if (!sDir) {
        mkdirSync(join(slicesDir, sid, "tasks"), { recursive: true });
      }
      const resolvedSliceDir = resolveDir(slicesDir, sid) ?? sid;
      const tasksDir = join(slicesDir, resolvedSliceDir, "tasks");
      if (!existsSync(tasksDir)) {
        mkdirSync(tasksDir, { recursive: true });
      }
    }
  }
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

/** Build recovery context from module state for recoverTimedOutUnit */
function buildRecoveryContext(): import("./auto-timeout-recovery.js").RecoveryContext {
  return {
    basePath: s.basePath,
    verbose: s.verbose,
    currentUnitStartedAt: s.currentUnit?.startedAt ?? Date.now(),
    unitRecoveryCount: s.unitRecoveryCount,
  };
}

// Re-export recovery functions for external consumers
export {
  resolveExpectedArtifactPath,
  verifyExpectedArtifact,
  writeBlockerPlaceholder,
  skipExecuteTask,
  buildLoopRemediationSteps,
} from "./auto-recovery.js";

/**
 * Test-only: expose skip-loop state for unit tests.
 * Not part of the public API.
 */

/**
 * Dispatch a hook unit directly, bypassing normal pre-dispatch hooks.
 * Used for manual hook triggers via /gsd run-hook.
 */
export async function dispatchHookUnit(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  hookName: string,
  triggerUnitType: string,
  triggerUnitId: string,
  hookPrompt: string,
  hookModel: string | undefined,
  targetBasePath: string,
): Promise<boolean> {
  if (!s.active) {
    s.active = true;
    s.stepMode = true;
    s.cmdCtx = ctx as ExtensionCommandContext;
    s.basePath = targetBasePath;
    s.autoStartTime = Date.now();
    s.currentUnit = null;
    s.completedUnits = [];
    s.pendingQuickTasks = [];
  }

  const hookUnitType = `hook/${hookName}`;
  const hookStartedAt = Date.now();

  s.currentUnit = {
    type: triggerUnitType,
    id: triggerUnitId,
    startedAt: hookStartedAt,
  };

  const result = await s.cmdCtx!.newSession();
  if (result.cancelled) {
    await stopAuto(ctx, pi);
    return false;
  }

  s.currentUnit = {
    type: hookUnitType,
    id: triggerUnitId,
    startedAt: hookStartedAt,
  };

  writeUnitRuntimeRecord(
    s.basePath,
    hookUnitType,
    triggerUnitId,
    hookStartedAt,
    {
      phase: "dispatched",
      wrapupWarningSent: false,
      timeoutAt: null,
      lastProgressAt: hookStartedAt,
      progressCount: 0,
      lastProgressKind: "dispatch",
    },
  );

  if (hookModel) {
    const availableModels = ctx.modelRegistry.getAvailable();
    const match = availableModels.find(
      (m) => m.id === hookModel || `${m.provider}/${m.id}` === hookModel,
    );
    if (match) {
      try {
        await pi.setModel(match);
      } catch {
        /* non-fatal */
      }
    }
  }

  const sessionFile = ctx.sessionManager.getSessionFile();
  writeLock(
    lockBase(),
    hookUnitType,
    triggerUnitId,
    s.completedUnits.length,
    sessionFile,
  );

  clearUnitTimeout();
  const supervisor = resolveAutoSupervisorConfig();
  const hookHardTimeoutMs = (supervisor.hard_timeout_minutes ?? 30) * 60 * 1000;
  s.unitTimeoutHandle = setTimeout(async () => {
    s.unitTimeoutHandle = null;
    if (!s.active) return;
    if (s.currentUnit) {
      writeUnitRuntimeRecord(
        s.basePath,
        hookUnitType,
        triggerUnitId,
        hookStartedAt,
        {
          phase: "timeout",
          timeoutAt: Date.now(),
        },
      );
    }
    ctx.ui.notify(
      `Hook ${hookName} exceeded ${supervisor.hard_timeout_minutes ?? 30}min timeout. Pausing auto-mode.`,
      "warning",
    );
    resetHookState();
    await pauseAuto(ctx, pi);
  }, hookHardTimeoutMs);

  ctx.ui.setStatus("gsd-auto", s.stepMode ? "next" : "auto");
  ctx.ui.notify(`Running post-unit hook: ${hookName}`, "info");

  // Ensure cwd matches basePath before hook dispatch (#1389)
  try { if (process.cwd() !== s.basePath) process.chdir(s.basePath); } catch {}

  debugLog("dispatchHookUnit", {
    phase: "send-message",
    promptLength: hookPrompt.length,
  });
  pi.sendMessage(
    { customType: "gsd-auto", content: hookPrompt, display: true },
    { triggerTurn: true },
  );

  return true;
}

// Direct phase dispatch → auto-direct-dispatch.ts
export { dispatchDirectPhase } from "./auto-direct-dispatch.js";
