// GSD-2 — Smart entry routing decisions.
// Pure route selection for /gsd guided wizard choices.

export type SmartEntryIsolationMode = "worktree" | "branch" | "none";

export type ActiveTaskChoice =
  | "execute"
  | "auto"
  | "status"
  | "milestone_actions";

export type ActiveTaskRoute =
  | {
      kind: "auto-bootstrap";
      verboseMode: false;
      options?: {
        step?: true;
        milestoneLock?: string;
      };
    }
  | {
      kind: "guided-dispatch";
      unitType: "execute-task";
    }
  | {
      kind: "status";
    }
  | {
      kind: "milestone-actions";
    };

export function resolveGuidedExecuteLaunchMode(
  isolationMode: SmartEntryIsolationMode,
): "auto-step" | "guided-dispatch" {
  return isolationMode === "worktree" ? "auto-step" : "guided-dispatch";
}

export function resolveActiveTaskChoiceRoute(input: {
  choice: ActiveTaskChoice;
  isolationMode: SmartEntryIsolationMode;
  milestoneId: string;
}): ActiveTaskRoute {
  if (input.choice === "auto") {
    return {
      kind: "auto-bootstrap",
      verboseMode: false,
    };
  }

  if (input.choice === "execute") {
    if (resolveGuidedExecuteLaunchMode(input.isolationMode) === "auto-step") {
      return {
        kind: "auto-bootstrap",
        verboseMode: false,
        options: {
          step: true,
          milestoneLock: input.milestoneId,
        },
      };
    }

    return {
      kind: "guided-dispatch",
      unitType: "execute-task",
    };
  }

  if (input.choice === "status") {
    return { kind: "status" };
  }

  if (input.choice === "milestone_actions") {
    return { kind: "milestone-actions" };
  }

  throw new Error(`Invalid ActiveTaskChoice: ${input.choice}`);
}
