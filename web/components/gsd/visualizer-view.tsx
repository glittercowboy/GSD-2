// GSD-2 Web — Workflow visualizer browser view.

"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import {
  CheckCircle2,
  Circle,
  Play,
  AlertTriangle,
  Clock,
  Download,
  Activity,
  GitBranch,
  ArrowRight,
  BarChart3,
  FileText,
  FileJson,
  Loader2,
  Layers,
  Bot,
  RotateCcw,
  ChevronRight,
  AlertCircle,
  SkipForward,
  HeartPulse,
  BookOpen,
  Inbox,
  XCircle,
  MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useGSDWorkspaceState, buildProjectUrl } from "@/lib/gsd-workspace-store"
import type {
  VisualizerData,
  VisualizerSlice,
  VisualizerTask,
  ProjectTotals,
} from "@/lib/visualizer-types"
import {
  formatCost,
  formatTokenCount,
  formatDuration,
  getCaptureStatusCounts,
} from "@/lib/visualizer-types"
import { authFetch } from "@/lib/auth"

// ─── Design Tokens ────────────────────────────────────────────────────────────

// Tab definitions — single source of truth
const TABS = [
  { value: "progress", label: "Progress",     Icon: Layers    },
  { value: "timeline", label: "Timeline",     Icon: Clock     },
  { value: "deps",     label: "Dependencies", Icon: GitBranch },
  { value: "metrics",  label: "Metrics",      Icon: BarChart3 },
  { value: "health",   label: "Health",       Icon: HeartPulse },
  { value: "agent",    label: "Agent",        Icon: Bot       },
  { value: "changes",  label: "Changes",      Icon: Activity  },
  { value: "knowledge", label: "Knowledge",   Icon: BookOpen  },
  { value: "captures", label: "Captures",     Icon: Inbox     },
  { value: "export",   label: "Export",       Icon: Download  },
] as const

type TabValue = (typeof TABS)[number]["value"]

// ─── Shared Primitives ────────────────────────────────────────────────────────

function statusIcon(status: "complete" | "active" | "pending" | "done" | "parked") {
  switch (status) {
    case "complete":
    case "done":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
    case "active":
      return <Play className="h-4 w-4 shrink-0 text-info" />
    case "pending":
      return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    case "parked":
      return <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
}

function taskStatusIcon(task: VisualizerTask) {
  if (task.done)   return statusIcon("done")
  if (task.active) return statusIcon("active")
  return statusIcon("pending")
}

function RiskBadge({ risk }: { risk: string }) {
  const color =
    risk === "high"
      ? "bg-destructive/15 text-destructive border-destructive/25 ring-destructive/10"
      : risk === "medium"
        ? "bg-warning/15 text-warning border-warning/25 ring-warning/10"
        : "bg-success/15 text-success border-success/25 ring-success/10"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest",
        color,
      )}
    >
      {risk}
    </span>
  )
}

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  if (diff < 60_000) return "just now"
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "unknown"
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function findVerification(data: VisualizerData, milestoneId: string, sliceId: string) {
  return data.sliceVerifications.find((v) => v.milestoneId === milestoneId && v.sliceId === sliceId)
}

function verificationTone(result: string) {
  if (result === "passed") return "text-success border-success/25 bg-success/10"
  if (result === "failed") return "text-destructive border-destructive/25 bg-destructive/10"
  return "text-muted-foreground border-border bg-muted/50"
}

function matchesQuery(value: unknown, query: string): boolean {
  if (value == null) return false
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().includes(query)
  }
  if (Array.isArray(value)) return value.some((item) => matchesQuery(item, query))
  if (typeof value === "object") return Object.values(value).some((item) => matchesQuery(item, query))
  return false
}

function filterRecord<T>(items: T[], query: string): T[] {
  return items.filter((item) => matchesQuery(item, query))
}

function filterVisualizerData(data: VisualizerData, rawQuery: string): VisualizerData {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return data

  const milestones = data.milestones
    .map((milestone) => {
      if (matchesQuery({ ...milestone, slices: [] }, query)) return milestone

      const slices = milestone.slices
        .map((slice) => {
          if (matchesQuery({ ...slice, tasks: [] }, query)) return slice
          const tasks = filterRecord(slice.tasks, query)
          return tasks.length > 0 ? { ...slice, tasks } : null
        })
        .filter((slice): slice is VisualizerSlice => slice != null)

      return slices.length > 0 ? { ...milestone, slices } : null
    })
    .filter((milestone): milestone is VisualizerData["milestones"][number] => milestone != null)

  const missingSlices = filterRecord(data.stats.missingSlices, query)
  const updatedSlices = filterRecord(data.stats.updatedSlices, query)
  const recentEntries = filterRecord(data.stats.recentEntries, query)
  const captureEntries = filterRecord(data.captures.entries, query)

  return {
    ...data,
    milestones,
    byPhase: filterRecord(data.byPhase, query),
    bySlice: filterRecord(data.bySlice, query),
    byModel: filterRecord(data.byModel, query),
    byTier: filterRecord(data.byTier, query),
    units: filterRecord(data.units, query),
    changelog: {
      ...data.changelog,
      entries: filterRecord(data.changelog.entries, query),
    },
    sliceVerifications: filterRecord(data.sliceVerifications, query),
    knowledge: {
      ...data.knowledge,
      rules: filterRecord(data.knowledge.rules, query),
      patterns: filterRecord(data.knowledge.patterns, query),
      lessons: filterRecord(data.knowledge.lessons, query),
    },
    captures: {
      ...data.captures,
      entries: captureEntries,
      pendingCount: captureEntries.filter((entry) => entry.status === "pending").length,
      totalCount: captureEntries.length,
    },
    health: {
      ...data.health,
      tierBreakdown: filterRecord(data.health.tierBreakdown, query),
      providers: filterRecord(data.health.providers, query),
      environmentIssues: filterRecord(data.health.environmentIssues, query),
      doctorHistory: data.health.doctorHistory
        ? filterRecord(data.health.doctorHistory, query)
        : data.health.doctorHistory,
    },
    discussion: filterRecord(data.discussion, query),
    stats: {
      ...data.stats,
      missingCount: missingSlices.length,
      missingSlices,
      updatedCount: updatedSlices.length,
      updatedSlices,
      recentEntries,
    },
  }
}

/** Prominent section label with left accent bar */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-3.5 w-0.5 rounded-full bg-foreground/25" />
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </h3>
    </div>
  )
}

/** Large empty state with icon */
function EmptyState({ message, icon: Icon = AlertCircle }: { message: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
      <div className="rounded-full border border-border bg-muted/50 p-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  )
}

/** Metric card — key number with label */
function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: "sky" | "emerald" | "amber" | "default"
}) {
  const accentClasses = {
    sky:     "from-info/8 border-info/20",
    emerald: "from-success/8 border-success/20",
    amber:   "from-warning/8 border-warning/20",
    default: "from-transparent border-border",
  }[accent ?? "default"]

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border bg-gradient-to-br to-transparent p-5",
      accentClasses,
    )}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums leading-none tracking-tight">
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  )
}

