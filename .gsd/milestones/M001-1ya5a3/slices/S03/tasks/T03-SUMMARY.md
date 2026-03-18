---
id: T03
parent: S03
milestone: M001-1ya5a3
provides:
  - UserBlock component — styled user prompt display with amber accent border and "You" label
  - ToolStub component — minimal tool execution placeholder with status icons (running/done/error)
  - Polished MessageStream with gap-6 spacing, streamdown caret CSS, and auto-scroll keyed on derived blocks
key_files:
  - studio/src/renderer/src/components/message-stream/UserBlock.tsx
  - studio/src/renderer/src/components/message-stream/ToolStub.tsx
  - studio/src/renderer/src/components/message-stream/MessageStream.tsx
  - studio/src/renderer/src/styles/index.css
key_decisions:
  - Used Phosphor's named icon exports (CaretRight, Check, XCircle, CircleNotch) instead of generic Icon component — tree-shakes better
  - Auto-scroll useEffect depends on `blocks` (derived array) not `events.length` — triggers on actual content changes
patterns_established:
  - Block components receive only the data they need as flat props — UserBlock gets `text`, ToolStub gets `toolName`+`status` — no passing entire MessageBlock union
  - ToolStub formatToolName utility converts snake_case to Title Case for display
observability_surfaces:
  - React DevTools: UserBlock, ToolStub, AssistantBlock visible as named components with inspectable props
  - Streamdown caret CSS bundled — if caret doesn't animate, check sd-fadeIn/sd-blurIn keyframes in compiled CSS
duration: 12m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Add UserBlock, ToolStub, and polish streaming UX

**Created UserBlock with amber accent border and "You" label, ToolStub with animated status icons, polished MessageStream spacing to gap-6, imported streamdown caret CSS, and keyed auto-scroll on derived blocks**

## What Happened

Extracted the inline `UserPromptBlock` and `ToolUseBlockStub` from MessageStream into standalone polished components. `UserBlock` renders user prompts with a `border-l-2 border-accent/60` amber left border, a "You" label in uppercase tertiary text, and body text at 15px/leading-7 with `text-wrap: pretty`. `ToolStub` shows the tool name in monospace with a status icon: `CircleNotch` (spinning) for running, `Check` in emerald for done, `XCircle` in red for error, plus a `CaretRight` chevron hinting at future expandability from S04. Tool names are formatted via a `formatToolName` utility that converts snake_case to Title Case.

Updated MessageStream to import both new components and render them via the block dispatcher. Spacing between blocks uses `gap-6` for breathing room with `py-6` vertical padding. The auto-scroll `useEffect` now depends on `blocks` (the derived message array) rather than `events.length`, so it triggers on actual content changes. The empty state uses `Sparkle` (not `SparkleIcon`) from Phosphor for consistency.

Added `@import "streamdown/styles.css"` to `index.css` after the tailwind import. Verified the streamdown keyframe animations (`sd-fadeIn`, `sd-blurIn`, `sd-slideUp`, `[data-sd-animate]`) are present in the built CSS output.

## Verification

- `npm run test -w studio` — 34/34 pass, 0 fail
- `npm run build -w studio` — zero errors, built in 1.90s
- Verified streamdown CSS keyframes (`sd-fadeIn`, `sd-blurIn`, `[data-sd-animate]`) present in `studio/dist/renderer/assets/index-DyaDlJtT.css`
- Root `npm run test` has 169 failures — all pre-existing, caused by missing `packages/pi-ai/dist/index.js` in the worktree (not related to S03 changes)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run test -w studio` | 0 | ✅ pass | 167ms |
| 2 | `npm run build -w studio` | 0 | ✅ pass | 1.90s |
| 3 | `grep sd-fadeIn studio/dist/...css` | 0 | ✅ pass | <1s |
| 4 | `npm run test` (root) | 1 | ⚠️ pre-existing failures (169 fails in src/tests, src/resources — missing pi-ai dist) | 10.7s |

## Diagnostics

- Inspect UserBlock: React DevTools → find `UserBlock` → check `text` prop matches the user's prompt
- Inspect ToolStub: React DevTools → find `ToolStub` → check `toolName` and `status` props; status should transition from `running` to `done`/`error` as tool events arrive
- Caret animation: if block caret doesn't appear during streaming, check that `studio/dist/.../index-*.css` contains `sd-fadeIn` keyframes and that AssistantBlock has `isAnimating={true}` during streaming
- Auto-scroll: if scroll doesn't follow, inspect `isNearBottom.current` ref in React DevTools on the MessageStream component

## Deviations

- Used `Sparkle` instead of `SparkleIcon` for the empty state icon — `SparkleIcon` was previously imported but `Sparkle` is the standard Phosphor naming convention (both are valid exports, using the shorter form).
- Used `XCircle` instead of `X` for the error status icon — `X` is aliased to `AlignBottomSimple` in the Phosphor bundle (collision), so `XCircle` is the correct semantic choice for error indication.

## Known Issues

- Root `npm run test` fails with 169 errors due to missing `packages/pi-ai/dist/index.js` in the worktree — pre-existing infrastructure issue, not caused by S03 changes. The slice-scoped `npm run test -w studio` passes fully.

## Files Created/Modified

- `studio/src/renderer/src/components/message-stream/UserBlock.tsx` — new: styled user prompt with amber accent border and "You" label
- `studio/src/renderer/src/components/message-stream/ToolStub.tsx` — new: minimal tool placeholder with status icons and tool name formatting
- `studio/src/renderer/src/components/message-stream/MessageStream.tsx` — updated: wired UserBlock/ToolStub, gap-6 spacing, auto-scroll depends on blocks
- `studio/src/renderer/src/styles/index.css` — added streamdown/styles.css import for caret animations
- `.gsd/milestones/M001-1ya5a3/slices/S03/tasks/T03-PLAN.md` — added Observability Impact section
