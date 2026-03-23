# Single-Writer State Architecture — Process Map

## Overview

All workflow state lives in SQLite. Markdown files are rendered views.
Agents call typed tools. TypeScript owns state transitions.

```
Agent ──tool call──→ WorkflowEngine ──transaction──→ SQLite
                          │
                     afterCommand()
                      ├─ renderAllProjections() → PLAN.md, ROADMAP.md, SUMMARY.md, STATE.md
                      ├─ writeManifest() → state-manifest.json
                      └─ appendEvent() → event-log.jsonl
```

---

## Layer 0: Storage

### SQLite Database (v5 schema)

| Table | PK | Purpose |
|-------|-----|---------|
| `milestones` | id | M001, M002 — title, status, timestamps |
| `slices` | (milestone_id, id) | S01, S02 — risk, depends_on (JSON), summary, uat_result, seq |
| `tasks` | (milestone_id, slice_id, id) | T01, T02 — description, status, estimate, summary, files (JSON), verify, blocker, seq |
| `verification_evidence` | id (auto) | command, exit_code, stdout, stderr, duration_ms |
| `decisions` | seq (auto) | scope, decision, choice, rationale |
| `requirements` | id | class, status, description, validation |
| `artifacts` | path | cached markdown content for crash recovery |
| `memories` | seq (auto) | cross-session learnings |

**Indexes:** `idx_tasks_status`, `idx_slices_status`, `idx_verification_task`, `idx_memories_active`

**Files:**
- `.gsd/gsd.db` — SQLite database (WAL mode for file-backed)
- `.gsd/event-log.jsonl` — append-only event log
- `.gsd/state-manifest.json` — full DB snapshot for bootstrap/merge
- `.gsd/event-log-{milestoneId}.jsonl.archived` — compacted milestone events

### DB Lifecycle

```
openDatabase(path)
  ├─ Provider: node:sqlite (Node 22+) → better-sqlite3 fallback
  ├─ WAL mode for file-backed DBs
  ├─ Schema migration v1→v5 in transaction
  └─ Sets module singleton: currentDb, currentPath

closeDatabase()
  ├─ Nulls currentDb
  └─ Calls resetEngine() to clear engine singleton

ensureDbOpen() [called by every tool]
  ├─ If already open → return true
  ├─ If .gsd/gsd.db exists → openDatabase()
  ├─ If markdown exists → openDatabase() + migrateFromMarkdown()
  └─ Return false if nothing to open
```

---

## Layer 1: Engine

### WorkflowEngine (singleton per basePath)

```
getEngine(basePath)
  ├─ Reuses _engineInstance if basePath matches
  └─ Creates new WorkflowEngine(basePath) → retrieves DbAdapter via _getAdapter()

isEngineAvailable(basePath)
  ├─ isDbAvailable() → currentDb !== null
  └─ milestones table exists in sqlite_master
```

### 17 Command Handlers

All run inside `transaction()`. All trigger `afterCommand()` on success.

#### Original 7 (task/slice execution lifecycle)

| Command | Tool Name | DB Mutation | Returns |
|---------|-----------|-------------|---------|
| `completeTask` | `gsd_complete_task` | UPDATE tasks SET status='done', summary, completed_at; INSERT verification_evidence | taskId, progress, nextTask |
| `completeSlice` | `gsd_complete_slice` | UPDATE slices SET status='done', summary, uat_result, completed_at | sliceId, progress, nextSlice |
| `planSlice` | `gsd_plan_slice` | INSERT tasks (batch) with seq order | sliceId, taskCount, taskIds |
| `saveDecision` | `gsd_engine_save_decision` | INSERT decisions with auto-seq | id (D001, D002...) |
| `startTask` | `gsd_start_task` | UPDATE tasks SET status='in-progress', started_at | taskId, startedAt |
| `recordVerification` | `gsd_record_verification` | INSERT verification_evidence | taskId, evidenceId |
| `reportBlocker` | `gsd_report_blocker` | UPDATE tasks SET status='blocked', blocker | taskId |

#### New 10 (complete pipeline coverage)

