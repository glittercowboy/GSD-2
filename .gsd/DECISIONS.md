# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | arch | Secret collection insertion point | At `/gsd auto` entry (startAuto), not as a dispatch unit type | Keeps the state machine untouched. Collection is a one-time gate, not a repeating unit. Simpler, less risk of dispatch loop bugs. | Yes — if collection needs to happen mid-milestone |
| D002 | M001 | convention | Manifest file naming | `M00x-SECRETS.md` via existing `resolveMilestoneFile(base, mid, "SECRETS")` | Consistent with all other milestone-level files (CONTEXT, ROADMAP, RESEARCH). No new path resolver needed. | No |
| D003 | M001 | pattern | Summary screen interactivity | Read-only with auto-skip (no interactive deselection) | Matches the "walk away" philosophy. Simpler UX, fewer edge cases. User can always re-run collection. | Yes — if users request deselection |
| D004 | M001 | pattern | Guidance display placement | Same page as masked input (above the editor) | Single page per key — no extra navigation. User sees guidance while entering the value. | Yes — if terminal height constraints cause problems |
| D005 | M001 | convention | Manifest format | Markdown with H3 sections per key, bold fields, numbered guidance | Consistent with all other .gsd files. Parser and formatter already exist in files.ts. | No |
| D006 | M001 | arch | Destination inference | Reuse existing `detectDestination()` from get-secrets-from-user.ts | Simple file-presence checks (vercel.json → Vercel, convex/ → Convex, default → .env). Already proven. | Yes — if per-key destination override needed |
| D007 | M002 | arch | File structure after module split | Split index.ts into state.ts, lifecycle.ts, capture.ts, settle.ts, refs.ts, utils.ts, evaluate-helpers.ts, and tools/ directory | 5000-line monolith is unmaintainable; module boundaries enable safe changes. core.js already established the pattern. | No |
| D008 | M002 | library | Image resizing library | sharp | Fast, well-maintained, standard Node image processing. Replaces fragile canvas-based approach that depends on page context. | No |
| D009 | M002 | convention | Navigate screenshot default | Off by default, opt-in via parameter | Big token savings. Agent uses browser_screenshot explicitly when visual verification needed. | Yes — if agents consistently need screenshots on navigate |
| D010 | M002 | arch | Browser-side utility injection | page.addInitScript under window.__pi namespace | Survives navigation, available before page scripts, namespaced to avoid collisions. | Yes — if timing issues discovered |
| D011 | M002 | convention | Intent resolution approach | Deterministic heuristics only, no LLM calls | Predictable latency and cost. Scoring functions are testable and debuggable. | Yes — if heuristic coverage proves insufficient |
| D012 | M002 | convention | Browser reuse across sessions | Skip completely | Architecturally different from within-session work; user directed to exclude entirely. | No |
