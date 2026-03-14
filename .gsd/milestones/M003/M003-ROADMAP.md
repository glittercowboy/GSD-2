# M003: Upstream Reconciliation and PR Preparation

**Vision:** Reconcile local M001/M002 milestone work with current upstream `origin/main`, preserving the models.dev registry architecture while producing a clean, verified, PR-ready branch.

## Success Criteria

- The reconciled branch merges current `origin/main` without losing M001/M002 behavior (cache → snapshot → fallback chain, 12h TTL, version invalidation, test coverage)
- All 32 pi-ai tests, 9 scenario tests, and live verification pass on the merged result
- The diff against upstream is coherent and reviewable — conflicts resolved intentionally, not accidentally
- The branch is locally ready to become a PR (GitHub PR creation remains a separate explicit action)

## Key Risks / Unknowns

- **Merge conflicts in model-registry.ts and models.ts** — Upstream may have divergent changes to these files that conflict with the models.dev integration. Must manually reconcile rather than auto-accepting either version.
- **Upstream test infrastructure changes** — If upstream changed test runners, tsconfig, or ESM resolver paths, the M002 test setup may conflict.
- **Hidden assumptions exposed by merge** — Behavior that passed locally before merge may fail once upstream changes alter neighboring code paths.

## Proof Strategy

- Merge conflicts → retire in S01 by explicitly keeping models.dev architecture in key files while incorporating unrelated upstream improvements
- Test infrastructure → retire in S01 by running full verification suite post-merge and fixing any regressions

## Verification Classes

- Contract verification: 32 pi-ai unit tests (cache, fallback, mapper, live verification)
- Integration verification: 9 scenario tests with tmpdir isolation proving real ModelRegistry startup behavior
- Operational verification: Build succeeds, all tests pass, branch is push-ready
- UAT / human verification: None (PR review is post-milestone)

## Milestone Definition of Done

This milestone is complete only when all are true:

- `git merge origin/main` completes (with conflict resolution committed)
- All 32 pi-ai tests pass via `npm test -w @gsd/pi-ai`
- All 9 scenario tests pass via `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js`
- Build succeeds via `npm run build -w @gsd/pi-ai`
- Reconciliation decisions documented in `.gsd/DECISIONS.md`
- Branch is locally PR-ready (no uncommitted changes, verification green)

## Requirement Coverage

- Covers: R011 (reconcile with upstream mainline), R012 (leave PR-ready)
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [x] **S01: Upstream Merge and Verification** `risk:high` `depends:[]`
  > After this: The branch contains current upstream `origin/main`, conflicts are resolved favoring models.dev architecture, and all 32 pi-ai tests + 9 scenario tests + live verification pass on the merged result.

## Boundary Map

### S01 → (milestone complete)

Produces:
- Reconciled branch with merged upstream changes
- Preserved M001/M002 behavior (models.dev fetch, cache/fallback chain, test coverage)
- Documented reconciliation decisions in `.gsd/DECISIONS.md`

Consumes:
- `origin/main` from `gsd-build/gsd-2` (upstream source of truth)
- M001/M002 implementation (local milestone work to preserve)
