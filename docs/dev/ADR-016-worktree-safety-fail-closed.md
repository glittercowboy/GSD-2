<!-- Project/App: GSD-2 -->
<!-- File Purpose: ADR for fail-closed Worktree Safety behavior. -->

# ADR-016: Fail Closed for Source-Writing Worktree Safety

**Status:** Accepted
**Date:** 2026-05-09
**Author:** GSD architecture review
**Related:** ADR-001 (branchless worktree architecture), ADR-014 (deep Auto Orchestration module), ADR-015 (runtime invariant modules)

## Context

Worktree isolation is intended to keep source-writing Units inside milestone worktrees so post-unit verification, commits, merge recovery, and audit records all apply to the same root. The previous auto-loop path had scattered `.git` checks and could degrade an empty milestone worktree to the project root when the project root had content.

That fallback was convenient for untracked project-root content, but it weakened the Worktree Safety seam. Callers had to remember that a source-writing Unit might run outside the milestone worktree, and source writes could bypass the worktree commit pipeline.

## Decision

Source-writing Units fail closed under worktree isolation unless Worktree Safety proves the Unit root is safe.

A source-writing Unit is any Unit whose Tool Contract permits writes outside `.gsd/**`, currently tool policy modes `all` and `docs`. Planning-only Units may continue to write `.gsd/**` artifacts at the project root. Verification Units, such as `run-uat`, may run approved build/test commands but are not source-writing because their writes remain restricted to `.gsd/**`.

Worktree Safety validates:

- the milestone id is present and path-safe
- the Unit root is the canonical `<projectRoot>/.gsd/worktrees/<milestone>` path
- the worktree root exists
- `.git` is a worktree file, not a standalone `.git` directory
- the root is registered by `git worktree list`
- the checked-out branch matches the expected milestone branch when supplied
- the milestone lease is held when worker-mode leasing is active
- an empty worktree over a populated project root stops instead of degrading to project-root source writes

Failures produce typed Worktree Safety outcomes such as `worktree-missing`, `worktree-unregistered`, `branch-mismatch`, `lease-lost`, and `empty-worktree-with-project-content`.

## Consequences

- Source-writing Units stop before dispatch when worktree isolation cannot be proven.
- Agents receive an actionable remediation reason instead of a generic stuck-loop or missing `.git` failure.
- The Worktree Safety Interface becomes the test surface for worktree root invariants.
- Users with untracked project-root content must resolve or import that content into the milestone worktree instead of relying on automatic project-root degradation.
