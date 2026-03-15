---
id: T03
parent: S04
milestone: M001
provides:
  - GET /api/files endpoint serving .gsd/ directory tree and file content with path traversal protection
  - FilesView wired to real API, no hardcoded file data
  - Contract test covering workspace index risk/depends/demo, shared status helpers, and files API security
key_files:
  - web/app/api/files/route.ts
  - web/components/gsd/files-view.tsx
  - src/tests/web-state-surfaces-contract.test.ts
key_decisions:
  - Files API uses type "directory" (not "folder") to match filesystem semantics; FilesView FileNode interface updated accordingly
  - Path security uses both structural rejection (.. and absolute path checks) and resolved-path containment verification
  - Files API reads GSD_WEB_PROJECT_CWD env var directly (same pattern as bridge-service) rather than importing resolveWebConfig
patterns_established:
  - API route pattern for scoped filesystem access with security validation in web/app/api/files/route.ts
  - Contract test pattern for testing Next.js route handlers directly via imported GET function with Request objects
observability_surfaces:
  - "GET /api/files returns { tree: FileNode[] }; GET /api/files?path=X returns { content: string }"
  - "400 with { error } for path traversal; 404 for missing files; 413 for oversized files"
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Add .gsd/ files API, wire FilesView, and write contract test

**Added GET /api/files endpoint scoped to .gsd/, rewired FilesView to fetch real files, and wrote 12-test contract suite covering workspace index extensions, status helpers, and files API security.**

## What Happened

Created `web/app/api/files/route.ts` with two modes: no query param returns `{ tree: FileNode[] }` with the recursive .gsd/ directory listing (sorted directories-first, alphabetical), and `?path=<relative>` returns `{ content: string }` for individual file reads. Security: rejects paths containing `..`, starting with `/`, or resolving outside .gsd/ with 400; returns 404 for missing files; returns 413 for files over 256KB.

Rewired `files-view.tsx` to fetch the tree from `/api/files` on mount and fetch file content on file selection. Removed the hardcoded `gsdFiles` constant entirely. Added loading, error, and empty states. The file tree now passes full relative paths (e.g. `milestones/M001/M001-ROADMAP.md`) for content fetches rather than just filenames.

Wrote `src/tests/web-state-surfaces-contract.test.ts` with 12 tests in 5 groups: (1) workspace index extracts risk/depends/demo from roadmap, (2) workspace index handles slices without those fields, (3) shared status helpers return correct done/in-progress/pending for milestones, slices, and tasks, (4) files API returns tree listings and file content, (5) files API rejects path traversal and returns proper error codes.

## Verification

- `node --test src/tests/web-state-surfaces-contract.test.ts` — 12/12 pass
- `node --test web-bridge-contract.test.ts web-onboarding-contract.test.ts web-live-interaction-contract.test.ts` — 20/20 pass (no regressions)
- `npm run build:web-host` — compiles with zero errors, `/api/files` route visible in build output
- `grep -rn` for mock data constants across all five view files — zero matches

### Slice-level verification (all pass — this is the final task):
- ✅ `npm run build:web-host` — all five rewired views compile
- ✅ Contract test — 12/12 pass covering workspace index, status helpers, files API
- ✅ Regression tests — 20/20 pass
- ✅ Mock data grep — zero matches

## Diagnostics

- Tree listing: `curl http://localhost:3000/api/files` returns `{ tree: [...] }`
- File content: `curl http://localhost:3000/api/files?path=STATE.md` returns `{ content: "..." }`
- Security: `curl http://localhost:3000/api/files?path=../etc/passwd` returns 400 with `{ error: "..." }`
- Empty state: when .gsd/ doesn't exist, tree endpoint returns `{ tree: [] }`

## Deviations

- Test expectations adjusted for actual parser behavior: roadmap parser defaults `risk` to `"low"` when not specified (not `undefined`), defaults `depends` to `[]` (not `undefined`), and strips `"After this: "` prefix from demo text. These are correct parser behaviors, not bugs.

## Known Issues

None.

## Files Created/Modified

- `web/app/api/files/route.ts` — new API route for .gsd/ directory tree and file content
- `web/components/gsd/files-view.tsx` — rewired to fetch from /api/files, hardcoded gsdFiles removed
- `src/tests/web-state-surfaces-contract.test.ts` — new contract test (12 tests)
