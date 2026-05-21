// GSD-2 Web — Browser-safe TypeScript interfaces for the workflow visualizer.
// Mirrors upstream types from src/resources/extensions/gsd/visualizer-data.ts
// and src/resources/extensions/gsd/metrics.ts — do NOT import from those
// modules directly, as they use Node.js APIs unavailable in the browser.

// ─── Core Structures ──────────────────────────────────────────────────────────

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
  status: "complete" | "active" | "pending" | "parked"
  dependsOn: string[]
  slices: VisualizerSlice[]
}

// ─── Critical Path ────────────────────────────────────────────────────────────

/** Browser-safe variant: slack fields are plain Records, not Maps. */
export interface CriticalPathInfo {
  milestonePath: string[]
  slicePath: string[]
  milestoneSlack: Record<string, number>
  sliceSlack: Record<string, number>
}

// ─── Agent Activity ───────────────────────────────────────────────────────────

export interface AgentActivityInfo {
  currentUnit: { type: string; id: string; startedAt: number } | null
  elapsed: number
  completedUnits: number
  totalSlices: number
  completionRate: number
  active: boolean
  sessionCost: number
  sessionTokens: number
}

// ─── Changelog ────────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  milestoneId: string
  sliceId: string
  title: string
  oneLiner: string
  filesModified: { path: string; description: string }[]
  completedAt: string
}

export interface ChangelogInfo {
  entries: ChangelogEntry[]
}

export interface VisualizerSliceRef {
  milestoneId: string
  sliceId: string
  title: string
}

export interface VisualizerSliceActivity extends VisualizerSliceRef {
  completedAt: string
}

export interface VisualizerStats {
  missingCount: number
  missingSlices: VisualizerSliceRef[]
  updatedCount: number
  updatedSlices: VisualizerSliceActivity[]
  recentEntries: ChangelogEntry[]
}

export type DiscussionState = "undiscussed" | "draft" | "discussed"

export interface VisualizerDiscussionState {
  milestoneId: string
  title: string
  state: DiscussionState
  hasContext: boolean
  hasDraft: boolean
  lastUpdated: string | null
}

export interface SliceVerification {
  milestoneId: string
  sliceId: string
  verificationResult: string
  blockerDiscovered: boolean
  keyDecisions: string[]
  patternsEstablished: string[]
  provides: string[]
  requires: { slice: string; provides: string }[]
}

export interface KnowledgeInfo {
  rules: { id: string; scope: string; content: string }[]
  patterns: { id: string; content: string }[]
  lessons: { id: string; content: string }[]
  exists: boolean
}

export type CaptureClassification = "quick-task" | "inject" | "defer" | "replan" | "note" | "stop" | "backtrack"

export interface CaptureEntry {
  id: string
  text: string
  timestamp: string
  status: "pending" | "triaged" | "resolved"
  classification?: CaptureClassification
  resolution?: string
  rationale?: string
  resolvedAt?: string
  resolvedInMilestone?: string
  executed?: boolean
}

export interface CapturesInfo {
  entries: CaptureEntry[]
  pendingCount: number
  totalCount: number
}

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
  status: "ok" | "warning" | "error"
  message: string
  detail?: string
}

export interface VisualizerDoctorEntry {
  ts: string
  ok: boolean
  errors: number
  warnings: number
  fixes: number
  codes: string[]
  issues?: Array<{ severity: string; code: string; message: string; unitId: string }>
  fixDescriptions?: string[]
  scope?: string
  summary?: string
}

export interface VisualizerProgressScore {
  level: "green" | "yellow" | "red"
  summary: string
  signals: Array<{ kind: "positive" | "negative" | "neutral"; label: string }>
}

export interface HealthInfo {
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
  doctorHistory?: VisualizerDoctorEntry[]
  progressScore?: VisualizerProgressScore | null
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface TokenCounts {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface UnitMetrics {
  type: string
  id: string
  model: string
  startedAt: number
  finishedAt: number
  autoSessionKey?: string
  tokens: TokenCounts
  cost: number
  toolCalls: number
  assistantMessages: number
  userMessages: number
  apiRequests?: number
  contextWindowTokens?: number
  truncationSections?: number
  continueHereFired?: boolean
  promptCharCount?: number
  baselineCharCount?: number
  tier?: string
  modelDowngraded?: boolean
  skills?: string[]
  cacheHitRate?: number
  compressionSavings?: number
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

// ─── Top-level Payload ────────────────────────────────────────────────────────

export interface VisualizerData {
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
  agentActivity: AgentActivityInfo | null
  changelog: ChangelogInfo
  sliceVerifications: SliceVerification[]
  knowledge: KnowledgeInfo
  captures: CapturesInfo
  health: HealthInfo
  discussion: VisualizerDiscussionState[]
  stats: VisualizerStats
}

// ─── Formatting Utilities ─────────────────────────────────────────────────────

/** Format a USD cost value — uses more decimals for small amounts. */
export function formatCost(cost: number): string {
  const n = Number(cost) || 0
  if (n < 0.01) return `$${n.toFixed(4)}`
  if (n < 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}

/** Format a token count with K/M suffixes for readability. */
export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`
  return `${(count / 1_000_000).toFixed(2)}M`
}

/** Format a duration in milliseconds as human-readable Xs / Xm Xs / Xh Xm. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

/** Count captures by status for visualizer summary surfaces. */
export function getCaptureStatusCounts(captures: CapturesInfo): Record<CaptureEntry["status"], number> {
  const counts: Record<CaptureEntry["status"], number> = {
    pending: 0,
    triaged: 0,
    resolved: 0,
  }

  for (const entry of captures.entries) {
    counts[entry.status] += 1
  }

  return counts
}