| Command | Tool Name | DB Mutation | Returns |
|---------|-----------|-------------|---------|
| `createMilestone` | `gsd_create_milestone` | INSERT milestones (status='active'); idempotent | milestoneId, status |
| `planMilestone` | `gsd_plan_milestone` | DELETE + INSERT slices (batch); first eligible → active | milestoneId, sliceCount, activeSlice |
| `completeMilestone` | `gsd_complete_milestone` | UPDATE milestones SET status='done'; validates all slices done | milestoneId, completedAt |
| `validateMilestone` | `gsd_validate_milestone` | INSERT remediation slices if verdict=needs-remediation | milestoneId, verdict |
| `updateRoadmap` | `gsd_update_roadmap` | Add/remove/reorder slices atomically; only pending can be removed | milestoneId, added, removed |
| `saveContext` | `gsd_save_context` | Pass-through (afterCommand renders CONTEXT.md) | milestoneId, saved |
| `saveResearch` | `gsd_save_research` | Pass-through (afterCommand renders RESEARCH.md) | milestoneId, sliceId, saved |
| `saveRequirements` | `gsd_save_requirements` | UPSERT requirements table | count, requirementIds |
| `saveUatResult` | `gsd_save_uat_result` | UPDATE slices SET uat_result (JSON verdict+checks) | milestoneId, sliceId, verdict |
| `saveKnowledge` | `gsd_save_knowledge` | Pass-through (afterCommand renders KNOWLEDGE.md) | saved |

**Idempotency:** completeTask, createMilestone safe to call multiple times.

### afterCommand (post-mutation side effects)

Called after every command. All operations non-fatal — command succeeds even if these fail.

```
afterCommand(cmd, params)
  ├─ renderAllProjections(basePath, milestoneId) → logWarning on failure
  ├─ writeManifest(basePath, db) → logWarning on failure
  └─ appendEvent(basePath, {cmd, params, ts, actor}) → logWarning on failure
```

**Special case:** `completeSlice` checks milestone progress — if 100%, runs `compactMilestoneEvents()`.

---

## Layer 2: State Derivation

### deriveState(basePath) — dual-path

```
deriveState(basePath): Promise<GSDState>
  │
  ├─ 100ms cache hit? → return cached
  │
  ├─ isEngineAvailable(basePath)?
  │   ├─ yes → Auto-migration check:
  │   │         needsAutoMigration()? → migrateFromMarkdown() + validateMigration()
  │   │         engine.deriveState() → GSDState from DB queries
  │   │         logWarning("migration", ...) on discrepancies
  │   │
  │   └─ no → logWarning("state", "engine unavailable, falling back")
  │            _deriveStateLegacy(basePath) → parse markdown files
  │
  └─ Cache result (100ms TTL), track telemetry (engineDeriveCount vs markdownDeriveCount)
```

### GSDState shape

```typescript
{
  activeMilestone: { id, title } | null,
  activeSlice: { id, title } | null,
  activeTask: { id, title } | null,
  phase: "pre-planning" | "planning" | "executing" | ...,
  recentDecisions: string[],
  blockers: string[],
  registry: MilestoneRegistryEntry[],
  nextAction: string,
  requirements: { active, validated, deferred, ... },
}
```

---

## Layer 3: Projections

All renderers are pure functions (DB → string) + atomicWriteSync.

| Projection | File Written | Rendered From |
|------------|-------------|---------------|
| `renderPlanProjection` | `.gsd/milestones/{mid}/slices/{sid}/{sid}-PLAN.md` | sliceRow + taskRows (checkboxes) |
| `renderRoadmapProjection` | `.gsd/milestones/{mid}/{mid}-ROADMAP.md` | milestoneRow + sliceRows (status table) |
| `renderSummaryProjection` | `.gsd/milestones/{mid}/slices/{sid}/tasks/{tid}-SUMMARY.md` | taskRow (frontmatter + narrative) |
| `renderStateProjection` | `.gsd/STATE.md` | engine.deriveState() → full state view |

### renderStateProjection guards

```
renderStateProjection(basePath)
  ├─ isDbAvailable()? → no → return (skip silently)
  ├─ _getAdapter()?.prepare("SELECT 1") → catch → return (stale handle)
  ├─ isEngineAvailable(basePath)? → no → return (no engine tables)
  └─ new WorkflowEngine(basePath).deriveState() → render → atomicWriteSync
```

### regenerateIfMissing(basePath, filePath)

On-demand regeneration when projection files are deleted or corrupted. Detects file type from path pattern and re-renders from DB.

---

## Layer 4: Integration

### Event Log

