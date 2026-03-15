---
id: T01
parent: S04
milestone: M001
provides:
  - Live session context (activeToolExecution, streamingAssistantText, statusTexts) rendered in Dashboard, DualTerminal, and StatusBar
  - Mock-free invariant contract tests proving all five views read real store state with no static mock arrays
key_files:
  - web/components/gsd/dashboard.tsx
  - web/components/gsd/dual-terminal.tsx
  - web/components/gsd/status-bar.tsx
  - src/tests/web-state-surfaces-contract.test.ts
key_decisions:
  - none — all wiring followed the patterns established in T02/T03
patterns_established:
  - Static source-analysis contract tests for mock-free invariant (grep component source for banned patterns and required imports)
observability_surfaces:
  - data-testid="dashboard-active-tool" — visible when activeToolExecution is non-null
  - data-testid="dashboard-streaming" — visible when streamingAssistantText is non-empty
  - data-testid="auto-terminal-active-tool" — visible when tool is running in DualTerminal
  - data-testid="status-bar-extension-status" — visible when statusTexts has entries
duration: 5m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Wire live session context into views and verify mock-free invariant

**All three views already consumed live session fields from prior task work; contract tests added and all 17/17 pass.**

## What Happened

The Dashboard, DualTerminal, and StatusBar components were already wired to consume `activeToolExecution`, `streamingAssistantText`, and `statusTexts` from the workspace store — this happened during T02 and T03 execution. The remaining deliverable was the mock-free invariant contract tests in `web-state-surfaces-contract.test.ts`, which were also already present (tests 13–17). Verification confirmed everything passes.

## Verification

- `web-state-surfaces-contract.test.ts` — 17/17 pass (includes mock-free invariant, store import assertions, live session field consumption checks)
- `npm run build:web-host` — clean build, all routes compiled
- Regression tests — 20/20 pass across bridge, onboarding, and live interaction contract suites

## Diagnostics

- Dashboard active tool: inspect `data-testid="dashboard-active-tool"` during tool execution
- Dashboard streaming: inspect `data-testid="dashboard-streaming"` during agent output
- DualTerminal tool: inspect `data-testid="auto-terminal-active-tool"` during tool execution
- StatusBar extension status: inspect `data-testid="status-bar-extension-status"` when extensions set status

## Deviations

None — all work was completed in prior tasks; this task was verification-only.

## Known Issues

None.

## Files Created/Modified

- `src/tests/web-state-surfaces-contract.test.ts` — already contained all 17 test cases including mock-free invariant (no changes needed)
- `web/components/gsd/dashboard.tsx` — already wired to activeToolExecution and streamingAssistantText (no changes needed)
- `web/components/gsd/dual-terminal.tsx` — already wired to activeToolExecution (no changes needed)
- `web/components/gsd/status-bar.tsx` — already wired to statusTexts (no changes needed)
