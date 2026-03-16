# Knowledge Base

## Git Merge: Duplicate Conflict Hunks in Large Files

When a file has the same pattern repeated (e.g., a type definition and its usage both diverged identically), git produces multiple conflict hunks with nearly identical marker content. `edit` tool matches on exact text, so if you edit the first hunk, a second identical hunk may remain. After resolving conflicts in any file, always run `rg "^<<<<<<<|^>>>>>>>|^=======$" <file>` to catch duplicates before staging.

## Git Index Lock from Parallel Commands

Running multiple `git` commands in parallel (e.g., `git checkout` and `git add` simultaneously) causes `index.lock` contention. Always run git commands sequentially in the same repo. If you hit `index.lock`, `rm -f .git/index.lock` and retry.

## Conflict Marker Search: Use Anchored Patterns

`rg "<<<<<<|>>>>>>|======" packages/` matches comment divider lines (`// ====...`). Use anchored patterns `rg "^<<<<<<<|^>>>>>>>|^=======$"` to match only real conflict markers.