```
appendEvent(basePath, {cmd, params, ts, actor})
  ├─ hash = SHA256(JSON.stringify({cmd, params})).slice(0,16)  // deterministic
  └─ append to .gsd/event-log.jsonl

readEvents(logPath) → WorkflowEvent[]  // tolerates corrupted lines

findForkPoint(logA, logB) → index  // last common hash

compactMilestoneEvents(basePath, milestoneId)
  ├─ Filter events for milestoneId
  ├─ Archive to .gsd/event-log-{mid}.jsonl.archived
  └─ Rewrite active log with remaining events
```

### Manifest

```
snapshot(db) → { milestones[], slices[], tasks[], decisions[], verification_evidence[] }

writeManifest(basePath, db)
  └─ atomicWriteSync(.gsd/state-manifest.json, JSON.stringify(snapshot, null, 2))

restore(db, manifest)  // transaction: DELETE all → INSERT all

bootstrapFromManifest(basePath, db) → boolean  // for fresh clones
```

### Worktree Sync

```
syncProjectRootToWorktree(main, worktree)
  ├─ acquireSyncLock(main)
  ├─ Copy missing milestones, CONTEXT, ROADMAP, etc.
  ├─ renderAllProjections() in worktree
  └─ releaseSyncLock(main)

syncWorktreeToProjectRoot(worktree, main)
  ├─ acquireSyncLock(main)
  ├─ reconcileWorktreeLogs(main, worktree) → auto-merge or conflict
  ├─ Copy artifacts back
  └─ releaseSyncLock(main)
```

### Reconciliation

```
reconcileWorktreeLogs(mainBasePath, worktreeBasePath)
  ├─ Read both event logs
  ├─ findForkPoint() → last common event by hash
  ├─ Slice diverged events from each side
  ├─ detectConflicts() → entity-level (both touched same task?)
  │   ├─ CONFLICTS → writeConflictsFile() → block merge (D-04 all-or-nothing)
  │   └─ CLEAN → sort merged by timestamp → engine.replayAll() → write merged log + manifest
  └─ Return { autoMerged, conflicts }
```

### Write Intercept

```
tool_call hook (register-hooks.ts)
  ├─ Loop guard: checkToolCallLoop() → block repeated identical calls
  ├─ Write intercept: isBlockedStateFile(path)?
  │   └─ Currently blocked: STATE.md (+ symlink variants)
  │      Agent-authored (NOT blocked): ROADMAP.md, PLAN.md, PROJECT.md,
  │      REQUIREMENTS.md, SUMMARY.md, KNOWLEDGE.md, CONTEXT.md, DECISIONS.md
  └─ Context write-gate: shouldBlockContextWrite() → depth verification for CONTEXT.md
```

### Workflow Logger

```
logWarning(component, message, context?)  // buffer + stderr
logError(component, message, context?)    // buffer + stderr

Components: engine, projection, manifest, event-log, intercept, migration, state, tool, compaction, reconcile

drainLogs() → LogEntry[]  // returns + clears buffer
summarizeLogs() → string | null  // "2 error(s): ..., 1 warning(s): ..."

Auto-loop integration (auto/phases.ts):
  Post-unit: drainLogs() → tag window entry + notify user
  Stuck-stop: summarizeLogs() → enrich stop message with root cause
```

---

## Dispatch Unit → Tool Call Mapping

Every auto-mode dispatch unit type has a corresponding tool call:

| Dispatch Unit | Phase Trigger | Tool Call(s) Agent Uses |
|---|---|---|
| discuss-milestone | needs-discussion / pre-planning | `gsd_create_milestone`, `gsd_save_context`, `gsd_save_requirements` |
| research-milestone | pre-planning (no research) | `gsd_save_research` |
| plan-milestone | pre-planning (has research) | `gsd_plan_milestone`, `gsd_engine_save_decision` |
| research-slice | planning (no slice research) | `gsd_save_research(slice_id)` |
| plan-slice | planning | `gsd_plan_slice` |
| replan-slice | replanning-slice | `gsd_update_roadmap`, `gsd_plan_slice` |
| execute-task | executing | `gsd_start_task`, `gsd_record_verification`, `gsd_complete_task` |
| reactive-execute | executing (multi-task) | `gsd_start_task` + `gsd_complete_task` (per task) |
| complete-slice | summarizing | `gsd_complete_slice` |
| run-uat | post-completion | `gsd_save_uat_result` |
| reassess-roadmap | post-completion | `gsd_update_roadmap`, `gsd_engine_save_decision` |
| validate-milestone | validating-milestone | `gsd_validate_milestone` |
| complete-milestone | completing-milestone | `gsd_complete_milestone`, `gsd_save_knowledge` |
| rewrite-docs | override gate | `gsd_update_roadmap`, `gsd_engine_save_decision` |

