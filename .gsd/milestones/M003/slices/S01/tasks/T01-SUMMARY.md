---
id: T01
parent: S01
milestone: M003
provides:
  - Merge initiated with upstream/main (415 upstream commits)
  - 35 of 50 conflicted files resolved and staged
  - package.json merged with both fork web scripts and upstream deps
  - package-lock.json deleted pending T04 regeneration
key_files:
  - package.json
  - .github/workflows/ci.yml
  - packages/pi-ai/src/env-api-keys.ts
  - packages/pi-coding-agent/src/core/settings-manager.ts
  - packages/pi-tui/src/components/editor.ts
key_decisions:
  - Took upstream for all 8 prompt .md files (including plan-slice.md which wasn't in original plan) — fork refinements were minor wording tweaks around skill preferences and context budget guidance; upstream versions are more current
  - Upstream's copy-resources/copy-themes/copy-export-html scripts (moved to .cjs files) replace fork's inline node -e commands
patterns_established:
  - Take-upstream for test files — upstream rewrote tests for new APIs; fork-specific web tests live in separate non-conflicting files
observability_surfaces:
  - "git diff --name-only --diff-filter=U" shows 15 remaining conflicted files for T02/T03
  - "rg '^<<<<<<<' src/" confirms conflict markers only in expected GSD extension + CLI files
duration: ~25min
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Execute merge and resolve trivial + mechanical conflicts

**Merged upstream/main and resolved 35 of 50 conflicted files — package.json, CI, packages/, prompts, tests, native, and take-upstream batch all clean.**

## What Happened

1. `git fetch upstream` pulled 415 new commits (upstream advanced to v2.22.0 since research was done at v2.21).
2. `git merge upstream/main` produced 50 conflicted files as expected.
3. Batch take-upstream (10 files): .gitignore, CHANGELOG.md, git.rs, 5 native package.json files, native-git-bridge.ts, post-unit-hooks.ts.
4. Deleted orphaned-branch.test.ts (upstream deletion accepted).
5. Deleted package-lock.json (T04 will regenerate via `npm install`).
6. Resolved package.json: took upstream version (2.22.0), kept fork's `stage:web-host`, `build:web-host`, `gsd:web`, `gsd:web:stop`, `gsd:web:stop:all` scripts, adopted upstream's extracted copy-*.cjs scripts.
7. Resolved ci.yml: upstream added `typecheck:extensions` step to windows-portability job. Fork had no web CI steps — single clean conflict.
8. Resolved packages/ (3 files): env-api-keys.ts (added ollama-cloud provider), settings-manager.ts (added ModelDiscovery interface + getters/setters), editor.ts (layout cache now includes cursor position for invalidation).
9. Took upstream for all 8 prompt files (7 planned + plan-slice.md that was also conflicted).
10. Took upstream for 11 test files + pack-install.test.ts. app-smoke.test.ts auto-merged (no conflict).

## Verification

- `rg "^<<<<<<<|^>>>>>>>|^=======$" .github/ native/ packages/.../env-api-keys.ts packages/.../settings-manager.ts packages/.../editor.ts CHANGELOG.md .gitignore package.json src/.../prompts/ src/.../tests/ src/tests/ src/.../native-git-bridge.ts src/.../post-unit-hooks.ts` → exit 1 (no matches = clean)
- `grep "build:web-host" package.json` → found (fork's web build script preserved)
- `grep "stage:web-host" package.json` → found (fork's staging script preserved)
- `test -f package-lock.json` → absent (correctly deleted)
- `git diff --name-only --diff-filter=U | wc -l` → 15 remaining (all in expected GSD extension + CLI scope)
- Remaining: auto.ts, index.ts, commands.ts, state.ts, preferences.ts, types.ts, git-service.ts, files.ts, activity-log.ts, dashboard-overlay.ts, guided-flow.ts, worktree-manager.ts, cli.ts, loader.ts, onboarding.ts

## Diagnostics

- `git diff --name-only --diff-filter=U` — shows exactly which files T02/T03 need to resolve
- `rg "^<<<<<<<" src/` — quick conflict marker scan for remaining work
- Merge is in progress (not committed) — `git status` shows "All conflicts fixed but you are still merging" after T03 resolves last 15

## Deviations

- plan-slice.md was also conflicted (not listed in original 7 prompt files). Took upstream — same strategy as the others.
- app-smoke.test.ts auto-merged during `git merge` and didn't need `git checkout upstream/main`. The checkout command was a no-op.
- Upstream advanced from v2.21 to v2.22.0 since research was done, resulting in 415 commits instead of 398.

## Known Issues

None.

## Files Created/Modified

- `package.json` — merged: upstream v2.22.0 + fork web scripts + upstream copy-*.cjs scripts
- `.github/workflows/ci.yml` — added upstream's typecheck:extensions to windows-portability job
- `packages/pi-ai/src/env-api-keys.ts` — added ollama-cloud API key mapping
- `packages/pi-coding-agent/src/core/settings-manager.ts` — added ModelDiscovery settings interface and accessors
- `packages/pi-tui/src/components/editor.ts` — layout cache now keyed by cursor position
- `.gitignore` — taken from upstream
- `CHANGELOG.md` — taken from upstream
- `native/crates/engine/src/git.rs` — taken from upstream
- `native/npm/*/package.json` (5 files) — taken from upstream
- `src/resources/extensions/gsd/native-git-bridge.ts` — taken from upstream
- `src/resources/extensions/gsd/post-unit-hooks.ts` — taken from upstream
- `src/resources/extensions/gsd/tests/orphaned-branch.test.ts` — deleted (upstream deletion)
- `package-lock.json` — deleted (T04 regenerates)
- `src/resources/extensions/gsd/prompts/*.md` (8 files) — taken from upstream
- `src/resources/extensions/gsd/tests/*.test.ts` (10 files) + resolve-ts-hooks.mjs — taken from upstream
- `src/tests/integration/pack-install.test.ts` — taken from upstream
