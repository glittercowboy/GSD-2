// Project/App: GSD-2
// File Purpose: Host-owned verification verdict policy for auto-mode units.

import type { VerificationResult as VerificationGateResult } from "./types.js";

export type VerificationVerdictReason =
  | "passed"
  | "no-host-checks"
  | "checks-failed";

export interface VerificationVerdict {
  passed: boolean;
  reason: VerificationVerdictReason;
  retryable: boolean;
  failureContext: string;
}

export function decideVerificationVerdict(
  unitType: string,
  result: VerificationGateResult,
): VerificationVerdict {
  if (unitType === "execute-task" && result.discoverySource === "none" && result.checks.length === 0) {
    return {
      passed: false,
      reason: "no-host-checks",
      retryable: false,
      failureContext:
        "No runnable host-owned verification command was discovered. Add project verification_commands or a runnable task-plan Verify command before completing this execute-task.",
    };
  }

  if (!result.passed) {
    return {
      passed: false,
      reason: "checks-failed",
      retryable: true,
      failureContext: "",
    };
  }

  return {
    passed: true,
    reason: "passed",
    retryable: false,
    failureContext: "",
  };
}
