// ─── API Types ────────────────────────────────────────────────────────────────
// These types mirror the S01 server's actual API responses.
// Do NOT add fields that the server doesn't return (e.g. basePath, state on ProjectEntry).

// ─── REST API Types ───────────────────────────────────────────────────────────

/** From GET /api/projects — returns {hash, name}[] only */
export interface ProjectEntry {
  hash: string
  name: string
}

/** Lightweight reference to an active milestone/slice/task */
export interface ActiveRef {
  id: string
  title?: string
}

/** Requirement status counts */
export interface RequirementCounts {
  active: number
  validated: number
  deferred: number
  outOfScope: number
  blocked: number
  total: number
}

/** Client-side subset of a milestone registry entry.
 *  The server has more fields; only these are used client-side for now. */
export interface MilestoneRegistryEntry {
  id: string
  title: string
  status: string
  slices?: Array<{
    id: string
    title: string
    status: string
    risk?: string
  }>
}

/** From GET /api/state?project=<hash> */
export interface AutoStatus {
  active: boolean
  paused: boolean
  stepMode: boolean
  startTime: number
  elapsed: number
  currentUnit: { type: string; id: string; startedAt: number } | null
  completedUnits: { type: string; id: string; startedAt: number; finishedAt: number }[]
  totalCost: number
  totalTokens: number
  pendingCaptureCount: number
}

/** Serializable subset of WorkerInfo (excludes `process` and `worktreePath`) */
export interface WebWorkerInfo {
  milestoneId: string
  title: string
  pid: number
  state: 'running' | 'paused' | 'stopped' | 'error'
  completedUnits: number
  cost: number
  startedAt: number
}

/** From GET /api/state?project=<hash> */
export interface GSDState {
  activeMilestone: ActiveRef | null
  activeSlice: ActiveRef | null
  activeTask: ActiveRef | null
  phase: string
  recentDecisions: string[]
  blockers: string[]
  nextAction: string
  activeWorkspace?: string
  registry: MilestoneRegistryEntry[]
  requirements?: RequirementCounts
  progress?: {
    milestones: { done: number; total: number }
    slices?: { done: number; total: number }
    tasks?: { done: number; total: number }
  }
  autoStatus?: AutoStatus
  workerStatuses?: WebWorkerInfo[]
}

// ─── WebSocket Event Types ────────────────────────────────────────────────────

/**
 * Discriminated union of all WebSocket event types the server can broadcast.
 * Full set defined here so S03+ don't need breaking type changes.
 */
export type StudioEvent =
  | { type: 'connected'; data: { project: string | null }; timestamp: number }
  | { type: 'state_change'; data: { project: string }; timestamp: number }
  | { type: 'phase_change'; data: { project: string; phase: string }; timestamp: number }
  | { type: 'unit_start'; data: { project: string; unitId: string; unitType: string }; timestamp: number }
  | { type: 'unit_complete'; data: { project: string; unitId: string; unitType: string }; timestamp: number }
  | { type: 'metric_update'; data: { project: string }; timestamp: number }
  | { type: 'log_line'; data: { level: string; message: string; timestamp: number }; timestamp: number }
  | { type: 'health_change'; data: { project: string }; timestamp: number }
  | { type: 'ping'; data: Record<string, never>; timestamp: number }

// ─── Visualizer & Metrics Types ───────────────────────────────────────────────
// Mirror the server interfaces from visualizer-data.ts and metrics.ts.
// CriticalPathInfo uses Record (not Map) because Maps are serialized to {} in JSON.

export interface TokenCounts {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface VisualizerTask {
  id: string
  title: string
  done: boolean
  active: boolean
  estimate?: string
}

export interface VisualizerSlice {
  id: string
  title: string
  done: boolean
  active: boolean
  risk: string
  depends: string[]
  tasks: VisualizerTask[]
}

export interface VisualizerMilestone {
  id: string
  title: string
  status: 'complete' | 'active' | 'pending' | 'parked'
  dependsOn: string[]
  slices: VisualizerSlice[]
}

/** criticalPath with plain Record (Maps are converted via Object.fromEntries on the server) */
export interface CriticalPathInfo {
  milestonePath: string[]
  slicePath: string[]
  milestoneSlack: Record<string, number>
  sliceSlack: Record<string, number>
}

export interface PhaseAggregate {
  phase: string
  units: number
  tokens: TokenCounts
  cost: number
  duration: number
}

export interface SliceAggregate {
  sliceId: string
  units: number
  tokens: TokenCounts
  cost: number
  duration: number
}

export interface ModelAggregate {
  model: string
  units: number
  tokens: TokenCounts
  cost: number
  contextWindowTokens?: number
}

export interface TierAggregate {
  tier: string
  units: number
  tokens: TokenCounts
  cost: number
  downgraded: number
}

export interface ProjectTotals {
  units: number
  tokens: TokenCounts
  cost: number
  duration: number
  toolCalls: number
  assistantMessages: number
  userMessages: number
  apiRequests: number
  totalTruncationSections: number
  continueHereFiredCount: number
}

export interface UnitMetrics {
  type: string
  id: string
  model: string
  startedAt: number
  finishedAt: number
  tokens: TokenCounts
  cost: number
  toolCalls: number
  tier?: string
  modelDowngraded?: boolean
  cacheHitRate?: number
}

/** From GET /api/visualizer?project=<hash> */
export interface VisualizerDataResponse {
  milestones: VisualizerMilestone[]
  phase: string
  totals: ProjectTotals | null
  byPhase: PhaseAggregate[]
  bySlice: SliceAggregate[]
  byModel: ModelAggregate[]
  byTier: TierAggregate[]
  tierSavingsLine: string
  units: UnitMetrics[]
  criticalPath: CriticalPathInfo
  remainingSliceCount: number
}

/** From GET /api/metrics?project=<hash> */
export interface MetricsDataResponse {
  totals: ProjectTotals | null
  byPhase: PhaseAggregate[]
  bySlice: SliceAggregate[]
  byModel: ModelAggregate[]
  byTier: TierAggregate[]
  tierSavingsLine: string
  units: UnitMetrics[]
  budgetCeiling?: number
}

// ─── Health & Activity Types (S05) ────────────────────────────────────────────

export interface ProviderStatusSummary {
  name: string
  label: string
  category: string
  ok: boolean
  required: boolean
  message: string
}

export interface SkillSummaryInfo {
  total: number
  warningCount: number
  criticalCount: number
  topIssue: string | null
}

export interface EnvironmentCheckResult {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  detail?: string
}

/** From GET /api/health?project=<hash> — mirrors server's HealthInfo interface */
export interface HealthDataResponse {
  budgetCeiling: number | undefined
  tokenProfile: string
  truncationRate: number
  continueHereRate: number
  tierBreakdown: TierAggregate[]
  tierSavingsLine: string
  toolCalls: number
  assistantMessages: number
  userMessages: number
  providers: ProviderStatusSummary[]
  skillSummary: SkillSummaryInfo
  environmentIssues: EnvironmentCheckResult[]
}

/** Single log entry — mirrors ActivityEntry from web-log-channel.ts */
export interface ActivityEntry {
  level: string
  message: string
  timestamp: number
}
