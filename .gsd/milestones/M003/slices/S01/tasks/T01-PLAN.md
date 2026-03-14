---
estimated_steps: 3
estimated_files: 0
---

# T01: Fetch and merge upstream

**Slice:** S01 — Upstream Merge and Verification
**Milestone:** M003

## Description

Fetch the current state of `origin/main` from `gsd-build/gsd-2` and initiate a merge into the local milestone branch. This will surface conflicts that need explicit resolution in T02.

## Steps

1. Run `git fetch origin` to update remote tracking refs
2. Run `git merge origin/main` to begin the merge
3. Oberve which files have conflicts (expecting: models.ts, index.ts, model-registry.ts based on research)

## Must-Haves

- [ ] Remote refs updated with current upstream state
- [ ] Merge initiated (either clean or with conflicts visible)

## Verification

- `git log origin/main --oneline -1` — shows latest upstream commit
- `git status` — shows merge in progress with conflicted files, or clean merge completion

## Inputs

- Current local branch with M001/M002 commits
- `origin/main` from `gsd-build/gsd-2`

## Expected Output

- Merge in progress with conflicts in key files (models.ts, index.ts, model-registry.ts)
- OR clean merge if upstream has no conflicting changes

## Observability Impact

- **Signals changed:** `git status` output will show merge state, `git log` shows new commits
- **Inspection:** Use `git status`, `git diff --cached`, `git log --oneline -5` to inspect merge state
- **Failure visibility:** Merge conflicts appear as "both modified" in git status with conflict markers in files
- **Redaction:** None — git operations don't expose secrets