/** Horizontal progress bar with label */
function ProgressBar({
  value,
  max,
  color = "sky",
  animated = false,
}: {
  value: number
  max: number
  color?: "sky" | "emerald" | "amber"
  animated?: boolean
}) {
  const pct = max > 0 ? Math.max(1, (value / max) * 100) : 0
  const barColor = { sky: "bg-info", emerald: "bg-success", amber: "bg-warning" }[color]
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all duration-700", barColor, animated && "animate-pulse")}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function FeatureSnapshot({ data }: { data: VisualizerData }) {
  const stats = data.stats
  const hasPreview =
    stats.missingSlices.length > 0 ||
    stats.updatedSlices.length > 0 ||
    stats.recentEntries.length > 0

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <SectionLabel>Feature Snapshot</SectionLabel>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Missing Slices" value={String(stats.missingCount)} accent={stats.missingCount > 0 ? "amber" : "emerald"} />
        <StatCard label="Updated This Week" value={String(stats.updatedCount)} accent="sky" />
        <StatCard label="Recent Completions" value={String(stats.recentEntries.length)} accent="emerald" />
      </div>

      {hasPreview && (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {stats.missingSlices.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Missing</p>
              <div className="space-y-2">
                {stats.missingSlices.map((slice) => (
                  <div key={`${slice.milestoneId}-${slice.sliceId}`} className="rounded-lg bg-muted/50 px-3 py-2">
                    <p className="font-mono text-xs font-semibold">{slice.milestoneId}/{slice.sliceId}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{slice.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.updatedSlices.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Updated</p>
              <div className="space-y-2">
                {stats.updatedSlices.map((slice) => (
                  <div key={`${slice.milestoneId}-${slice.sliceId}`} className="rounded-lg bg-muted/50 px-3 py-2">
                    <p className="font-mono text-xs font-semibold">{slice.milestoneId}/{slice.sliceId}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatDate(slice.completedAt)} · {slice.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.recentEntries.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Recent</p>
              <div className="space-y-2">
                {stats.recentEntries.map((entry) => (
                  <div key={`${entry.milestoneId}-${entry.sliceId}`} className="rounded-lg bg-muted/50 px-3 py-2">
                    <p className="font-mono text-xs font-semibold">{entry.milestoneId}/{entry.sliceId}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {entry.oneLiner || entry.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DiscussionStatus({ data }: { data: VisualizerData }) {
  if (data.discussion.length === 0) return null

  const counts = data.discussion.reduce(
    (acc, item) => {
      acc[item.state] += 1
      return acc
    },
    { discussed: 0, draft: 0, undiscussed: 0 },
  )

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionLabel>Discussion Status</SectionLabel>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-md bg-success/10 px-2 py-1 text-success">Discussed {counts.discussed}</span>
          <span className="rounded-md bg-warning/10 px-2 py-1 text-warning">Draft {counts.draft}</span>
          <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Pending {counts.undiscussed}</span>
        </div>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {data.discussion.map((item) => {
          const tone =
            item.state === "discussed"
              ? "text-success bg-success/10"
              : item.state === "draft"
                ? "text-warning bg-warning/10"
                : "text-muted-foreground bg-muted"
          return (
            <div key={item.milestoneId} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs font-semibold">{item.milestoneId}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
              <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", tone)}>
                {item.state}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Progress Tab ─────────────────────────────────────────────────────────────

function ProgressTab({ data }: { data: VisualizerData }) {
  if (data.milestones.length === 0) {
    return <EmptyState message="No milestones defined yet." icon={Layers} />
  }

  const allSlices = data.milestones.flatMap((m) => m.slices)
  const riskCounts = { low: 0, medium: 0, high: 0 }
  for (const sl of allSlices) {
    if (sl.risk === "high") riskCounts.high++
    else if (sl.risk === "medium") riskCounts.medium++
    else riskCounts.low++
  }

  return (
    <div className="space-y-6">
      {/* Risk Heatmap */}
      {allSlices.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Risk Heatmap</SectionLabel>
          <div className="mt-5 space-y-3">
            {data.milestones
              .filter((m) => m.slices.length > 0)
              .map((ms) => (
                <div key={ms.id} className="flex items-center gap-4">
                  <span className="w-16 shrink-0 font-mono text-xs font-medium text-muted-foreground">
                    {ms.id}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ms.slices.map((sl) => (
                      <div
                        key={sl.id}
                        title={`${sl.id}: ${sl.title} (${sl.risk})`}
                        className={cn(
                          "h-6 w-6 rounded cursor-default transition-transform hover:scale-125",
                          sl.risk === "high"
                            ? "bg-destructive"
                            : sl.risk === "medium"
                              ? "bg-warning"
                              : "bg-success",
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-5 flex items-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-success" />
              Low ({riskCounts.low})
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-warning" />
              Medium ({riskCounts.medium})
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-destructive" />
              High ({riskCounts.high})
            </span>
          </div>
        </div>
      )}

      <FeatureSnapshot data={data} />
      <DiscussionStatus data={data} />

      {/* Milestone tree */}
      <div className="space-y-4">
        {data.milestones.map((ms) => (
          <div key={ms.id} className="overflow-hidden rounded-xl border border-border bg-card">
            {/* Milestone header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-4">
              <div className="flex items-center gap-3">
                {statusIcon(ms.status)}
                <span className="font-mono text-xs font-semibold text-muted-foreground">{ms.id}</span>
                <span className="text-sm font-semibold">{ms.title}</span>
              </div>
              <span
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
                  ms.status === "complete"
                    ? "bg-success/15 text-success"
                    : ms.status === "active"
                      ? "bg-info/15 text-info"
                      : ms.status === "parked"
                        ? "bg-warning/15 text-warning"
                        : "bg-muted text-muted-foreground",
                )}
              >
                {ms.status}
              </span>
            </div>

            {(ms.status === "pending" || ms.status === "parked") && ms.dependsOn.length > 0 && (
              <div className="px-5 py-2.5 text-xs text-muted-foreground border-b border-border/50">
                Depends on {ms.dependsOn.join(", ")}
              </div>
            )}

            {/* Slices */}
            {ms.slices.length > 0 && (
              <div className="divide-y divide-border/50">
                {ms.slices.map((sl) => {
                  const doneTasks = sl.tasks.filter((t) => t.done).length
                  const slStatus = sl.done ? "done" : sl.active ? "active" : "pending"
                  const verification = findVerification(data, ms.id, sl.id)
                  return (
                    <div key={sl.id} className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {statusIcon(slStatus)}
                        <span className="font-mono text-xs font-medium text-muted-foreground">{sl.id}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{sl.title}</span>
                        <div className="flex shrink-0 items-center gap-2.5">
                          {verification && (
                            <span className={cn(
                              "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                              verificationTone(verification.verificationResult),
                            )}>
                              {verification.verificationResult || "untested"}
                              {verification.blockerDiscovered ? " · blocker" : ""}
                            </span>
                          )}
                          {sl.depends.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              deps: {sl.depends.join(", ")}
                            </span>
                          )}
                          {sl.tasks.length > 0 && (
                            <span className="font-mono text-xs font-medium text-muted-foreground">
                              {doneTasks}/{sl.tasks.length}
                            </span>
                          )}
                          <RiskBadge risk={sl.risk} />
                        </div>
                      </div>

                      {/* Tasks — only shown for active or partially-done slices */}
                      {(sl.active || sl.tasks.some((t) => t.active)) && sl.tasks.length > 0 && (
                        <div className="ml-7 mt-3 space-y-1">
                          {sl.tasks.map((task) => (
                            <div
                              key={task.id}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors",
                                task.active
                                  ? "bg-info/8 border border-info/20"
                                  : "hover:bg-muted/50",
                              )}
                            >
                              {taskStatusIcon(task)}
                              <span className="font-mono text-xs font-medium text-muted-foreground">{task.id}</span>
                              <span
                                className={cn(
                                  "text-sm",
                                  task.done && "text-muted-foreground line-through",
                                  task.active && "font-semibold text-info",
                                  !task.done && !task.active && "text-muted-foreground",
                                )}
                              >
                                {task.title}
                              </span>
                              {task.estimate && (
                                <span className="ml-auto font-mono text-xs text-muted-foreground">{task.estimate}</span>
                              )}
                              {task.active && (
                                <span className="rounded-md bg-info/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-info">
                                  running
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Deps Tab ─────────────────────────────────────────────────────────────────

function DataFlowSection({ data }: { data: VisualizerData }) {
  const provided = data.sliceVerifications.filter((v) => v.provides.length > 0)
  const required = data.sliceVerifications.filter((v) => v.requires.length > 0)

  if (provided.length === 0 && required.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <SectionLabel>Data Flow</SectionLabel>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {provided.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold text-muted-foreground">Provides</p>
            <div className="space-y-2">
              {provided.flatMap((verification) =>
                verification.provides.map((artifact) => (
                  <div key={`${verification.milestoneId}-${verification.sliceId}-${artifact}`} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    <span className="font-mono text-xs font-semibold">{verification.sliceId}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-sm text-muted-foreground">{artifact}</span>
                  </div>
                )),
              )}
            </div>
          </div>
        )}

        {required.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold text-muted-foreground">Requires</p>
            <div className="space-y-2">
              {required.flatMap((verification) =>
                verification.requires.map((requirement) => (
                  <div key={`${verification.milestoneId}-${verification.sliceId}-${requirement.slice}-${requirement.provides}`} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    <span className="truncate text-sm text-muted-foreground">{requirement.provides}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs font-semibold">{requirement.slice}</span>
                  </div>
                )),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DepsTab({ data }: { data: VisualizerData }) {
  const cp = data.criticalPath
  const activeMs = data.milestones.find((m) => m.status === "active")
  const milestoneDeps = data.milestones.filter((m) => m.dependsOn.length > 0)

  return (
    <div className="space-y-6">
      {/* Milestone Dependencies */}
      <div className="rounded-xl border border-border bg-card p-6">
        <SectionLabel>Milestone Dependencies</SectionLabel>
        <div className="mt-5">
          {milestoneDeps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No milestone dependencies configured.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {milestoneDeps.flatMap((ms) =>
                ms.dependsOn.map((dep) => (
                  <div key={`${dep}-${ms.id}`} className="flex items-center gap-3">
                    <span className="rounded-lg border border-info/25 bg-info/10 px-3 py-1.5 font-mono text-sm font-semibold text-info">
                      {dep}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-sm font-medium">
                      {ms.id}
                    </span>
                    <span className="text-sm text-muted-foreground">{ms.title}</span>
                  </div>
                )),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Slice Dependencies */}
      <div className="rounded-xl border border-border bg-card p-6">
        <SectionLabel>Slice Dependencies — Active Milestone</SectionLabel>
        <div className="mt-5">
          {!activeMs ? (
            <p className="text-sm text-muted-foreground">No active milestone.</p>
          ) : (
            (() => {
              const slDeps = activeMs.slices.filter((s) => s.depends.length > 0)
              if (slDeps.length === 0)
                return <p className="text-sm text-muted-foreground">No slice dependencies in {activeMs.id}.</p>
              return (
                <div className="flex flex-col gap-3">
                  {slDeps.flatMap((sl) =>
                    sl.depends.map((dep) => (
                      <div key={`${dep}-${sl.id}`} className="flex items-center gap-3">
                        <span className="rounded-lg border border-info/25 bg-info/10 px-3 py-1.5 font-mono text-sm font-semibold text-info">
                          {dep}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-sm font-medium">
                          {sl.id}
                        </span>
                        <span className="text-sm text-muted-foreground">{sl.title}</span>
                      </div>
                    )),
                  )}
                </div>
              )
            })()
          )}
        </div>
      </div>

      <DataFlowSection data={data} />

      {/* Critical Path */}
      <div className="rounded-xl border border-border bg-card p-6">
        <SectionLabel>Critical Path</SectionLabel>
        <div className="mt-5">
          {cp.milestonePath.length === 0 ? (
            <p className="text-sm text-muted-foreground">No critical path data.</p>
          ) : (
            <div className="space-y-7">
              {/* Milestone chain */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Milestone Chain
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {cp.milestonePath.map((id, i) => (
                    <span key={id} className="flex items-center gap-2">
                      <span className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 font-mono text-sm font-bold text-destructive">
                        {id}
                      </span>
                      {i < cp.milestonePath.length - 1 && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Milestone slack */}
              {Object.keys(cp.milestoneSlack).length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Milestone Slack
                  </p>
                  <div className="flex flex-col gap-2">
                    {data.milestones
                      .filter((m) => !cp.milestonePath.includes(m.id))
                      .map((m) => (
                        <div key={m.id} className="flex items-center gap-4 rounded-lg bg-muted/50 px-4 py-2.5">
                          <span className="w-16 font-mono text-sm font-semibold">{m.id}</span>
                          <span className="text-sm text-muted-foreground">{m.title}</span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">
                            slack: {cp.milestoneSlack[m.id] ?? 0}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Slice critical path */}
              {cp.slicePath.length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Slice Critical Path
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {cp.slicePath.map((id, i) => (
                      <span key={id} className="flex items-center gap-2">
                        <span className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 font-mono text-sm font-semibold text-warning">
                          {id}
                        </span>
                        {i < cp.slicePath.length - 1 && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    ))}
                  </div>
                  {/* Bottleneck warnings */}
                  {activeMs && (
                    <div className="mt-3 space-y-2">
                      {cp.slicePath
                        .map((sid) => activeMs.slices.find((s) => s.id === sid))
                        .filter(
                          (sl): sl is VisualizerSlice => sl != null && !sl.done && !sl.active,
                        )
                        .map((sl) => (
                          <div
                            key={sl.id}
                            className="flex items-center gap-2.5 rounded-lg border border-warning/20 bg-warning/8 px-4 py-2.5 text-sm text-warning"
                          >
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="font-mono font-semibold">{sl.id}</span>
                            <span>is on the critical path but not yet started</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Slice slack */}
              {Object.keys(cp.sliceSlack).length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Slice Slack
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(cp.sliceSlack).map(([id, slack]) => (
                      <span
                        key={id}
                        className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-xs text-muted-foreground"
                      >
                        {id}: {slack}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Metrics Tab ──────────────────────────────────────────────────────────────

function MetricsTab({ data }: { data: VisualizerData }) {
  if (!data.totals) {
    return <EmptyState message="No metrics data available." icon={BarChart3} />
  }

  const totals = data.totals

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Execution Units" value={String(totals.units)} accent="default" />
        <StatCard label="Total Cost"    value={formatCost(totals.cost)}          accent="emerald" />
        <StatCard label="Duration"      value={formatDuration(totals.duration)}  accent="sky" />
        <StatCard
          label="Total Tokens"
          value={formatTokenCount(totals.tokens.total)}
          sub={`${formatTokenCount(totals.tokens.input)} in · ${formatTokenCount(totals.tokens.output)} out`}
          accent="amber"
        />
      </div>

      {/* By Phase */}
      {data.byPhase.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Cost by Phase</SectionLabel>
          <div className="mt-5 space-y-5">
            {data.byPhase.map((phase) => {
              const pct = totals.cost > 0 ? (phase.cost / totals.cost) * 100 : 0
              return (
                <div key={phase.phase}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">{phase.phase}</span>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">{formatCost(phase.cost)}</span>
                      <span>{pct.toFixed(1)}%</span>
                      <span>{formatTokenCount(phase.tokens.total)} tok</span>
                      <span>{phase.units} units</span>
                    </div>
                  </div>
                  <ProgressBar value={pct} max={100} color="sky" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* By Model */}
      {data.byModel.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Cost by Model</SectionLabel>
          <div className="mt-5 space-y-5">
            {data.byModel.map((model) => {
              const pct = totals.cost > 0 ? (model.cost / totals.cost) * 100 : 0
              return (
                <div key={model.model}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{model.model}</span>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">{formatCost(model.cost)}</span>
                      <span>{pct.toFixed(1)}%</span>
                      <span>{formatTokenCount(model.tokens.total)} tok</span>
                      <span>{model.units} units</span>
                    </div>
                  </div>
                  <ProgressBar value={pct} max={100} color="emerald" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* By Tier */}
      {data.byTier.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Cost by Routing Tier</SectionLabel>
          <div className="mt-5 space-y-5">
            {data.byTier.map((tier) => {
              const pct = totals.cost > 0 ? (tier.cost / totals.cost) * 100 : 0
              return (
                <div key={tier.tier}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{tier.tier}</span>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">{formatCost(tier.cost)}</span>
                      <span>{pct.toFixed(1)}%</span>
                      <span>{tier.units} units</span>
                      {tier.downgraded > 0 && <span>{tier.downgraded} downgraded</span>}
                    </div>
                  </div>
                  <ProgressBar value={pct} max={100} color="amber" />
                </div>
              )
            })}
          </div>
          {data.tierSavingsLine && (
            <div className="mt-5 rounded-lg border border-success/20 bg-success/8 px-4 py-3 text-sm text-success">
              {data.tierSavingsLine}
            </div>
          )}
        </div>
      )}

      {/* By Slice */}
      {data.bySlice.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Cost by Slice</SectionLabel>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <th className="pb-3 pr-5">Slice</th>
                  <th className="pb-3 pr-5 text-right">Units</th>
                  <th className="pb-3 pr-5 text-right">Cost</th>
                  <th className="pb-3 pr-5 text-right">Duration</th>
                  <th className="pb-3 text-right">Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.bySlice.map((sl) => (
                  <tr key={sl.sliceId} className="transition-colors hover:bg-muted/50">
                    <td className="py-3 pr-5 font-mono text-xs font-semibold">{sl.sliceId}</td>
                    <td className="py-3 pr-5 text-right tabular-nums text-muted-foreground">{sl.units}</td>
                    <td className="py-3 pr-5 text-right tabular-nums font-medium">{formatCost(sl.cost)}</td>
                    <td className="py-3 pr-5 text-right tabular-nums text-muted-foreground">{formatDuration(sl.duration)}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{formatTokenCount(sl.tokens.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Projections */}
      {data.bySlice.length >= 2 && <ProjectionsSection data={data} totals={totals} />}
    </div>
  )
}

function ProjectionsSection({
  data,
  totals,
}: {
  data: VisualizerData
  totals: ProjectTotals
}) {
  const sliceLevelEntries = data.bySlice.filter((s) => s.sliceId.includes("/"))
  if (sliceLevelEntries.length < 2) return null

  const totalSliceCost = sliceLevelEntries.reduce((sum, s) => sum + s.cost, 0)
  const avgCostPerSlice = totalSliceCost / sliceLevelEntries.length
  const projectedRemaining = avgCostPerSlice * data.remainingSliceCount
  const projectedTotal = totals.cost + projectedRemaining
  const burnRate = totals.duration > 0 ? totals.cost / (totals.duration / 3_600_000) : 0

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <SectionLabel>Projections</SectionLabel>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Avg / Slice"        value={formatCost(avgCostPerSlice)} />
        <StatCard
          label="Projected Remaining"
          value={formatCost(projectedRemaining)}
          sub={`${data.remainingSliceCount} slices left`}
        />
        <StatCard label="Projected Total" value={formatCost(projectedTotal)} />
        {burnRate > 0 && (
          <StatCard label="Burn Rate" value={`${formatCost(burnRate)}/hr`} />
        )}
      </div>
      {projectedTotal > 2 * totals.cost && data.remainingSliceCount > 0 && (
        <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-warning/20 bg-warning/8 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Projected total {formatCost(projectedTotal)} exceeds 2× current spend
        </div>
      )}
    </div>
  )
}

// ─── Health Tab ───────────────────────────────────────────────────────────────

function HealthTab({ data }: { data: VisualizerData }) {
  const health = data.health
  const currentSpend = data.totals?.cost ?? 0
  const budgetPct = health.budgetCeiling && health.budgetCeiling > 0
    ? Math.min(100, (currentSpend / health.budgetCeiling) * 100)
    : 0
  const failedProviders = health.providers.filter((provider) => !provider.ok)
  const doctorHistory = health.doctorHistory ?? []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Budget" value={health.budgetCeiling !== undefined ? formatCost(health.budgetCeiling) : "unset"} sub={formatCost(currentSpend)} accent={budgetPct >= 90 ? "amber" : "emerald"} />
        <StatCard label="Token Profile" value={health.tokenProfile} accent="sky" />
        <StatCard label="Tool Calls" value={String(health.toolCalls)} />
        <StatCard label="Pending Captures" value={String(data.captures.pendingCount)} accent={data.captures.pendingCount > 0 ? "amber" : "default"} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <SectionLabel>Budget Pressure</SectionLabel>
        <div className="mt-5 space-y-5">
          {health.budgetCeiling !== undefined ? (
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Spend</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatCost(currentSpend)} / {formatCost(health.budgetCeiling)}
                </span>
              </div>
              <ProgressBar value={budgetPct} max={100} color={budgetPct >= 90 ? "amber" : "emerald"} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No budget ceiling set.</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Truncation</span>
                <span className="font-mono text-xs text-muted-foreground">{health.truncationRate.toFixed(1)}%</span>
              </div>
              <ProgressBar value={Math.min(health.truncationRate, 100)} max={100} color={health.truncationRate >= 30 ? "amber" : "sky"} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Continue-here</span>
                <span className="font-mono text-xs text-muted-foreground">{health.continueHereRate.toFixed(1)}%</span>
              </div>
              <ProgressBar value={Math.min(health.continueHereRate, 100)} max={100} color={health.continueHereRate >= 30 ? "amber" : "sky"} />
            </div>
          </div>
        </div>
      </div>

      {health.tierBreakdown.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Routing</SectionLabel>
          <div className="mt-5 space-y-3">
            {health.tierBreakdown.map((tier) => (
              <div key={tier.tier} className="flex items-center gap-4 rounded-lg bg-muted/50 px-4 py-3">
                <span className="w-24 font-mono text-xs font-semibold">{tier.tier}</span>
                <span className="text-sm text-muted-foreground">{tier.units} units</span>
                <span className="ml-auto font-mono text-sm font-medium">{formatCost(tier.cost)}</span>
                {tier.downgraded > 0 && (
                  <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs text-warning">
                    {tier.downgraded} downgraded
                  </span>
                )}
              </div>
            ))}
          </div>
          {health.tierSavingsLine && <p className="mt-4 text-sm text-success">{health.tierSavingsLine}</p>}
        </div>
      )}

      {(health.environmentIssues.length > 0 || failedProviders.length > 0 || health.skillSummary.total > 0) && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Readiness</SectionLabel>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Environment</p>
              {health.environmentIssues.length === 0 ? (
                <p className="text-sm text-success">No environment issues.</p>
              ) : (
                <div className="space-y-2">
                  {health.environmentIssues.map((issue) => (
                    <div key={`${issue.name}-${issue.message}`} className="rounded-lg bg-muted/50 px-3 py-2">
                      <p className={cn("text-sm font-medium", issue.status === "error" ? "text-destructive" : "text-warning")}>
                        {issue.message}
                      </p>
                      {issue.detail && <p className="mt-1 text-xs text-muted-foreground">{issue.detail}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Providers</p>
              {health.providers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No provider checks available.</p>
              ) : (
                <div className="space-y-2">
                  {health.providers.map((provider) => (
                    <div key={provider.name} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      {provider.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{provider.label}</p>
                        <p className="truncate text-xs text-muted-foreground">{provider.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">Skills</p>
              {health.skillSummary.total === 0 ? (
                <p className="text-sm text-muted-foreground">No skill report available.</p>
              ) : (
                <div className="rounded-lg bg-muted/50 px-3 py-3">
                  <p className="text-sm font-medium">{health.skillSummary.total} skills tracked</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {health.skillSummary.criticalCount} critical · {health.skillSummary.warningCount} warning
                  </p>
                  {health.skillSummary.topIssue && (
                    <p className="mt-3 text-xs text-warning">{health.skillSummary.topIssue}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {health.progressScore && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Progress Score</SectionLabel>
          <div className="mt-5 flex items-start gap-4">
            <div className={cn(
              "mt-1 h-3 w-3 rounded-full",
              health.progressScore.level === "green"
                ? "bg-success"
                : health.progressScore.level === "yellow"
                  ? "bg-warning"
                  : "bg-destructive",
            )} />
            <div>
              <p className="text-sm font-semibold">{health.progressScore.summary}</p>
              <div className="mt-3 space-y-1.5">
                {health.progressScore.signals.map((signal, index) => (
                  <p key={`${signal.kind}-${index}`} className="text-sm text-muted-foreground">
                    {signal.label}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {doctorHistory.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Doctor History</SectionLabel>
          <div className="mt-5 space-y-3">
            {doctorHistory.slice(0, 10).map((entry) => (
              <div key={`${entry.ts}-${entry.codes.join("-")}`} className="rounded-lg bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  {entry.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{entry.ts.replace("T", " ").slice(0, 19)}</span>
                  {entry.scope && <span className="rounded-md bg-info/10 px-2 py-0.5 text-xs text-info">{entry.scope}</span>}
                  <span className="min-w-0 truncate text-sm">{entry.summary || `${entry.errors} errors, ${entry.warnings} warnings, ${entry.fixes} fixes`}</span>
                </div>
                {entry.issues && entry.issues.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {entry.issues.slice(0, 3).map((issue) => (
                      <p key={`${issue.code}-${issue.unitId}-${issue.message}`} className="text-xs text-muted-foreground">
                        {issue.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({ data }: { data: VisualizerData }) {
  const sorted = [...data.units].sort((a, b) => a.startedAt - b.startedAt)
  const recent = sorted.slice(-30)
  const hasRunningUnit = recent.some((u) => !u.finishedAt || u.finishedAt === 0)
  const [runningNow, setRunningNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasRunningUnit) return
    const interval = window.setInterval(() => {
      setRunningNow(Date.now())
    }, 1000)
    return () => window.clearInterval(interval)
  }, [hasRunningUnit])

  const referenceNow = hasRunningUnit ? runningNow : 0
  const durationForUnit = useCallback(
    (unit: VisualizerData["units"][number]) => (unit.finishedAt || referenceNow) - unit.startedAt,
    [referenceNow],
  )

  if (data.units.length === 0) {
    return <EmptyState message="No execution history yet." icon={Clock} />
  }

  const maxDuration = Math.max(...recent.map(durationForUnit), 1)

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="border-b border-border bg-muted/50 px-6 py-4">
          <SectionLabel>Execution Timeline</SectionLabel>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Showing {recent.length} of {data.units.length} units — most recent first
          </p>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[3.5rem_1.5rem_5rem_8rem_1fr_4.5rem_5rem] items-center gap-3 border-b border-border/50 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <span>Time</span>
          <span />
          <span>Type</span>
          <span>ID</span>
          <span>Duration</span>
          <span className="text-right">Time</span>
          <span className="text-right">Cost</span>
        </div>

        <div className="divide-y divide-border/40">
          {[...recent].reverse().map((unit, i) => {
            const duration = durationForUnit(unit)
            const pct = (duration / maxDuration) * 100
            const isRunning = !unit.finishedAt || unit.finishedAt === 0
            return (
              <div
                key={`${unit.id}-${unit.startedAt}-${i}`}
                className="grid grid-cols-[3.5rem_1.5rem_5rem_8rem_1fr_4.5rem_5rem] items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/50"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {formatTime(unit.startedAt)}
                </span>
                {isRunning ? (
                  <Play className="h-3.5 w-3.5 shrink-0 text-info" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                )}
                <span className="truncate text-xs font-medium">{unit.type}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{unit.id}</span>
                <div className="hidden sm:block">
                  <ProgressBar
                    value={pct}
                    max={100}
                    color="sky"
                    animated={isRunning}
                  />
                </div>
                <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDuration(duration)}
                </span>
                <span className="text-right font-mono text-xs tabular-nums font-medium">
                  {formatCost(unit.cost)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Agent Tab ────────────────────────────────────────────────────────────────

function AgentTab({ data }: { data: VisualizerData }) {
  const activity = data.agentActivity

  if (!activity) {
    return <EmptyState message="No agent activity data available." icon={Bot} />
  }

  const completed = activity.completedUnits
  const total = Math.max(completed, activity.totalSlices)
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full",
              activity.active
                ? "bg-success/15"
                : "bg-muted",
            )}>
              {activity.active && (
                <div className="absolute inset-0 animate-ping rounded-full bg-success/20" />
              )}
              <div className={cn(
                "h-3 w-3 rounded-full",
                activity.active ? "bg-success" : "bg-muted-foreground/30",
              )} />
            </div>
            <div>
              <p className="text-xl font-bold">{activity.active ? "Active" : "Idle"}</p>
              <p className="text-sm text-muted-foreground">
                {activity.active ? "Agent is running" : "Waiting for next task"}
              </p>
            </div>
          </div>
          {activity.active && (
            <div className="text-right">
              <p className="font-mono text-lg font-bold">{formatDuration(activity.elapsed)}</p>
              <p className="text-xs text-muted-foreground">elapsed</p>
            </div>
          )}
        </div>

        {activity.currentUnit && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-info/20 bg-info/8 px-5 py-3.5">
            <Play className="h-4 w-4 shrink-0 text-info" />
            <div>
              <p className="text-xs text-muted-foreground">Currently executing</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-info">
                {activity.currentUnit.type} — {activity.currentUnit.id}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Truncation"
          value={`${data.health.truncationRate.toFixed(1)}%`}
          accent={data.health.truncationRate >= 30 ? "amber" : "default"}
        />
        <StatCard
          label="Continue-here"
          value={`${data.health.continueHereRate.toFixed(1)}%`}
          accent={data.health.continueHereRate >= 30 ? "amber" : "default"}
        />
        <StatCard
          label="Pending Captures"
          value={String(data.captures.pendingCount)}
          accent={data.captures.pendingCount > 0 ? "amber" : "default"}
        />
      </div>

      {/* Completion progress */}
      {total > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel>Completion Progress</SectionLabel>
            <span className="font-mono text-sm text-muted-foreground">
              {completed} / {total} slices
            </span>
          </div>
          <ProgressBar value={completed} max={total} color="emerald" />
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{pct}% complete</span>
            <span>{total - completed} remaining</span>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Completion Rate"
          value={activity.completionRate > 0 ? `${activity.completionRate.toFixed(1)}/hr` : "—"}
          accent="sky"
        />
        <StatCard label="Session Cost"   value={formatCost(activity.sessionCost)}               accent="emerald" />
        <StatCard label="Session Tokens" value={formatTokenCount(activity.sessionTokens)}        accent="amber" />
        <StatCard label="Completed"      value={String(activity.completedUnits)}                 />
      </div>

      {/* Recent units */}
      {data.units.filter((u) => u.finishedAt > 0).length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/50 px-6 py-4">
            <SectionLabel>Recent Completed Units</SectionLabel>
          </div>
          <div className="divide-y divide-border/40">
            {data.units
              .filter((u) => u.finishedAt > 0)
              .slice(-5)
              .reverse()
              .map((u, i) => (
                <div key={`${u.id}-${i}`} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50">
                  <span className="w-12 font-mono text-xs text-muted-foreground">{formatTime(u.startedAt)}</span>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  <span className="flex-1 truncate text-sm font-medium">{u.type}</span>
                  <span className="font-mono text-xs text-muted-foreground">{u.id}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(u.finishedAt - u.startedAt)}</span>
                  <span className="font-mono text-xs tabular-nums font-semibold">{formatCost(u.cost)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Changes Tab ──────────────────────────────────────────────────────────────

function ChangesTab({ data }: { data: VisualizerData }) {
  const entries = data.changelog.entries

  if (entries.length === 0) {
    return <EmptyState message="No completed slices yet." icon={Activity} />
  }

  const sorted = [...entries].reverse()

  return (
    <div className="space-y-4">
      {sorted.map((entry, i) => {
        const verification = findVerification(data, entry.milestoneId, entry.sliceId)

        return (
        <div key={`${entry.milestoneId}-${entry.sliceId}-${i}`} className="overflow-hidden rounded-xl border border-border bg-card">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-6 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span className="font-mono text-xs font-bold text-success">
                {entry.milestoneId}/{entry.sliceId}
              </span>
              <span className="text-sm font-semibold">{entry.title}</span>
            </div>
            {entry.completedAt && (
              <span className="text-xs text-muted-foreground">{formatRelative(entry.completedAt)}</span>
            )}
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* One-liner */}
            {entry.oneLiner && (
              <p className="text-sm text-muted-foreground italic leading-relaxed border-l-2 border-muted pl-4">
                &ldquo;{entry.oneLiner}&rdquo;
              </p>
            )}

            {/* Files modified */}
            {entry.filesModified.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Files Modified
                </p>
                <div className="space-y-2">
                  {entry.filesModified.map((f, fi) => (
                    <div key={fi} className="flex items-start gap-3 rounded-lg bg-muted/50 px-4 py-2.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success/70" />
                      <span className="font-mono text-xs font-medium text-muted-foreground">{f.path}</span>
                      {f.description && (
                        <span className="ml-1 text-xs text-muted-foreground">— {f.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verification && (verification.keyDecisions.length > 0 || verification.patternsEstablished.length > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                {verification.keyDecisions.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Decisions
                    </p>
                    <div className="space-y-2">
                      {verification.keyDecisions.map((decision, idx) => (
                        <p key={idx} className="rounded-lg bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
                          {decision}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {verification.patternsEstablished.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Patterns
                    </p>
                    <div className="space-y-2">
                      {verification.patternsEstablished.map((pattern, idx) => (
                        <p key={idx} className="rounded-lg bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
                          {pattern}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )
      })}
    </div>
  )
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────────

function KnowledgeTab({ data }: { data: VisualizerData }) {
  const knowledge = data.knowledge

  if (!knowledge.exists) {
    return <EmptyState message="No project knowledge file found." icon={BookOpen} />
  }

  if (knowledge.rules.length === 0 && knowledge.patterns.length === 0 && knowledge.lessons.length === 0) {
    return <EmptyState message="Project knowledge exists but has no entries yet." icon={BookOpen} />
  }

  return (
    <div className="space-y-6">
      {knowledge.rules.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Rules</SectionLabel>
          <div className="mt-5 space-y-3">
            {knowledge.rules.map((rule) => (
              <div key={rule.id} className="rounded-lg bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-info">{rule.id}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{rule.scope}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{rule.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {knowledge.patterns.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Patterns</SectionLabel>
          <div className="mt-5 space-y-3">
            {knowledge.patterns.map((pattern) => (
              <div key={pattern.id} className="rounded-lg bg-muted/50 px-4 py-3">
                <p className="font-mono text-xs font-semibold text-info">{pattern.id}</p>
                <p className="mt-2 text-sm text-muted-foreground">{pattern.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {knowledge.lessons.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionLabel>Lessons Learned</SectionLabel>
          <div className="mt-5 space-y-3">
            {knowledge.lessons.map((lesson) => (
              <div key={lesson.id} className="rounded-lg bg-muted/50 px-4 py-3">
                <p className="font-mono text-xs font-semibold text-info">{lesson.id}</p>
                <p className="mt-2 text-sm text-muted-foreground">{lesson.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Captures Tab ─────────────────────────────────────────────────────────────

function captureClassTone(classification: string | undefined) {
  if (classification === "inject" || classification === "stop") return "text-warning bg-warning/10"
  if (classification === "replan" || classification === "backtrack") return "text-destructive bg-destructive/10"
  if (classification === "quick-task") return "text-info bg-info/10"
  return "text-muted-foreground bg-muted"
}

function CapturesTab({ data }: { data: VisualizerData }) {
  const captures = data.captures
  const counts = getCaptureStatusCounts(captures)
  const sorted = [...captures.entries].sort((a, b) => {
    const order = { pending: 0, triaged: 1, resolved: 2 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={String(captures.totalCount)} />
        <StatCard label="Pending" value={String(counts.pending)} accent={counts.pending > 0 ? "amber" : "default"} />
        <StatCard label="Triaged" value={String(counts.triaged)} accent="sky" />
        <StatCard label="Resolved" value={String(counts.resolved)} accent="emerald" />
      </div>

      {sorted.length === 0 ? (
        <EmptyState message="No captures recorded yet." icon={Inbox} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/50 px-6 py-4">
            <SectionLabel>Captured Notes</SectionLabel>
          </div>
          <div className="divide-y divide-border/40">
            {sorted.map((entry) => {
              const statusTone =
                entry.status === "pending"
                  ? "text-warning bg-warning/10"
                  : entry.status === "triaged"
                    ? "text-info bg-info/10"
                    : "text-success bg-success/10"

              return (
                <div key={entry.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-bold text-info">{entry.id}</span>
                    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", statusTone)}>
                      {entry.status}
                    </span>
                    {entry.classification && (
                      <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", captureClassTone(entry.classification))}>
                        {entry.classification}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(entry.timestamp)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.text}</p>
                  {(entry.rationale || entry.resolution) && (
                    <div className="mt-3 rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                      {entry.rationale && <p>Rationale: {entry.rationale}</p>}
                      {entry.resolution && <p className="mt-1">Resolution: {entry.resolution}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export Tab ───────────────────────────────────────────────────────────────

function ExportTab({ data }: { data: VisualizerData }) {
  const downloadBlob = useCallback(
    (content: string, filename: string, mimeType: string) => {
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    [],
  )

  const generateMarkdown = useCallback(() => {
    const lines: string[] = []
    lines.push("# GSD Workflow Report")
    lines.push("")
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push(`Phase: ${data.phase}`)
    lines.push("")
    lines.push("## Milestones")
    lines.push("")
    for (const ms of data.milestones) {
      const icon = ms.status === "complete" ? "✓" : ms.status === "active" ? "▸" : "○"
      lines.push(`### ${icon} ${ms.id}: ${ms.title} (${ms.status})`)
      if (ms.dependsOn.length > 0) lines.push(`Depends on: ${ms.dependsOn.join(", ")}`)
      lines.push("")
      for (const sl of ms.slices) {
        const slIcon = sl.done ? "✓" : sl.active ? "▸" : "○"
        lines.push(`- ${slIcon} **${sl.id}**: ${sl.title} [risk: ${sl.risk}]`)
        for (const t of sl.tasks) {
          const tIcon = t.done ? "✓" : t.active ? "▸" : "○"
          lines.push(`  - ${tIcon} ${t.id}: ${t.title}`)
        }
      }
      lines.push("")
    }
    if (data.totals) {
      lines.push("## Metrics Summary")
      lines.push("")
      lines.push(`| Metric | Value |`)
      lines.push(`|--------|-------|`)
      lines.push(`| Units | ${data.totals.units} |`)
      lines.push(`| Total Cost | ${formatCost(data.totals.cost)} |`)
      lines.push(`| Duration | ${formatDuration(data.totals.duration)} |`)
      lines.push(`| Tokens | ${formatTokenCount(data.totals.tokens.total)} |`)
      lines.push("")
    }
    if (data.byTier.length > 0) {
      lines.push("## Routing Tiers")
      lines.push("")
      lines.push("| Tier | Units | Cost | Downgraded |")
      lines.push("|------|-------|------|------------|")
      for (const tier of data.byTier) {
        lines.push(`| ${tier.tier} | ${tier.units} | ${formatCost(tier.cost)} | ${tier.downgraded} |`)
      }
      if (data.tierSavingsLine) lines.push(`\n${data.tierSavingsLine}`)
      lines.push("")
    }
    lines.push("## Health")
    lines.push("")
    lines.push(`| Signal | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Token profile | ${data.health.tokenProfile} |`)
    lines.push(`| Truncation | ${data.health.truncationRate.toFixed(1)}% |`)
    lines.push(`| Continue-here | ${data.health.continueHereRate.toFixed(1)}% |`)
    lines.push(`| Pending captures | ${data.captures.pendingCount} |`)
    if (data.health.progressScore) {
      lines.push(`| Progress score | ${data.health.progressScore.level}: ${data.health.progressScore.summary} |`)
    }
    lines.push("")
    if (data.criticalPath.milestonePath.length > 0) {
      lines.push("## Critical Path")
      lines.push("")
      lines.push(`Milestone: ${data.criticalPath.milestonePath.join(" → ")}`)
      if (data.criticalPath.slicePath.length > 0) {
        lines.push(`Slice: ${data.criticalPath.slicePath.join(" → ")}`)
      }
      lines.push("")
    }
    if (data.knowledge.exists) {
      lines.push("## Knowledge")
      lines.push("")
      for (const rule of data.knowledge.rules) lines.push(`- Rule ${rule.id} [${rule.scope}]: ${rule.content}`)
      for (const pattern of data.knowledge.patterns) lines.push(`- Pattern ${pattern.id}: ${pattern.content}`)
      for (const lesson of data.knowledge.lessons) lines.push(`- Lesson ${lesson.id}: ${lesson.content}`)
      lines.push("")
    }
    if (data.captures.entries.length > 0) {
      lines.push("## Captures")
      lines.push("")
      for (const capture of data.captures.entries) {
        const classification = capture.classification ? `, ${capture.classification}` : ""
        lines.push(`- **${capture.id}** (${capture.status}${classification}): ${capture.text}`)
      }
      lines.push("")
    }
    if (data.changelog.entries.length > 0) {
      lines.push("## Changelog")
      lines.push("")
      for (const entry of data.changelog.entries) {
        lines.push(`### ${entry.milestoneId}/${entry.sliceId}: ${entry.title}`)
        if (entry.oneLiner) lines.push(`> ${entry.oneLiner}`)
        if (entry.filesModified.length > 0) {
          lines.push("Files:")
          for (const f of entry.filesModified) lines.push(`- \`${f.path}\` — ${f.description}`)
        }
        if (entry.completedAt) lines.push(`Completed: ${entry.completedAt}`)
        const verification = findVerification(data, entry.milestoneId, entry.sliceId)
        if (verification?.keyDecisions.length) {
          lines.push("Decisions:")
          for (const decision of verification.keyDecisions) lines.push(`- ${decision}`)
        }
        if (verification?.patternsEstablished.length) {
          lines.push("Patterns:")
          for (const pattern of verification.patternsEstablished) lines.push(`- ${pattern}`)
        }
        lines.push("")
      }
    }
    return lines.join("\n")
  }, [data])

  const handleMarkdown = () => downloadBlob(generateMarkdown(), "gsd-report.md", "text/markdown")
  const handleJSON = () => downloadBlob(JSON.stringify(data, null, 2), "gsd-report.json", "application/json")

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <SectionLabel>Export Project Data</SectionLabel>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Download the current visualizer data as a structured report. Markdown includes
          milestones, health, knowledge, captures, metrics, critical path, and changelog
          in a readable format. JSON contains the full raw data payload.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <button
            onClick={handleMarkdown}
            className="group flex items-center gap-5 rounded-xl border border-border bg-muted/50 p-5 text-left transition-all hover:border-info/40 hover:bg-info/5"
          >
            <div className="rounded-xl border border-info/20 bg-info/10 p-4 transition-colors group-hover:bg-info/15">
              <FileText className="h-6 w-6 text-info" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold transition-colors group-hover:text-info">Download Markdown</p>
              <p className="mt-1 text-xs text-muted-foreground">Human-readable report with tables and structure</p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground/0 transition-all group-hover:text-info/70" />
          </button>

          <button
            onClick={handleJSON}
            className="group flex items-center gap-5 rounded-xl border border-border bg-muted/50 p-5 text-left transition-all hover:border-success/40 hover:bg-success/5"
          >
            <div className="rounded-xl border border-success/20 bg-success/10 p-4 transition-colors group-hover:bg-success/15">
              <FileJson className="h-6 w-6 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold transition-colors group-hover:text-success">Download JSON</p>
              <p className="mt-1 text-xs text-muted-foreground">Full raw data payload for tooling</p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground/0 transition-all group-hover:text-success/70" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Custom Tab Bar ────────────────────────────────────────────────────────────

function VisualizerTabs({
  value,
  onValueChange,
  children,
}: {
  value: TabValue
  onValueChange: (value: TabValue) => void
  children: React.ReactNode
}) {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as TabValue)}
      className="flex h-full flex-col overflow-hidden"
    >
      {children}
    </TabsPrimitive.Root>
  )
}

function VisualizerTabList() {
  return (
    <TabsPrimitive.List className="flex shrink-0 overflow-x-auto border-b border-border bg-background px-6">
      {TABS.map(({ value, label, Icon }) => (
        <TabsPrimitive.Trigger
          key={value}
          value={value}
          className={cn(
            // Base
            "group relative flex shrink-0 items-center gap-2 px-3.5 py-3.5 text-sm font-medium outline-none",
            "text-muted-foreground transition-colors duration-150",
            // Hover
            "hover:text-foreground",
            // Active (selected) — text
            "data-[state=active]:text-foreground",
            // Focus visible
            "focus-visible:text-foreground",
            // Disabled
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          {/* Active bottom border indicator */}
          <span
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full",
              "bg-foreground opacity-0 transition-opacity duration-150",
              "group-data-[state=active]:opacity-100",
            )}
          />

          {/* Hover background */}
          <span className="absolute inset-x-0 inset-y-1.5 rounded-lg bg-muted/0 transition-colors duration-150 group-hover:bg-muted group-data-[state=active]:bg-transparent" />

          {/* Icon */}
          <Icon className="relative h-4 w-4 shrink-0 transition-colors duration-150 text-muted-foreground group-hover:text-muted-foreground group-data-[state=active]:text-foreground" />

          {/* Label */}
          <span className="relative">{label}</span>
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VisualizerView() {
  const workspace = useGSDWorkspaceState()
  const projectCwd = workspace.boot?.project.cwd
  const [data, setData] = useState<VisualizerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState<TabValue>("progress")
  const [filterQuery, setFilterQuery] = useState("")
  const [helpOpen, setHelpOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const filteredData = useMemo(
    () => (data ? filterVisualizerData(data, filterQuery) : null),
    [data, filterQuery],
  )

  const fetchData = useCallback(async () => {
    try {
      const resp = await authFetch(buildProjectUrl("/api/visualizer", projectCwd))
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(body.error || `HTTP ${resp.status}`)
      }
      const json: VisualizerData = await resp.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch visualizer data")
    } finally {
      setLoading(false)
    }
  }, [projectCwd])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10_000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const isFormFieldFocused = () => {
      const activeElement = document.activeElement
      if (!activeElement) return false
      const tagName = activeElement.tagName.toLowerCase()
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        activeElement.getAttribute("contenteditable") === "true"
      )
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (helpOpen && (event.key === "Escape" || event.key.toLowerCase() === "q")) {
        event.preventDefault()
        setHelpOpen(false)
        return
      }

      if (isFormFieldFocused()) return

      if (event.key >= "1" && event.key <= "9") {
        const tab = TABS[Number(event.key) - 1]
        if (tab) {
          event.preventDefault()
          setSelectedTab(tab.value)
        }
        return
      }

      if (event.key === "0") {
        event.preventDefault()
        setSelectedTab(TABS[TABS.length - 1].value)
        return
      }

      if (event.key === "/") {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (event.key === "?") {
        event.preventDefault()
        setHelpOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [helpOpen])

  // Loading
  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading visualizer data…</p>
        </div>
      </div>
    )
  }

  // Error (no cached data)
  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full border border-warning/20 bg-warning/10 p-4">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <div>
            <p className="text-sm font-semibold">Failed to load visualizer</p>
            <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="mt-1 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null
  const visibleData = filteredData ?? data

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-5 border-b border-border px-7 py-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Workflow Visualizer</h1>
          <div className="mt-1.5 flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Phase:{" "}
              <span className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
                data.phase === "complete"
                  ? "bg-success/15 text-success"
                  : data.phase === "active" || data.phase === "running"
                    ? "bg-info/15 text-info"
                    : "bg-muted text-muted-foreground",
              )}>
                {data.phase}
              </span>
            </span>
            {data.remainingSliceCount > 0 && (
              <>
                <span className="text-border">·</span>
                <span>
                  {data.remainingSliceCount} slice{data.remainingSliceCount !== 1 ? "s" : ""} remaining
                </span>
              </>
            )}
            {error && (
              <>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1 text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Stale — {error}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={searchInputRef}
            type="search"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search visualizer"
            className="h-9 w-48 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
          />
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Show keyboard shortcuts"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold transition-colors hover:bg-accent"
          >
            ?
          </button>
        </div>
      </div>

      {/* Tabs */}
      <VisualizerTabs value={selectedTab} onValueChange={setSelectedTab}>
        <VisualizerTabList />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-7 py-7">
            <TabsPrimitive.Content value="progress" className="outline-none">
              <ProgressTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="deps" className="outline-none">
              <DepsTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="metrics" className="outline-none">
              <MetricsTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="health" className="outline-none">
              <HealthTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="timeline" className="outline-none">
              <TimelineTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="agent" className="outline-none">
              <AgentTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="changes" className="outline-none">
              <ChangesTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="knowledge" className="outline-none">
              <KnowledgeTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="captures" className="outline-none">
              <CapturesTab data={visibleData} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="export" className="outline-none">
              <ExportTab data={visibleData} />
            </TabsPrimitive.Content>
          </div>
        </div>
      </VisualizerTabs>

      {helpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="visualizer-shortcuts-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="visualizer-shortcuts-title" className="text-sm font-semibold">
                Keyboard Shortcuts
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close keyboard shortcuts"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="font-mono text-xs text-muted-foreground">1-9, 0</dt>
              <dd>Jump to tab</dd>
              <dt className="font-mono text-xs text-muted-foreground">/</dt>
              <dd>Focus search</dd>
              <dt className="font-mono text-xs text-muted-foreground">?</dt>
              <dd>Show this help</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}
