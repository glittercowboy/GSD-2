# S05: Start/resume workflow controls

**Goal:** Users can start new work, resume interrupted work, stop auto-mode, and switch sessions from visible UI controls instead of typing hidden terminal commands.
**Demo:** Dashboard shows a context-aware action bar (Start Work / Stop / Resume based on phase + auto state), a session picker for switching/resuming sessions, and the sidebar has a quick-action button mirroring the primary action — all backed by real store state through the existing `sendCommand` transport.

## Must-Haves

- Primary action derives from `boot.workspace.active.phase` + `boot.auto.active` + `boot.auto.paused` and maps to the correct GSD command (`/gsd auto`, `/gsd stop`, `/gsd`, `/gsd next`)
- Action controls disable when `commandInFlight` is non-null, `bootStatus !== "ready"`, or `boot.onboarding.locked` is true
- Dashboard action bar renders between the header and metrics grid with primary + secondary actions
- Dashboard session picker shows `boot.resumableSessions` with switch (via `switch_session` command) and new session (via `new_session` command) capabilities
- Sidebar quick-action button mirrors the dashboard primary action for one-click access from any view
- `refreshBoot({ soft: true })` is called after successful session switch to update stale state
- All actions use `sendCommand` — no new API endpoints

## Observability / Diagnostics

- `deriveWorkflowAction` returns `disabledReason` string when controls are disabled, surfacing _why_ the user can't act (command in flight, boot not ready, onboarding locked)
- Dashboard action bar shows a visible "Sending…" spinner when `commandInFlight` is non-null, so the user sees that their click was received
- Terminal lines are emitted for every `sendCommand` call (input line + response line), providing a durable audit trail of workflow actions
- Session switch emits terminal lines and triggers `refreshBoot({ soft: true })`, so stale state is never silently served after a switch
- No secrets or credentials are involved in workflow controls — all commands are slash-command strings or typed RPC payloads
- Failure visibility: `sendCommand` catches errors and writes them to `lastClientError` + terminal, so failed workflow actions are always visible in the terminal feed and the sidebar error banner

## Verification

- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — action derivation returns correct action for each phase/auto/onboarding/commandInFlight combination
- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — disabled conditions produce correct `disabledReason` strings (failure-path coverage)
- `npm run build:web-host` — all new components compile cleanly into the standalone build

## Integration Closure

- Upstream surfaces consumed: `sendCommand`, `buildPromptCommand`, `refreshBoot`, `commandInFlight`, `boot.workspace.active.phase`, `boot.auto`, `boot.resumableSessions`, `boot.onboarding.locked`, `bootStatus` from `gsd-workspace-store.tsx`; `getCurrentScopeLabel`, `getSessionLabelFromBridge` helpers
- New wiring introduced in this slice: pure `deriveWorkflowAction` function + three additive UI surfaces calling existing store actions
- What remains before the milestone is truly usable end-to-end: S06 (continuity + failure visibility), S07 (assembly proof)

## Tasks

- [x] **T01: Add workflow action derivation, dashboard controls, sidebar quick action, and contract test** `est:45m`
  - Why: This is the entire slice — a pure derivation function, three additive UI surfaces, and a contract test. No new APIs or store fields needed; everything maps existing state to `sendCommand` calls.
  - Files: `web/lib/workflow-actions.ts`, `web/components/gsd/dashboard.tsx`, `web/components/gsd/sidebar.tsx`, `src/tests/web-workflow-controls-contract.test.ts`
  - Do: (1) Create `web/lib/workflow-actions.ts` with a pure `deriveWorkflowAction` function mapping `(phase, auto, onboarding, commandInFlight, bootStatus)` → `{ primary: { label, command, icon }, secondaries: [...], disabled, disabledReason }`. Phase→command mapping: `planning` → `/gsd`, `executing|summarizing` → `/gsd auto`, auto active → `/gsd stop`, auto paused → `/gsd auto` (resume), no milestones → `/gsd`. (2) Add a dashboard action bar section between the header and metrics grid rendering the primary action button + any secondary actions. (3) Add a session picker section to the dashboard showing `resumableSessions` with switch buttons (sends `{ type: "switch_session", sessionPath }`) and a new-session button (sends `{ type: "new_session" }`). Call `refreshBoot({ soft: true })` after successful switch. (4) Add a quick-action button to the sidebar below the explorer/scope section that mirrors the dashboard primary action. (5) Write `web-workflow-controls-contract.test.ts` testing the pure derivation function across all phase/auto/onboarding combinations. (6) Verify build.
  - Verify: `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` passes, `npm run build:web-host` succeeds
  - Done when: Dashboard shows context-aware action bar and session picker, sidebar shows quick-action button, all derived from real store state, contract test passes, build succeeds

## Files Likely Touched

- `web/lib/workflow-actions.ts` (new — pure derivation function)
- `web/components/gsd/dashboard.tsx` (add action bar + session picker sections)
- `web/components/gsd/sidebar.tsx` (add quick-action button)
- `src/tests/web-workflow-controls-contract.test.ts` (new — contract test for derivation logic)
