# S01: Upstream Merge and Verification — UAT

**Milestone:** M003
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The slice is about git operations and test verification — the artifacts are the git history, passing tests, and documented decisions. No live UI or runtime behavior to manually inspect.

## Preconditions

1. Working directory is on branch `gsd/M003/S01` or equivalent
2. Node.js and npm available
3. Git repository with `origin` remote pointing to `gsd-build/gsd-2`

## Smoke Test

```bash
git log --oneline -1 | grep -q "Merge remote-tracking branch 'origin/main'"
```

Should show the merge commit at HEAD.

## Test Cases

### 1. Verify merge commit exists

1. Run: `git log --oneline -5`
2. **Expected:** Top commit shows `Merge remote-tracking branch 'origin/main'` (commit `ded3ac3b` or similar)

### 2. Verify clean working directory

1. Run: `git status --porcelain`
2. **Expected:** Empty output (no uncommitted changes)

### 3. Verify build succeeds

1. Run: `npm run build -w @gsd/pi-ai`
2. **Expected:** Exits 0, no TypeScript errors

### 4. Verify pi-ai tests pass

1. Run: `npm test -w @gsd/pi-ai`
2. **Expected:** "32 tests passed", exit 0

### 5. Verify scenario tests pass

1. Run: `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js`
2. **Expected:** "9 tests passed", exit 0

### 6. Verify decisions documented

1. Run: `grep -E "D023|D024|D025" .gsd/DECISIONS.md`
2. **Expected:** Three lines matching D023, D024, D025

### 7. Verify models.dev architecture preserved

1. Run: `grep -q "refreshFromModelsDev" packages/pi-coding-agent/src/core/model-registry.ts`
2. **Expected:** Exit 0 (pattern found)

1. Run: `grep -q "SNAPSHOT" packages/pi-ai/src/index.ts`
2. **Expected:** Exit 0 (pattern found)

## Edge Cases

### Upstream changes in unrelated files

1. Run: `git show HEAD --stat | head -5`
2. **Expected:** Shows `.github/workflows/build-native.yml` as the only changed file from upstream (or other unrelated files) — no changes to `models.ts`, `model-registry.ts`, `models-dev*.ts`

## Failure Signals

- `git status` shows uncommitted changes → merge incomplete or files unstaged
- Build fails with TypeScript errors → merge broke type compatibility
- Tests fail → merge introduced behavioral regression
- `grep` for D023/D024/D025 returns nothing → documentation task incomplete
- `refreshFromModelsDev` not found → models.dev architecture accidentally replaced

## Requirements Proved By This UAT

- R011 — Merge commit in git history + tests passing proves reconciliation succeeded
- R012 — Clean git status + passing build + passing tests proves PR-ready state

## Not Proven By This UAT

- Actual GitHub PR creation (explicitly out of scope per R012)
- CI/CD pipeline behavior (only local verification done)

## Notes for Tester

- The live test (part of the 32 pi-ai tests) makes a real network call to models.dev — if offline, set `LIVE_MODELS_DEV_TEST=false` to skip
- All verification is local; no external services required beyond the optional live test
