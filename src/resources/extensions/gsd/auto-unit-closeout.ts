// Project/App: GSD-2
// File Purpose: Auto-mode unit closeout metrics, activity capture, and ghost-run detection.

/**
 * Unit closeout helper — consolidates the repeated pattern of
 * snapshotting metrics + saving activity log + extracting memories
 * that appears 6+ times in auto.ts.
 */

import type { ExtensionContext } from "@gsd/pi-coding-agent";
import { snapshotUnitMetrics } from "./metrics.js";
import { saveActivityLog } from "./activity-log.js";
import { logWarning } from "./workflow-logger.js";
import { writeTurnGitTransaction } from "./uok/gitops.js";

export interface CloseoutOptions {
  promptCharCount?: number;
  baselineCharCount?: number;
  tier?: string;
  modelDowngraded?: boolean;
  continueHereFired?: boolean;
  traceId?: string;
  turnId?: string;
  gitAction?: "commit" | "snapshot" | "status-only";
  gitPush?: boolean;
  gitStatus?: "ok" | "failed";
  gitError?: string;
}

export interface UnitActivitySnapshot {
  elapsedMs: number;
  toolCalls: number;
  assistantMessages: number;
}

export const GHOST_COMPLETION_MAX_ELAPSED_MS = 500;

export function snapshotUnitActivity(
  ctx: ExtensionContext,
  startedAt: number,
  now = Date.now(),
): UnitActivitySnapshot {
  let toolCalls = 0;
  let assistantMessages = 0;
  const entries = ctx.sessionManager.getEntries() ?? [];

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = (entry as any).message;
    if (!msg || msg.role !== "assistant") continue;
    assistantMessages++;
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block?.type === "toolCall") toolCalls++;
    }
  }

  return {
    elapsedMs: Math.max(0, now - startedAt),
    toolCalls,
    assistantMessages,
  };
}

export function isSuspiciousGhostCompletion(
  ctx: ExtensionContext,
  startedAt: number,
  maxElapsedMs = GHOST_COMPLETION_MAX_ELAPSED_MS,
): boolean {
  const activity = snapshotUnitActivity(ctx, startedAt);
  return (
    activity.elapsedMs < maxElapsedMs &&
    activity.toolCalls === 0 &&
    activity.assistantMessages === 0
  );
}

/**
 * Snapshot metrics, save activity log, and fire-and-forget memory extraction
 * for a completed unit. Returns the activity log file path (if any).
 */
export async function closeoutUnit(
  ctx: ExtensionContext,
  basePath: string,
  unitType: string,
  unitId: string,
  startedAt: number,
  opts?: CloseoutOptions,
): Promise<string | undefined> {
  const modelId = ctx.model?.id ?? "unknown";
  snapshotUnitMetrics(ctx, unitType, unitId, startedAt, modelId, opts);
  const activityFile = saveActivityLog(ctx, basePath, unitType, unitId);

  if (activityFile) {
    try {
      const { buildMemoryLLMCall, extractMemoriesFromUnit } = await import('./memory-extractor.js');
      const llmCallFn = buildMemoryLLMCall(ctx);
      if (llmCallFn) {
        // Awaited: a fire-and-forget here lets memory-extractor writes land in
        // .gsd/ after closeoutUnit returns but before the milestone merge
        // runs, which made the working tree appear dirty to `git merge
        // --squash` (root cause class of #4704). Completion latency is now
        // bounded by the extractor's LLM call, which is the acceptable price
        // for not racing the merge boundary.
        try {
          await extractMemoriesFromUnit(activityFile, unitType, unitId, llmCallFn);
        } catch (err) {
          logWarning(
            "engine",
            `memory extraction failed for ${unitType}/${unitId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) { /* non-fatal */
      logWarning("engine", `operation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (opts?.traceId && opts.turnId && opts.gitAction && opts.gitStatus) {
    writeTurnGitTransaction({
      basePath,
      traceId: opts.traceId,
      turnId: opts.turnId,
      unitType,
      unitId,
      stage: "record",
      action: opts.gitAction,
      push: opts.gitPush === true,
      status: opts.gitStatus,
      error: opts.gitError,
      metadata: {
        activityFile,
      },
    });
  }

  return activityFile ?? undefined;
}
