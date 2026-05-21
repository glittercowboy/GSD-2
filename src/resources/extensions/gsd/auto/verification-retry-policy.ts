// Project/App: GSD-2
// File Purpose: Central retry policy for auto-mode verification redispatches.

import { createHash } from "node:crypto";

import type { PendingVerificationRetry } from "./session.js";

export const VERIFICATION_RETRY_BASE_DELAY_MS = 2_000;
export const VERIFICATION_RETRY_MAX_DELAY_MS = 30_000;
export const VERIFICATION_RETRY_JITTER_RATIO = 0.1;

export type VerificationRetryDecision =
  | {
      action: "delay";
      key: string;
      failureHash: string;
      delayMs: number;
      baseDelayMs: number;
    }
  | {
      action: "pause";
      reason: "missing-retry-context" | "duplicate-failure-context";
      key?: string;
      failureHash?: string;
    };

export function verificationRetryKey(unitType: string, unitId: string): string {
  return `${unitType}:${unitId}`;
}

export function hashVerificationFailureContext(failureContext: string): string {
  const normalized = failureContext.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function verificationRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): { delayMs: number; baseDelayMs: number } {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const baseDelayMs = Math.min(
    VERIFICATION_RETRY_MAX_DELAY_MS,
    VERIFICATION_RETRY_BASE_DELAY_MS * 2 ** (safeAttempt - 1),
  );
  const jitterSpanMs = Math.round(baseDelayMs * VERIFICATION_RETRY_JITTER_RATIO);
  const jitterMs = Math.round((random() - 0.5) * 2 * jitterSpanMs);
  const delayMs = Math.min(
    VERIFICATION_RETRY_MAX_DELAY_MS,
    Math.max(0, baseDelayMs + jitterMs),
  );
  return { delayMs, baseDelayMs };
}

export function decideVerificationRetry(input: {
  unitType: string | undefined;
  retryInfo: PendingVerificationRetry | null | undefined;
  previousFailureHash: string | undefined;
  random?: () => number;
}): VerificationRetryDecision {
  const { retryInfo, unitType } = input;
  if (!retryInfo || !unitType) {
    return { action: "pause", reason: "missing-retry-context" };
  }

  const key = verificationRetryKey(unitType, retryInfo.unitId);
  const failureHash = hashVerificationFailureContext(retryInfo.failureContext);
  if (input.previousFailureHash === failureHash) {
    return {
      action: "pause",
      reason: "duplicate-failure-context",
      key,
      failureHash,
    };
  }

  return {
    action: "delay",
    key,
    failureHash,
    ...verificationRetryDelayMs(retryInfo.attempt, input.random),
  };
}
