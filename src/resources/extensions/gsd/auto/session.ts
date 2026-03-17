/**
 * AutoSession — centralized state for an auto-mode session.
 *
 * Previously, auto.ts used ~40 module-level mutable variables. This class
 * encapsulates all session state into a single object, making it:
 * - Testable (construct a session, verify state transitions)
 * - Resettable (clear state cleanly on stop/restart)
 * - Inspectable (one place to dump all state for diagnostics)
 *
 * State is organized into logical groups:
 * - Lifecycle: active, paused, stepMode, verbose
 * - Paths: basePath, originalBasePath
 * - Dispatch tracking: unit counts, skip tracking, completed keys
 * - Timers: timeout handles, watchdog handles
 * - Context: crash recovery, quick tasks, milestone ID
 * - Model: original model, routing info
 * - Metrics: start time, completed units, prompt char counts
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import type { GitServiceImpl } from "../git-service.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BudgetAlertLevel = 0 | 1 | 2 | 3;

export interface CompletedUnit {
  type: string;
  id: string;
  startedAt: number;
  finishedAt: number;
}

export interface CurrentUnit {
  type: string;
  id: string;
  startedAt: number;
}

export interface UnitRouting {
  tier: string;
  modelDowngraded: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max times a unit can be dispatched in a single auto-mode session cycle. */
export const MAX_UNIT_DISPATCHES = 3;

/** After this many dispatches, recovery generates stub artifacts. */
export const STUB_RECOVERY_THRESHOLD = 2;

/** Max total dispatches across reconciliation cycles (lifetime of the session). */
export const MAX_LIFETIME_DISPATCHES = 6;

/** Max consecutive skips before evicting from completedKeySet. */
export const MAX_CONSECUTIVE_SKIPS = 3;

/** Seconds before dispatch gap watchdog fires. */
export const DISPATCH_GAP_TIMEOUT_MS = 5_000;

// ─── Session Class ──────────────────────────────────────────────────────────

export class AutoSession {
  // ── Lifecycle ─────────────────────────────────────────────────────────
  active = false;
  paused = false;
  stepMode = false;
  verbose = false;
  cmdCtx: ExtensionCommandContext | null = null;

  // ── Paths ─────────────────────────────────────────────────────────────
  basePath = "";
  originalBasePath = "";

  // ── Git ───────────────────────────────────────────────────────────────
  gitService: GitServiceImpl | null = null;

  // ── Dispatch tracking ─────────────────────────────────────────────────
  /** Per-cycle dispatch count per unit key. */
  readonly unitDispatchCount = new Map<string, number>();
  /** Lifetime dispatch count (survives reconciliation). */
  readonly unitLifetimeDispatches = new Map<string, number>();
  /** Recovery attempt count per unit. */
  readonly unitRecoveryCount = new Map<string, number>();
  /** Consecutive skip count per unit (skip-loop detection). */
  readonly unitConsecutiveSkips = new Map<string, number>();
  /** Units completed in prior sessions (loaded from disk). */
  readonly completedKeySet = new Set<string>();

  // ── Timers ────────────────────────────────────────────────────────────
  unitTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  wrapupWarningHandle: ReturnType<typeof setTimeout> | null = null;
  idleWatchdogHandle: ReturnType<typeof setInterval> | null = null;
  dispatchGapHandle: ReturnType<typeof setTimeout> | null = null;

  // ── Context ───────────────────────────────────────────────────────────
  pendingCrashRecovery: string | null = null;
  pausedSessionFile: string | null = null;
  currentMilestoneId: string | null = null;
  pendingQuickTasks: Array<{ id: string; text: string; source?: string; resolvedAs?: string }> = [];
  resourceSyncedAtOnStart: number | null = null;

  // ── Model ─────────────────────────────────────────────────────────────
  autoModeStartModel: { provider: string; id: string } | null = null;
  originalModelId: string | null = null;
  originalModelProvider: string | null = null;
  currentUnitRouting: UnitRouting | null = null;
  lastBudgetAlertLevel: BudgetAlertLevel = 0;

