// Project/App: GSD-2
// File Purpose: Formats user-facing auto-mode milestone lease conflict notices.

const LEASE_HELD_RE = /^Milestone\s+(\S+)\s+is held by worker\s+(.+?)\s+until\s+(.+?)\.?$/;

export interface LeaseConflictNoticeInput {
  milestoneId?: string | null;
  unitType: string;
  unitId: string;
  reason: string;
  now?: Date;
}

function formatRelativeDuration(ms: number): string {
  const seconds = Math.max(1, Math.ceil(Math.abs(ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}h`;
}

function formatRetryWindow(expiresAt: string, now: Date): string {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return `until ${expiresAt}`;
  }

  const clock = expiry.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const deltaMs = expiry.getTime() - now.getTime();
  if (deltaMs <= 0) {
    return `after ${clock} (the lease should be expired now)`;
  }
  return `after ${clock} (about ${formatRelativeDuration(deltaMs)})`;
}

export function formatLeaseConflictNotice(input: LeaseConflictNoticeInput): string {
  const milestoneId = input.milestoneId || "the milestone";
  const unitLabel = `${input.unitType} ${input.unitId}`;
  const match = input.reason.match(LEASE_HELD_RE);

  if (!match) {
    return [
      `Blocked: ${milestoneId} is already active in another GSD worker. Try /gsd status to inspect it, then rerun /gsd auto when it finishes.`,
      `Waiting unit: ${unitLabel}.`,
      `Details: ${input.reason}`,
    ].join("\n");
  }

  const [, parsedMilestoneId, workerId, expiresAt] = match;
  const retryWindow = formatRetryWindow(expiresAt, input.now ?? new Date());
  return [
    `Blocked: ${parsedMilestoneId} is already active in another GSD worker. Retry with /gsd auto ${retryWindow}.`,
    `Waiting unit: ${unitLabel}.`,
    `Details: held by ${workerId}.`,
  ].join("\n");
}
