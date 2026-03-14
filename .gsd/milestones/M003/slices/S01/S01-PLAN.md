# S01: Upstream Merge and Verification

**Goal:** Merge current `origin/main` into the local milestone branch, resolve conflicts by preserving the models.dev architecture, and verify all tests pass on the reconciled result.

**Demo:** The branch contains merged upstream changes with no conflicts, all 32 pi-ai tests + 9 scenario tests + live verification pass, and the diff against upstream is coherent for review.

## Must-Haves

- Merge `origin/main` with explicit conflict resolution (not auto-accept)
- Preserve M001/M002 behavior: models.dev fetch, cache → snapshot → fallback chain, 12h TTL, version invalidation
- All tests pass post-merge
- Reconciliation documented in DECISIONS.md

## Verification

- `npm run build -w @gsd/pi-ai` — exits 0
- `npm test -w @gsd/pi-ai` — all 32 tests pass
- `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — all 9 scenario tests pass
- `git status` — clean working directory (no uncommitted changes)

## Tasks

- [x] **T01: Fetch and merge upstream** `est:15m`
  - Why: Must integrate current upstream state before verification
  - Files: n/a (git operation)
  - Do: 
    1. `git fetch origin`
    2. `git merge origin/main` — expect conflicts in key files
    3. Note which files have conflicts for T02
  - Verify: `git status` shows conflicted files (or clean merge if no conflicts)
  - Done when: Merge is in progress with conflicts visible, or merge completes cleanly

- [x] **T02: Resolve merge conflicts** `est:30m`
  - Why: Must preserve models.dev architecture while incorporating upstream changes
  - Files: `packages/pi-ai/src/models.ts`, `packages/pi-ai/src/index.ts`, `packages/pi-coding-agent/src/core/model-registry.ts`, and any other conflicted files
  - Do:
    1. For each conflicted file, resolve by keeping local (models.dev) version unless upstream has unrelated improvements
    2. Key files to keep local version:
       - `packages/pi-ai/src/models.ts` — keep simplified version without MODELS import
       - `packages/pi-ai/src/index.ts` — keep exports for models-dev modules and SNAPSHOT
       - `packages/pi-coding-agent/src/core/model-registry.ts` — keep cachePath parameter, async refresh, models.dev integration
    3. New files from M001/M002 (models-dev.ts, models-dev-types.ts, etc.) should remain — they don't exist upstream
    4. `git add` resolved files
  - Verify: `git diff --cached` shows coherent resolution favoring models.dev architecture
  - Done when: All conflicts resolved, staged for commit

- [x] **T03: Commit merge and verify build** `est:15m`
  - Why: Must complete the merge and verify the codebase builds
  - Files: n/a (git commit + build)
  - Do:
    1. `git commit` to complete the merge
    2. `npm run build -w @gsd/pi-ai`
    3. Fix any build errors introduced by merge
  - Verify: Build exits 0 with no TypeScript errors
  - Done when: Merge committed, build succeeds

- [x] **T04: Run full test suite** `est:15m`
  - Why: Must verify M001/M002 behavior survives the merge
  - Files: n/a (test execution)
  - Do:
    1. `npm test -w @gsd/pi-ai` — run 32 pi-ai tests
    2. `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — run 9 scenario tests
    3. Fix any test failures introduced by merge
  - Verify: All tests pass (32 + 9 = 41 total)
  - Done when: All tests pass with clean exit

- [x] **T05: Document reconciliation** `est:10m`
  - Why: Future reviewers and agents need to understand merge decisions
  - Files: `.gsd/DECISIONS.md`
  - Do:
    1. Append D023 with merge strategy (merge over rebase)
    2. Append D024 with conflict resolution approach (favor models.dev architecture)
    3. Include merge commit hash
  - Verify: DECISIONS.md contains new entries D023, D024
  - Done when: Reconciliation decisions documented

## Files Likely Touched

- `packages/pi-ai/src/models.ts` — conflict resolution (keep local)
- `packages/pi-ai/src/index.ts` — conflict resolution (keep local)
- `packages/pi-coding-agent/src/core/model-registry.ts` — conflict resolution (keep local)
- `.gsd/DECISIONS.md` — append reconciliation decisions

## Observability / Diagnostics

- **Runtime signals:** Git merge state visible via `git status`, conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in conflicted files
- **Inspection commands:** `git status`, `git diff`, `git log --oneline -5`, `git diff --cached`
- **Failure visibility:** Conflicts appear as "both modified" in status; merge blocks commit until resolved
- **Redaction:** None required — git operations don't expose credentials or secrets