  // ── Metrics ───────────────────────────────────────────────────────────
  autoStartTime = 0;
  completedUnits: CompletedUnit[] = [];
  currentUnit: CurrentUnit | null = null;
  lastPromptCharCount: number | undefined;
  lastBaselineCharCount: number | undefined;

  // ── In-flight tool tracking ───────────────────────────────────────────
  readonly inFlightTools = new Map<string, number>();

  // ── Internal flags ────────────────────────────────────────────────────
  /** Guards against re-entrant handleAgentEnd calls. */
  handlingAgentEnd = false;
  /** SIGTERM handler reference for cleanup. */
  sigtermHandler: (() => void) | null = null;

  // ── Methods ───────────────────────────────────────────────────────────

  /**
   * Reset dispatch counters for a new dispatch cycle.
   * Called on resume from pause.
   */
  resetDispatchCounters(): void {
    this.unitDispatchCount.clear();
    this.unitLifetimeDispatches.clear();
    this.unitConsecutiveSkips.clear();
  }

  /**
   * Clear all timer handles. Call on stop/pause.
   */
  clearAllTimers(): void {
    if (this.unitTimeoutHandle) {
      clearTimeout(this.unitTimeoutHandle);
      this.unitTimeoutHandle = null;
    }
    if (this.wrapupWarningHandle) {
      clearTimeout(this.wrapupWarningHandle);
      this.wrapupWarningHandle = null;
    }
    if (this.idleWatchdogHandle) {
      clearInterval(this.idleWatchdogHandle);
      this.idleWatchdogHandle = null;
    }
    if (this.dispatchGapHandle) {
      clearTimeout(this.dispatchGapHandle);
      this.dispatchGapHandle = null;
    }
  }

  /**
   * Mark a unit as started.
   */
  startUnit(type: string, id: string): void {
    this.currentUnit = { type, id, startedAt: Date.now() };
  }

  /**
   * Mark the current unit as completed and record it.
   */
  completeUnit(): CompletedUnit | null {
    if (!this.currentUnit) return null;
    const completed: CompletedUnit = {
      ...this.currentUnit,
      finishedAt: Date.now(),
    };
    this.completedUnits.push(completed);
    this.currentUnit = null;
    return completed;
  }

  /**
   * Record a tool call starting.
   */
  markToolStart(toolCallId: string): void {
    this.inFlightTools.set(toolCallId, Date.now());
  }

  /**
   * Record a tool call ending.
   */
  markToolEnd(toolCallId: string): void {
    this.inFlightTools.delete(toolCallId);
  }

  /**
   * Get age of the oldest in-flight tool call (ms), or 0 if none.
   */
  getOldestInFlightToolAgeMs(): number {
    if (this.inFlightTools.size === 0) return 0;
    const now = Date.now();
    let oldest = now;
    for (const startTime of this.inFlightTools.values()) {
      if (startTime < oldest) oldest = startTime;
    }
    return now - oldest;
  }

  /**
   * Dump session state for diagnostics.
   */
  toJSON(): Record<string, unknown> {
    return {
      active: this.active,
      paused: this.paused,
      stepMode: this.stepMode,
      basePath: this.basePath,
      originalBasePath: this.originalBasePath,
      currentMilestoneId: this.currentMilestoneId,
      currentUnit: this.currentUnit,
      completedUnits: this.completedUnits.length,
      completedKeySet: this.completedKeySet.size,
      unitDispatchCount: Object.fromEntries(this.unitDispatchCount),
      unitLifetimeDispatches: Object.fromEntries(this.unitLifetimeDispatches),
      unitConsecutiveSkips: Object.fromEntries(this.unitConsecutiveSkips),
      inFlightTools: this.inFlightTools.size,
      autoStartTime: this.autoStartTime,
      lastBudgetAlertLevel: this.lastBudgetAlertLevel,
    };
  }
}
