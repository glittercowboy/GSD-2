/**
 * Pure derivation of the primary workflow action based on workspace state.
 * No React dependencies — fully testable with plain imports.
 */

export interface WorkflowActionInput {
  phase: string
  autoActive: boolean
  autoPaused: boolean
  onboardingLocked: boolean
  commandInFlight: string | null
  bootStatus: string
  hasMilestones: boolean
}

export interface WorkflowAction {
  label: string
  command: string
  variant: "default" | "destructive"
}

export interface WorkflowActionResult {
  primary: WorkflowAction | null
  secondaries: { label: string; command: string }[]
  disabled: boolean
  disabledReason?: string
}

export function deriveWorkflowAction(input: WorkflowActionInput): WorkflowActionResult {
  const { phase, autoActive, autoPaused, onboardingLocked, commandInFlight, bootStatus, hasMilestones } = input

  // Determine disabled state and reason
  let disabled = false
  let disabledReason: string | undefined

  if (commandInFlight !== null) {
    disabled = true
    disabledReason = "Command in progress"
  } else if (bootStatus !== "ready") {
    disabled = true
    disabledReason = "Workspace not ready"
  } else if (onboardingLocked) {
    disabled = true
    disabledReason = "Setup required"
  }

  // Derive primary action
  let primary: WorkflowAction | null = null
  const secondaries: { label: string; command: string }[] = []

  if (autoActive && !autoPaused) {
    primary = { label: "Stop Auto", command: "/gsd stop", variant: "destructive" }
  } else if (autoPaused) {
    primary = { label: "Resume Auto", command: "/gsd auto", variant: "default" }
  } else {
    // Auto is not active
    if (phase === "planning") {
      primary = { label: "Plan", command: "/gsd", variant: "default" }
    } else if (phase === "executing" || phase === "summarizing") {
      primary = { label: "Start Auto", command: "/gsd auto", variant: "default" }
    } else if (phase === "pre-planning" && !hasMilestones) {
      primary = { label: "Initialize Project", command: "/gsd", variant: "default" }
    } else {
      primary = { label: "Continue", command: "/gsd", variant: "default" }
    }

    // Add "Step" secondary when auto is not active
    if (primary.command !== "/gsd next") {
      secondaries.push({ label: "Step", command: "/gsd next" })
    }
  }

  return { primary, secondaries, disabled, disabledReason }
}
