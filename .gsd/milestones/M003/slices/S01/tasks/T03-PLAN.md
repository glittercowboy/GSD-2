---
estimated_steps: 4
estimated_files: 2
---

# T03: Commit merge and verify build

**Slice:** S01 — Upstream Merge and Verification
**Milestone:** M003

## Description

Complete the merge with a commit, then verify the reconciled codebase builds without TypeScript errors. Fix any build issues introduced by the merge.

## Steps

1. Run `git commit` to complete the merge (default merge message is fine)
2. Run `npm run build -w @gsd/pi-ai` to compile TypeScript
3. If build fails, examine errors and fix:
   - Import path issues (should use .js specifiers per D017)
   - Type errors from merge conflicts
   - Missing dependencies or exports
4. Re-run build until it succeeds

## Must-Haves

- [ ] Merge committed to local branch
- [ ] Build exits 0 with no TypeScript errors

## Verification

- `git log --oneline -1` — shows merge commit
- `npm run build -w @gsd/pi-ai` — exits 0
- No TypeScript errors in build output

## Inputs

- Staged resolved files from T02
- Build configuration from M002 (Node16 module resolution, .js specifiers)

## Expected Output

- Merge commit in git history
- Compiled JavaScript in `packages/pi-ai/dist/`

## Observability Impact

- **Git state:** `git log --oneline -1` shows merge commit hash and message
- **Build signals:** TypeScript compiler output shows any errors with file paths and line numbers
- **Failure modes:** 
  - Import path errors — missing `.js` extension in ESM imports (D017)
  - Type mismatches — merge introduced conflicting type definitions
  - Missing exports — merged code references symbols not exported from models.dev modules
- **Inspection:** `git status` confirms clean working directory post-commit; `npm run build -w @gsd/pi-ai` exit code 0 confirms successful compilation
