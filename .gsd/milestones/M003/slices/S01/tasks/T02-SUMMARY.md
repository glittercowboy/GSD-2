---
id: T02
parent: S01
milestone: M003
provides:
  - All 7 GSD extension core modules (auto.ts, index.ts, commands.ts, state.ts, preferences.ts, types.ts, git-service.ts) resolved and staged with upstream's versions
  - Zero conflict markers in all 7 target files
key_files:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/index.ts
  - src/resources/extensions/gsd/commands.ts
  - src/resources/extensions/gsd/state.ts
  - src/resources/extensions/gsd/preferences.ts
  - src/resources/extensions/gsd/types.ts
  - src/resources/extensions/gsd/git-service.ts
key_decisions:
  - "D047: Take upstream for all 7 modules without fork re-additions — no web code imports from these files"
  - "D046: Use upstream's centralized invalidateAllCaches() from cache.ts — fork's individual cache clears are obsolete"
patterns_established:
  - "When fork and upstream diverged, verify web import graph before assuming fork additions need preservation — src/web/ only imports from native-git-bridge.ts, not any GSD extension core modules"
observability_surfaces:
  - "rg '<<<<<<|>>>>>>|======' src/resources/extensions/gsd/{auto,index,commands,state,preferences,types,git-service}.ts → must be empty"
  - "rg 'formatHookStatus' src/resources/extensions/gsd/auto.ts → must be empty (lives in post-unit-hooks.ts)"
duration: 15m
verification_result: passed
completed_at: 2026-03-16T18:08:00-04:00
blocker_discovered: false
---

# T02: Resolve GSD extension core module conflicts

**Took upstream for all 7 GSD extension core modules — no fork re-additions needed since web code doesn't import from these files.**

## What Happened

Saved fork pre-merge versions to `/tmp/fork-ref/` for comparison. Analyzed each of the 7 conflicted files by diffing fork vs upstream to identify fork-only additions.

Key discovery: **no web code imports from any of these 7 modules.** `src/web/` only imports from `native-git-bridge.ts`, which was already resolved in T01. The plan anticipated fork web bridge hooks in `index.ts` (~62 lines) and web types in `types.ts` — neither existed. Fork's additions were internal optimizations that upstream independently implemented or superseded:

- **auto.ts**: Fork's dispatch gap watchdog and post-unit-hooks imports already in upstream. Fork's individual cache clears (`clearParseCache`, `clearPathCache`) replaced by upstream's centralized `invalidateAllCaches()` from `cache.ts`.
- **index.ts**: Only diff was a single error-handling line — upstream extracted to `pauseAutoForProviderError()` helper.
- **commands.ts**: Upstream already has hooks subcommand.
- **state.ts**: Fork had manual frontmatter re-serialization for batch-parsed files; upstream replaced this with DB-first content loading + simpler `rawContent` fallback plus debug instrumentation.
- **preferences.ts**: Upstream rewrote (747+/133-). Fork additions were consuming upstream exports — all subsumed.
- **types.ts**: Both were additive with no overlap. Upstream's version includes all types the fork used.
- **git-service.ts**: Upstream slimmed from ~476 lines to ~94 (moved to native-git-bridge.ts). Fork changes (46+/41-) were in the removed code.

Resolution: `git checkout upstream/main -- <file>` + `git add` for all 7.

## Verification

- ✅ `rg "<<<<<<|>>>>>>|======" src/resources/extensions/gsd/{auto,index,commands,state,preferences,types,git-service}.ts` → empty (zero conflict markers)
- ✅ `rg "formatHookStatus" src/resources/extensions/gsd/auto.ts` → no matches (lives in post-unit-hooks.ts)
- ✅ Upstream `commands.ts` has hooks subcommand
- ✅ Upstream `state.ts` has enhanced derivation (debugTime, debugCount, isDbAvailable)
- ✅ Upstream `git-service.ts` is slimmed version (517 lines vs fork's ~1000+)
- ✅ No duplicate exports across files

Slice-level checks (partial — T02 is intermediate):
- `git diff --name-only --diff-filter=U` → empty (no unmerged files from git's perspective)
- 5 other gsd/ files still have conflict markers (T03 scope: files.ts, activity-log.ts, dashboard-overlay.ts, guided-flow.ts, worktree-manager.ts)
- `git log --oneline HEAD..upstream/main | wc -l` → 0 (all upstream commits present in merge)
- `package-lock.json` → absent (expected at this stage)

## Diagnostics

- **Conflict marker scan**: `rg "<<<<<<|>>>>>>|======" src/resources/extensions/gsd/{auto,index,commands,state,preferences,types,git-service}.ts`
- **Remaining files to resolve (T03)**: `rg "^<<<<<<" src/resources/extensions/gsd/ --count` — shows files.ts, activity-log.ts, dashboard-overlay.ts, guided-flow.ts, worktree-manager.ts
- **Cache API change**: Upstream uses `invalidateAllCaches()` from `cache.ts`. If T04 build finds web code calling individual cache clears, update to use centralized API.

## Deviations

- Plan expected fork web bridge hooks in index.ts (~62 lines) and web types in types.ts — neither existed. No fork re-additions were needed for any of the 7 files.
- Plan expected fork state fields to re-add in state.ts — upstream independently implemented the same (and better) batch parse logic with DB-first loading.

## Known Issues

- Fork's `clearParseCache` and `clearPathCache` imports are no longer available from upstream. Any web code referencing these individually will need updating in T04 to use `invalidateAllCaches()` from `cache.ts`.
- 5 remaining gsd/ extension files have conflict markers — T03 scope.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — took upstream (140KB, decomposed auto module)
- `src/resources/extensions/gsd/index.ts` — took upstream (pauseAutoForProviderError helper)
- `src/resources/extensions/gsd/commands.ts` — took upstream (15+ subcommands including hooks)
- `src/resources/extensions/gsd/state.ts` — took upstream (DB-first loading, debug instrumentation)
- `src/resources/extensions/gsd/preferences.ts` — took upstream (major rewrite)
- `src/resources/extensions/gsd/types.ts` — took upstream (expanded types)
- `src/resources/extensions/gsd/git-service.ts` — took upstream (slimmed, moved to native-git-bridge)
