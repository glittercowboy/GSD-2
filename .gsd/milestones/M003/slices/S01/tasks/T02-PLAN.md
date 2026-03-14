---
estimated_steps: 8
estimated_files: 6
---

# T02: Resolve merge conflicts

**Slice:** S01 — Upstream Merge and Verification
**Milestone:** M003

## Description

Resolve all merge conflicts by keeping the local models.dev architecture while incorporating any unrelated upstream improvements. Key files must preserve M001/M002 behavior.

## Steps

1. Run `git status` to list all conflicted files
2. For each conflicted file, examine the conflict markers
3. Resolve `packages/pi-ai/src/models.ts` — keep local version (no MODELS import, simplified registry)
4. Resolve `packages/pi-ai/src/index.ts` — keep local exports for models-dev modules and SNAPSHOT
5. Resolve `packages/pi-coding-agent/src/core/model-registry.ts` — keep cachePath parameter, async refresh, models.dev integration
6. For any other conflicted files, keep local version unless upstream has clear bug fixes or unrelated improvements
7. Verify new M001/M002 files (models-dev.ts, models-dev-types.ts, etc.) are preserved — they don't exist upstream
8. Stage all resolved files with `git add`

## Must-Haves

- [ ] All conflict markers removed from files
- [ ] M001/M002 behavior preserved (cache/fallback chain, async refresh, testability injection)
- [ ] All resolved files staged for commit

## Verification

- `git diff --cached` — shows coherent resolutions
- `grep -r "<<<<<<" packages/` — returns no matches (no remaining conflict markers)
- Key files contain models.dev integration code (not legacy MODELS import)

## Inputs

- Conflicted files from T01 merge
- M001/M002 implementation as the "local" side of conflicts

## Expected Output

- All conflicted files resolved and staged
- Working directory ready for merge commit
