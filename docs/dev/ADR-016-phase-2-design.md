# ADR-016 Phase 2 — Design Notes

**Status:** Design notes (not a separate ADR — addenda to ADR-016)
**Date:** 2026-05-09
**Related:** ADR-016 (Worktree Lifecycle and Projection split)

These notes resolve the two design slices (#5616, #5617) that gate the ADR-016 phase 2 implementation slices. Decisions here are scoped to the verbs they describe; broader Module shape is fixed by ADR-016.

---

## A1 (#5616) — Parallel-merge integration shape

**Decision: Option A — add `Lifecycle.mergeMilestoneStandalone(...)`. Do not extract a separate `MergeRunner` Module.**

### Context

`parallel-merge.ts:13` imports `mergeMilestoneToMain` directly from `auto-worktree.ts` and runs the worktree-mode merge outside the Worktree Lifecycle Module. ADR-016's bypass-closure invariant — _"no caller, single-loop or parallel, bypasses the Module-level Interface for the verbs the Module owns"_ — is therefore enforced on only one of two caller groups. A1 picks the integration shape that closes the bypass.

### What the merge body needs from the session

`_mergeWorktreeMode` (worktree-lifecycle.ts:907-1078) reads the following from `this.s`:

- `s.originalBasePath`, `s.basePath` — project root and worktree path
- `s.isolationDegraded` — checked at the `_mergeAndExit` parent
- `s.milestoneStartShas.get(milestoneId)` — only for the optional resquash-on-merge step
- `s.milestoneStartShas.delete(milestoneId)` — bookkeeping after resquash

The body does not mutate `s.basePath`. `restoreToProjectRoot()` is the mutator, called by `_mergeAndExit` after the merge returns. Structurally the merge body is a function of `(originalBase, worktreeBase, milestoneId, ctx, optional startSha)`.

### Why Option A over Option B

1. **Body doesn't move.** Option A exposes a session-less entry to the existing `_mergeWorktreeMode` and `_mergeBranchMode` bodies. Option B copies them out into a new Module. Option A has less mechanical churn for the same end-state.
2. **Projection edge stays inside Lifecycle.** `_mergeWorktreeMode` calls `worktreeProjection.finalizeProjectionForMerge(scope)`. In Option B that edge moves to `MergeRunner`, so both Lifecycle and MergeRunner end up depending on Projection. ADR-016 names two sibling Modules (Lifecycle, Projection); a third Module spreads the dependency graph.
3. **Deletion test on `MergeRunner`.** If `MergeRunner` were deleted, its body collapses straight back into Lifecycle — the same place it lives today. That's a failed deletion test: `MergeRunner` is a pass-through wrapper around code Lifecycle already owns.
4. **Bypass closure is the same.** Once Option A lands, `parallel-merge.ts` constructs (or obtains) a `WorktreeLifecycle` and calls `mergeMilestoneStandalone`. A3 (#5619) unexports `mergeMilestoneToMain`. The closure invariant is enforced by file boundary, identical to the Option B end-state.

### Sketch

```ts
interface MergeContext {
  originalBasePath: string;
  worktreeBasePath: string;
  milestoneId: string;
  milestoneStartSha?: string;        // omit → skip resquash
  isolationDegraded?: boolean;       // default false
  notify: NotifyCtx["notify"];
}

class WorktreeLifecycle {
  // Session-bound entry — single-loop path
  mergeAndExit(milestoneId: string, ctx: NotifyCtx): boolean {
    // Build MergeContext from this.s, delegate to mergeMilestoneStandalone,
    // run resquash bookkeeping based on the result.
  }

  // Session-less entry — parallel-merge path
  mergeMilestoneStandalone(mctx: MergeContext): {
    merged: boolean;
    codeFilesChanged: boolean;
  } {
    // Existing _mergeWorktreeMode / _mergeBranchMode bodies, with this.s
    // reads replaced by mctx fields.
  }
}
```

`_mergeAndExit` becomes a thin wrapper that builds `MergeContext` from `this.s`, forwards to `mergeMilestoneStandalone`, then runs the resquash side-effect using `s.milestoneStartShas` and the returned merge result. `parallel-merge.ts` builds its own `MergeContext` directly with `milestoneStartSha` omitted (parallel callers don't track start SHAs across processes).

### Implementation order

1. **A2 (#5618)** — extract the body of `_mergeWorktreeMode` and `_mergeBranchMode` into `mergeMilestoneStandalone`. `_mergeAndExit` keeps the session-bound shape and delegates. Migrate `parallel-merge.ts` to call `mergeMilestoneStandalone`.
2. **A3 (#5619)** — remove the `export` keyword from `mergeMilestoneToMain` (or move the function inside `worktree-lifecycle.ts`). Verify with `grep -rn "mergeMilestoneToMain" src/` that no caller outside the Module references the symbol.

---

## B1 (#5617) — Session-mutation verb shape

**Decision: three discrete verbs (`adoptSessionRoot`, `resumeFromPausedSession`, `adoptOrphanWorktree`). Do not introduce a single `adoptBasePath(opts)` discriminated-union verb.**

### Context

ADR-016's single-owner invariant: _"Single owner of `s.basePath` mutation across the codebase: the Worktree Lifecycle module. No caller writes `s.basePath` directly."_ Phase 1 made Lifecycle the owner for milestone entry/exit/merge transitions, but bootstrap, resume, orphan-adopt, and stop paths still write `s.basePath` directly across `auto.ts` and `auto-start.ts`. B1 picks the verb shape for the remaining mutations.

### Call sites grouped by invariant

| Site | Code | Invariant family |
|---|---|---|
| `auto-start.ts:1043` | `s.basePath = base;` | **Bootstrap** — fresh session start |
| `auto.ts:2148` | `s.basePath = base;` | **Bootstrap** — resume entry, before consulting persisted state |
| `auto.ts:2466` | `s.basePath = targetBasePath;` | **Bootstrap (hook trigger)** — auto-mode kicked off by a hook |
| `auto.ts:2164` | `s.basePath = _resolvePausedResumeBasePathForTest(base, resumeWorktreePath);` | **Resume-from-paused** — consult persisted worktree path |
| `auto-start.ts:910` | `s.basePath = getAutoWorktreePath(base, orphan) ?? base;` | **Orphan adopt** — swap to known orphan worktree |
| `auto-start.ts:913` | `s.basePath = base;` | **Orphan adopt** — revert on merge failure |
| `auto-start.ts:923` | `s.basePath = priorBasePath || base;` | **Orphan adopt** — restore on merge success when session went inactive |
| `auto.ts:1024/1026`, `auto.ts:1275/1277` | `s.basePath = s.originalBasePath; chdir(s.basePath);` | **Restore** — maps to existing `restoreToProjectRoot()` (B5/#5623 parity check) |

### Why three verbs over one

1. **Different call-time invariants.** Bootstrap has no prior state to consult. Resume must read persisted worktree path. Orphan needs a swap-run-restore protocol with a failure-revert. Folding these into `adoptBasePath({ kind })` forces the discriminated union to enumerate the same three branches inside the verb.
2. **Test surface.** Three verbs produce three table-driven test files, each focused on its own invariant. A single verb requires every case to share the dispatch test surface.
3. **Names already exist** in the issue body and CONTEXT.md vocabulary. The union form (`adoptBasePath`) drops that.
4. **Failure-revert lives naturally on the verb.** `adoptOrphanWorktree` is the only verb with a swap-and-restore protocol. The cleanest shape passes a callback that runs under the swapped basePath, with the verb owning revert on failure. A discriminated-union verb pushes this protocol back into the call site.
5. **Stop-path is already covered.** `restoreToProjectRoot()` exists; B5 (#5623) is a parity check, not a new verb. A union shape would have to either include "restore" as a fourth branch or live alongside `restoreToProjectRoot()` — the union shape doesn't simplify either way.

### Final verb set

```ts
class WorktreeLifecycle {
  // B2 (#5620) — bootstrap, hook trigger
  adoptSessionRoot(base: string, originalBase?: string): void;

  // B3 (#5621) — paused-session restore
  resumeFromPausedSession(base: string, persistedWorktreePath: string | null): void;

  // B4 (#5622) — orphan-merge dance with built-in revert
  adoptOrphanWorktree<T extends { merged: boolean }>(
    milestoneId: string,
    base: string,
    run: () => T,
  ): T;

  // B5 (#5623) — already exists; parity check, no new verb
  restoreToProjectRoot(): void;
}
```

### Verb-by-verb shape

#### `adoptSessionRoot(base, originalBase?)`

Sets `s.basePath = base` and `s.originalBasePath = originalBase ?? base`. No chdir (caller is already in `base`). Used at:

- `auto-start.ts:1043` — initial bootstrap, no `originalBase` argument
- `auto.ts:2148` — resume entry, no `originalBase` argument (overwritten by `resumeFromPausedSession` on the next line in today's code, so the bootstrap variant is the right fit)
- `auto.ts:2466` — hook trigger; pass `targetBasePath` as `base`

**Open question for B2 implementation:** confirm `triggerUnitFromHook` (auto.ts:2466) treats the trigger as a bootstrap. Today the assignment happens after `if (!s.active)` activates the session — functionally equivalent to bootstrap. If a hook ever triggered with an already-active session at a different basePath, this site would need its own verb. B2 should add a test that asserts hook-trigger calls `adoptSessionRoot` and not a separate verb.

#### `resumeFromPausedSession(base, persistedWorktreePath)`

Sets `s.basePath` to either `base` (no persisted path) or to `persistedWorktreePath` if it exists on disk, mirroring today's `_resolvePausedResumeBasePathForTest` logic. Folds the `_resolvePausedResumeBasePathForTest` helper into the verb body (the C-track slice-7 cleanup retired `_*ForTest` suffixes for production helpers; this one was missed because it sits in the path B1 is now resolving).

Used at:

- `auto.ts:2164` — paused-session resume

#### `adoptOrphanWorktree(milestoneId, base, run)`

Owns the swap-run-restore protocol. The verb:

1. Snapshots `s.basePath` and `s.originalBasePath` as `priorBase` and `priorOriginalBase`.
2. Sets `s.originalBasePath = base` and `s.basePath = getAutoWorktreePath(base, milestoneId) ?? base`.
3. Calls `run()` with the basePath swap in effect.
4. On `!result.merged`: reverts to `s.basePath = base`, `s.originalBasePath = base`, calls `process.chdir(base)` (mirroring auto-start.ts:913-919).
5. On `result.merged && !s.active`: reverts to `s.basePath = priorBase || base`, `s.originalBasePath = priorOriginalBase || base` (auto-start.ts:923-925).
6. On `result.merged && s.active`: leaves the swap in place (the loop will continue from the worktree path; subsequent `enterMilestone` calls are responsible for their own basePath transitions).

Used at:

- `auto-start.ts:910-925` — orphan-merge bootstrap dance

This is the verb where the callback shape pays for itself: the three-way revert logic is invariant-heavy and error-prone if duplicated at call sites. With the callback, every caller of `adoptOrphanWorktree` is guaranteed-correct revert behaviour.

### Implementation order

1. **B1 (this doc)** — design accepted.
2. **B2 (#5620)** — `adoptSessionRoot`. Three call sites migrate together.
3. **B3 (#5621)** — `resumeFromPausedSession`. Single call site; folds in `_resolvePausedResumeBasePathForTest`.
4. **B4 (#5622)** — `adoptOrphanWorktree`. Refactor `auto-start.ts` orphan block to use the callback verb; the `_mergeOrphanCompletedMilestone(buildLifecycle(), orphan, ctx.ui)` call moves inside the callback.
5. **B5 (#5623)** — parity check that the two stop-path restores match `restoreToProjectRoot()`. Migrate the four assignment lines to a single verb call. No new verb needed.

After B5, every `s.basePath` and `process.chdir` site outside `worktree-lifecycle.ts` is gone. A grep proof becomes the closure check, mirroring A3.

---

## Cross-track sequencing

A and B are independent. Implementation order:

- **A1 (this doc) and B1 (this doc)** — both decided.
- **A2 + B2** — can run in parallel PRs; no shared files.
- **A3 + B3-B5** — sequential within each track; independent across tracks.

C-track (#5624-#5627) is mechanical and runs on its own schedule, blocked only by its own internal sequence.
