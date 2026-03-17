/**
 * Headless Query — `gsd headless query`
 *
 * Single read-only command that returns the full project snapshot as JSON
 * to stdout, without spawning an LLM session. Instant (~50ms).
 *
 * Output: { state, next, cost }
 *   state — deriveState() output (phase, milestones, progress, blockers)
 *   next  — dry-run dispatch preview (what auto-mode would do next)
 *   cost  — aggregated parallel worker costs
 */

import { deriveState } from './resources/extensions/gsd/state.js'
import { resolveDispatch } from './resources/extensions/gsd/auto-dispatch.js'
import { readAllSessionStatuses } from './resources/extensions/gsd/session-status-io.js'
import { loadEffectiveGSDPreferences } from './resources/extensions/gsd/preferences.js'
import type { GSDState } from './resources/extensions/gsd/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QuerySnapshot {
  state: GSDState
  next: {
    action: 'dispatch' | 'stop' | 'skip'
    unitType?: string
    unitId?: string
    reason?: string
  }
  cost: {
    workers: Array<{
      milestoneId: string
      pid: number
      state: string
      cost: number
      lastHeartbeat: number
    }>
    total: number
  }
}

export interface QueryResult {
  exitCode: number
  data?: QuerySnapshot
}

// ─── Implementation ─────────────────────────────────────────────────────────

export async function handleQuery(basePath: string): Promise<QueryResult> {
  const state = await deriveState(basePath)

  // Derive next dispatch action
  let next: QuerySnapshot['next']
  if (!state.activeMilestone) {
    next = {
      action: 'stop',
      reason: state.phase === 'complete' ? 'All milestones complete.' : state.nextAction,
    }
  } else {
    const loaded = loadEffectiveGSDPreferences()
    const dispatch = await resolveDispatch({
      basePath,
      mid: state.activeMilestone.id,
      midTitle: state.activeMilestone.title,
      state,
      prefs: loaded?.preferences,
    })
    next = {
      action: dispatch.action,
      unitType: dispatch.action === 'dispatch' ? dispatch.unitType : undefined,
      unitId: dispatch.action === 'dispatch' ? dispatch.unitId : undefined,
      reason: dispatch.action === 'stop' ? dispatch.reason : undefined,
    }
  }

  // Aggregate parallel worker costs
  const statuses = readAllSessionStatuses(basePath)
  const workers = statuses.map((s) => ({
    milestoneId: s.milestoneId,
    pid: s.pid,
    state: s.state,
    cost: s.cost,
    lastHeartbeat: s.lastHeartbeat,
  }))

  const snapshot: QuerySnapshot = {
    state,
    next,
    cost: { workers, total: workers.reduce((sum, w) => sum + w.cost, 0) },
  }

  process.stdout.write(JSON.stringify(snapshot) + '\n')
  return { exitCode: 0, data: snapshot }
}