---

## Auto-Loop Integration

### Unit Lifecycle

```
autoLoop iteration:
  1. deriveState() → phase, unitType, unitId
  2. Stuck detection: same unit 3x or same error 2x → stop
  3. Dispatch: build prompt for unitType
  4. runUnit(prompt) → spawn agent session → await completion
  5. Post-unit:
     ├─ closeoutUnit() → metrics, activity log
     ├─ drainLogs() → surface engine warnings/errors
     ├─ Tag window entry with errors for stuck detection
     ├─ Zero tool-call guard → reject hallucinated summaries
     └─ Artifact verification via engine:
         execute-task → engine.getTask(mid, sid, tid).status === "done"
         complete-slice → engine.getSlice(mid, sid).status === "done"
         plan-slice → engine.getTasks(mid, sid).length > 0
  6. If verified → push to completedUnits, continue
  7. If not verified → re-derive on next iteration
```

### Milestone Transitions

```
When deriveState() returns phase="completing-milestone":
  1. Merge worktree → main (squash)
  2. Generate HTML report
  3. Create draft PR (if enabled)
  4. Exit worktree
  5. If next milestone → enter new worktree
  6. Rebuild STATE.md
```

---

## Error Handling Summary

| Component | Error | Severity | Where logged | Auto-loop sees it? |
|-----------|-------|----------|-------------|-------------------|
| Tool handler fails | DB error, validation | error | workflow-logger → stderr + buffer | Yes (drainLogs post-unit) |
| Projection render fails | File write error | warn | workflow-logger → stderr + buffer | Yes (drainLogs post-unit) |
| Manifest write fails | File write error | warn | workflow-logger → stderr + buffer | Yes (drainLogs post-unit) |
| Event append fails | File write error | warn | workflow-logger → stderr + buffer | Yes (drainLogs post-unit) |
| Write intercepted | Blocked write | error | workflow-logger → stderr + buffer | Yes (drainLogs + stuck enrichment) |
| Engine unavailable | Import/DB fail | warn | workflow-logger → stderr + buffer | Yes (drainLogs post-unit) |
| Migration fails | Parse error | error | workflow-logger → stderr + buffer | Yes (drainLogs post-unit) |
| DB handle stale | Closed mid-operation | — | renderStateProjection returns early | Silent (by design) |

---

## File Map

### Core Engine
| File | Lines | Purpose |
|------|-------|---------|
| `workflow-engine.ts` | ~720 | Engine singleton, 17 methods, deriveState, replay |
| `workflow-engine-schema.ts` | ~87 | v5 schema DDL |
| `workflow-commands.ts` | ~1050 | 17 command handlers with transactions |
| `workflow-projections.ts` | ~420 | DB → markdown renderers |
| `workflow-events.ts` | ~140 | Event log, fork-point, compaction |
| `workflow-manifest.ts` | ~169 | Snapshot/restore for bootstrap |
| `workflow-migration.ts` | ~368 | Markdown → engine one-time migration |
| `workflow-reconcile.ts` | ~392 | Event-based worktree merge |
| `workflow-logger.ts` | ~145 | Structured error/warning accumulator |

### Guards & Intercepts
| File | Lines | Purpose |
|------|-------|---------|
| `write-intercept.ts` | ~58 | Blocks agent writes to STATE.md |
| `sync-lock.ts` | ~95 | Advisory lock for concurrent sync |
| `legacy/parsers.ts` | ~347 | Markdown parsing (migration + display only) |

### Integration
| File | Lines | Purpose |
|------|-------|---------|
| `bootstrap/workflow-tools.ts` | ~1090 | 17 agent-callable tools |
| `bootstrap/register-hooks.ts` | ~217 | tool_call intercept wiring |
| `bootstrap/dynamic-tools.ts` | varies | ensureDbOpen + DB path resolution |
| `state.ts` | varies | Dual-path deriveState + cache |
| `auto/phases.ts` | varies | Logger drain, stuck detection, artifact verification |
