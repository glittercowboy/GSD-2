# Knowledge Base

## Git Merge: Duplicate Conflict Hunks in Large Files

When a file has the same pattern repeated (e.g., a type definition and its usage both diverged identically), git produces multiple conflict hunks with nearly identical marker content. `edit` tool matches on exact text, so if you edit the first hunk, a second identical hunk may remain. After resolving conflicts in any file, always run `rg "^<<<<<<<|^>>>>>>>|^=======$" <file>` to catch duplicates before staging.

## Git Index Lock from Parallel Commands

Running multiple `git` commands in parallel (e.g., `git checkout` and `git add` simultaneously) causes `index.lock` contention. Always run git commands sequentially in the same repo. If you hit `index.lock`, `rm -f .git/index.lock` and retry.

## Conflict Marker Search: Use Anchored Patterns

`rg "<<<<<<|>>>>>>|======" packages/` matches comment divider lines (`// ====...`). Use anchored patterns `rg "^<<<<<<<|^>>>>>>>|^=======$"` to match only real conflict markers.

## GSD Extension Web Import Graph

Web code (`src/web/`) only imports from `native-git-bridge.ts` — NOT from auto.ts, index.ts, commands.ts, state.ts, preferences.ts, types.ts, or git-service.ts. When resolving merge conflicts in GSD extension core modules, check `rg 'from.*extensions/gsd/' src/web/` to verify whether fork additions actually have web consumers before spending time re-adding them.

## Upstream Cache API Consolidation

Upstream replaced per-module cache clears (`clearParseCache` from files.ts, `clearPathCache` from paths.ts, `invalidateStateCache` from state.ts) with `invalidateAllCaches()` from `cache.ts`. The individual exports may no longer exist. Any code importing them needs migration to the centralized API.
