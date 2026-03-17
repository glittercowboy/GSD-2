# S05 — Knowledge and Captures/Triage Page — Research

**Date:** 2026-03-16

## Summary

S05 builds browser surfaces for KNOWLEDGE.md viewing and CAPTURES.md viewing/triage. The upstream codebase provides `loadAllCaptures()`, `loadPendingCaptures()`, `markCaptureResolved()`, `markCaptureExecuted()`, and `CaptureEntry` type from `captures.ts`, plus `appendKnowledge()` and `resolveGsdRootFile(basePath, "KNOWLEDGE")` from `files.ts`/`paths.ts`. There is **no upstream knowledge parser** — `appendKnowledge()` writes table rows but nothing reads them back into structured data. The browser needs its own parser.

S04 established the exact pattern to follow: child-process service → API route → store state (using `CommandSurfaceDiagnosticsPhaseState<T>`) → panel component in a dedicated file. The three dispatch entries (`gsd-knowledge`, `gsd-capture`, `gsd-triage`) are already wired in S02 and render placeholders. Per D044, knowledge and captures share one combined page.

The primary implementation choice is whether knowledge/captures render inside the command-surface sheet (like S04 diagnostics) or as a full app-shell view (like S03 visualizer). Given that the dispatch routes to command-surface sections (not view-navigate), and these are project-context panels similar to diagnostics, the command-surface sheet approach is correct and consistent.

## Recommendation

Follow the S04 diagnostics pattern exactly:

1. Create two service files (`knowledge-service.ts`, `captures-service.ts`) using the child-process pattern
2. Create two API routes (`/api/knowledge` GET, `/api/captures` GET + POST)
3. Add browser-safe types to a new `knowledge-captures-types.ts` file
4. Add loading state and store actions to `command-surface-contract.ts` and `gsd-workspace-store.tsx`
5. Create `knowledge-captures-panel.tsx` component with combined view
6. Wire the three surface sections (`gsd-knowledge`, `gsd-capture`, `gsd-triage`) in `command-surface.tsx` to the new panel

The captures POST endpoint enables manual triage from the browser — calling `markCaptureResolved()` with a classification chosen by the user via UI controls, bypassing the LLM-driven triage flow that the TUI uses.

## Implementation Landscape

### Key Files

**Upstream sources (read-only — called via child process):**
- `src/resources/extensions/gsd/captures.ts` — `loadAllCaptures(basePath)` returns `CaptureEntry[]`, `markCaptureResolved(basePath, id, classification, resolution, rationale)` writes to CAPTURES.md, `loadPendingCaptures(basePath)` filters pending, `loadActionableCaptures(basePath)` filters unexecuted actionable. Types: `CaptureEntry`, `Classification` ("quick-task"|"inject"|"defer"|"replan"|"note"), `TriageResult`.
- `src/resources/extensions/gsd/files.ts` — `appendKnowledge(basePath, type, entry, scope)` writes to KNOWLEDGE.md in table format with auto-incrementing IDs (K001, P001, L001).
- `src/resources/extensions/gsd/paths.ts` — `resolveGsdRootFile(basePath, "KNOWLEDGE")` returns path to KNOWLEDGE.md, `gsdRoot(basePath)` returns `.gsd/` path.

