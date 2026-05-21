// Project/App: GSD-2
// File Purpose: Best-effort worker heartbeat adapter for auto-mode loop.

export interface WorkerHeartbeatSession {
  workerId?: string | null;
  currentMilestoneId?: string | null;
  milestoneLeaseToken?: number | null;
}

export interface MaintainWorkerHeartbeatDeps {
  heartbeatAutoWorker: (workerId: string) => void;
  refreshMilestoneLease: (
    workerId: string,
    milestoneId: string,
    fencingToken: number,
  ) => boolean;
  logHeartbeatFailure: (err: unknown) => void;
  logLeaseRefreshMiss?: (details: {
    workerId: string;
    milestoneId: string;
    fencingToken: number;
  }) => void;
}

export function maintainWorkerHeartbeat(
  session: WorkerHeartbeatSession,
  deps: MaintainWorkerHeartbeatDeps,
): void {
  if (!session.workerId) return;

  try {
    deps.heartbeatAutoWorker(session.workerId);
    if (session.currentMilestoneId && session.milestoneLeaseToken) {
      const refreshed = deps.refreshMilestoneLease(
        session.workerId,
        session.currentMilestoneId,
        session.milestoneLeaseToken,
      );
      if (!refreshed) {
        deps.logLeaseRefreshMiss?.({
          workerId: session.workerId,
          milestoneId: session.currentMilestoneId,
          fencingToken: session.milestoneLeaseToken,
        });
        session.milestoneLeaseToken = null;
      }
    }
  } catch (err) {
    deps.logHeartbeatFailure(err);
  }
}