**Service files to create:**
- `src/web/captures-service.ts` — Child-process service calling `loadAllCaptures()` and `markCaptureResolved()` from upstream `captures.ts`. Pattern: exactly like `forensics-service.ts` — `execFile` with `--import resolve-ts.mjs --experimental-strip-types --input-type=module --eval <script>`. The script imports `captures.ts` via `pathToFileURL`, calls the function, writes JSON to stdout.
- `src/web/knowledge-service.ts` — Simpler service. KNOWLEDGE.md has two possible formats: (1) freeform `## Title` sections with prose paragraphs (used in this project's `.gsd/KNOWLEDGE.md`), and (2) table format with `## Rules`, `## Patterns`, `## Lessons` sections containing `| K001 | scope | rule | ... |` rows (created by `appendKnowledge()`). The service can read the file directly via `readFileSync` using `resolveBridgeRuntimeConfig().projectCwd + "/.gsd/KNOWLEDGE.md"` — no child process needed since the file path is deterministic and doesn't require worktree resolution. Returns parsed entries with id/title/content/type.

**API routes to create:**
- `web/app/api/knowledge/route.ts` — GET handler calling `collectKnowledgeData()`, returns `KnowledgeData`. Pattern: identical to `web/app/api/forensics/route.ts`.
- `web/app/api/captures/route.ts` — GET handler calling `collectCapturesData()`, returns `CapturesData`. POST handler calling `resolveCaptureAction()` for triage, accepts `{ captureId, classification, resolution, rationale }`, returns success/error.

**Type file to create:**
- `web/lib/knowledge-captures-types.ts` — Browser-safe types: `KnowledgeEntry { id: string; title: string; content: string; type: "rule" | "pattern" | "lesson" | "freeform" }`, `KnowledgeData { entries: KnowledgeEntry[]; filePath: string; lastModified: string | null }`, `CapturesData { entries: CaptureEntry[]; pendingCount: number; actionableCount: number }`, `CaptureEntry` (mirrors upstream), `CaptureResolveRequest`, `CaptureResolveResult`.

**Existing files to modify:**
- `web/lib/command-surface-contract.ts` — Add `CommandSurfaceKnowledgeCapturesState` interface with `knowledge: CommandSurfaceDiagnosticsPhaseState<KnowledgeData>`, `captures: CommandSurfaceDiagnosticsPhaseState<CapturesData>`, `resolveRequest: { pending: boolean; lastError: string | null; lastResult: CaptureResolveResult | null }`. Add to `WorkspaceCommandSurfaceState`. Add `createInitialKnowledgeCapturesState()`. Reuse existing `CommandSurfaceDiagnosticsPhaseState<T>` generic (D058).
- `web/lib/gsd-workspace-store.tsx` — Add `loadKnowledgeData()`, `loadCapturesData()`, `resolveCaptureAction()` store actions following the `loadForensicsDiagnostics()` pattern (fetch → patch phase state). Add private `patchKnowledgeCapturesState()` helper. Export actions via the hooks.
- `web/components/gsd/command-surface.tsx` — Replace the generic `gsd-*` placeholder for `gsd-knowledge`, `gsd-capture`, `gsd-triage` with the new `KnowledgeCapturesPanel`. Add useEffect auto-load trigger (same pattern as diagnostics at line 385-391). Import from new panel file.

**Component file to create:**
- `web/components/gsd/knowledge-captures-panel.tsx` — Combined panel component. Two sections: Knowledge (list of entries with title/content/type badges) and Captures (list with status badges, classification labels, triage action buttons for pending entries). Uses shared DiagHeader/DiagError/DiagLoading/DiagEmpty from `diagnostics-panels.tsx` — these should be extracted or re-exported for reuse. The three dispatch sections map to the same component: `gsd-knowledge` focuses the Knowledge tab, `gsd-capture` and `gsd-triage` focus the Captures tab.

### Build Order

1. **Types first** — Create `knowledge-captures-types.ts` with all browser-safe types. This unblocks everything else.
2. **Services + API routes** — Create `captures-service.ts` (child-process pattern) and `knowledge-service.ts` (direct file read). Create API routes. Verify with `curl` or direct invocation.
3. **Contract + store** — Add state to `command-surface-contract.ts`, add actions to `gsd-workspace-store.tsx`. This is the state plumbing.
4. **Panel component + wiring** — Create `knowledge-captures-panel.tsx`, wire into `command-surface.tsx` replacing placeholders. Add useEffect auto-load trigger.
5. **Build verification** — `npm run build` + `npm run build:web-host`.

### Verification Approach

- `npm run build` — TypeScript compilation with all new types
- `npm run build:web-host` — Next.js production build with new routes and component
- Manual: start web host, open `/gsd knowledge` → should show parsed KNOWLEDGE.md entries; open `/gsd capture` → should show captures list (empty if no CAPTURES.md); open `/gsd triage` → should show captures with pending items highlighted
- Contract test: existing `web-command-parity-contract.test.ts` (118 tests) should continue passing — no dispatch changes needed
- API smoke: `curl http://localhost:3000/api/knowledge` returns JSON, `curl http://localhost:3000/api/captures` returns JSON

## Constraints

- All upstream extension modules (captures.ts, files.ts, paths.ts) use `.js` import extensions that Turbopack cannot resolve — the child-process pattern is mandatory for captures-service.ts. Knowledge-service can read the file directly since the path is deterministic.
- `markCaptureResolved()` rewrites CAPTURES.md in-place using regex section replacement. The POST endpoint must serialize concurrent resolve requests to avoid race conditions (single request at a time is fine for browser use — no parallel triage).
- KNOWLEDGE.md format is not standardized — it can be freeform headings with prose, or structured tables (from `appendKnowledge()`). The parser must handle both formats gracefully.
- The `exports` from captures.ts that the child script needs are all public: `loadAllCaptures`, `loadPendingCaptures`, `markCaptureResolved`, `loadActionableCaptures`, `CaptureEntry`.

## Common Pitfalls

- **DiagHeader/DiagError/etc. not exported** — The shared diagnostic UI components in `diagnostics-panels.tsx` are used internally by ForensicsPanel/DoctorPanel/SkillHealthPanel. The knowledge-captures panel needs the same components. Either extract to a shared file, or re-implement (they're small — ~5-15 lines each). Extracting is cleaner.
- **KNOWLEDGE.md freeform vs table format** — Don't assume one format. This project's KNOWLEDGE.md uses `## Title` headings with prose. Other projects using `/gsd knowledge rule ...` get table rows. The parser should detect format per-section.
- **Captures child script must export correctly** — `captures.ts` exports everything needed (`loadAllCaptures`, `markCaptureResolved`), but the child script must use `pathToFileURL` for the import (same pattern as forensics-service.ts). The module uses `import { gsdRoot } from "./paths.js"` internally, which resolve-ts.mjs handles.
- **POST endpoint needs basePath** — `markCaptureResolved(basePath, ...)` needs the project CWD. Get it from `resolveBridgeRuntimeConfig().projectCwd`, same as other services.
