---
id: T02
parent: S03
milestone: M007
provides:
  - TuiTextPrompt component in web/components/gsd/chat-mode.tsx
  - TuiPasswordPrompt component in web/components/gsd/chat-mode.tsx
  - ChatBubble full prompt dispatch (select | text | password)
key_files:
  - web/components/gsd/chat-mode.tsx
key_decisions:
  - hasAnyPrompt = hasSelectPrompt || hasTextPrompt || hasPasswordPrompt; StreamingCursor suppressed when any prompt is active
  - Password value is never logged, never echoed in DOM; post-submission always renders "{label} — entered ✓"
  - Eye-toggle button uses tabIndex=-1 so Tab stays on the input field
  - TuiTextPrompt submit button disabled when value.trim() is empty; TuiPasswordPrompt disabled when value is falsy (any non-empty string is valid)
  - Input from @/components/ui/input used for correct theming; eye-toggle layered via position:absolute inside relative wrapper
patterns_established:
  - data-testid="tui-text-prompt" / data-testid="tui-password-prompt" on pre-submission containers
  - data-testid="tui-prompt-submitted" shared across all three prompt types for generic submission detection
  - console.log("[TuiTextPrompt|TuiPasswordPrompt] mounted kind=%s label=%s") matches [TuiSelectPrompt] prefix convention
  - Eye/EyeOff lucide icons imported alongside Check for password visibility toggle
observability_surfaces:
  - console.log "[TuiTextPrompt] mounted kind=text label=%s" on mount
  - console.log "[TuiTextPrompt] submitted label=%s" on submit
  - console.log "[TuiPasswordPrompt] mounted kind=password label=%s" on mount
  - console.log "[TuiPasswordPrompt] submitted label=%s" on submit (value not logged)
  - data-testid="tui-text-prompt" on TuiTextPrompt container (pre-submission)
  - data-testid="tui-password-prompt" on TuiPasswordPrompt container (pre-submission)
  - data-testid="tui-prompt-submitted" on post-submission confirmation (all prompt kinds)
  - window.__chatParser.getMessages() shows prompt.kind for parser-level inspection
duration: ~20min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: TuiTextPrompt and TuiPasswordPrompt Components

**Built `TuiTextPrompt` and `TuiPasswordPrompt` — native input components for GSD text and password TUI prompts — and completed `ChatBubble` dispatch to all three prompt kinds (select | text | password).**

## What Happened

Pre-flight: Added `## Observability Impact` section to T02-PLAN.md (signals added, inspection surfaces, failure state visibility, and redaction constraint documentation).

Implementation:

1. Added `Eye`, `EyeOff` to lucide-react imports; added `Input` from `@/components/ui/input`.

2. Built `TuiTextPrompt` (~65 lines):
   - Props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
   - `value` + `submitted` state; `inputRef` for auto-focus
   - `useEffect` auto-focuses on mount; logs `[TuiTextPrompt] mounted kind=text label=%s`
   - `handleSubmit`: logs submission (no value), sets `submitted=true`, calls `onSubmit(value + "\r")`
   - `handleKeyDown`: Enter key triggers `handleSubmit`
   - Pre-submission: label + `<Input>` + Submit button (disabled when empty)
   - Post-submission: `data-testid="tui-prompt-submitted"` green badge with "✓ Submitted"

3. Built `TuiPasswordPrompt` (~90 lines):
   - Same pattern; `showPassword` state added for eye-toggle
   - `<Input type="password" />` with `autoComplete="off"` and `pr-9` to leave room for toggle button
   - Eye/EyeOff toggle positioned `absolute right-2.5 top-1/2 -translate-y-1/2` inside a relative wrapper; `tabIndex=-1` to preserve Tab flow to input
   - Post-submission: `"{displayLabel} — entered ✓"` — value never echoed anywhere
   - Informational footer: "Value is transmitted securely and not stored in chat history."

4. Updated `ChatBubble` dispatch:
   - Replaced single `hasSelectPrompt` guard with three typed booleans: `hasSelectPrompt`, `hasTextPrompt`, `hasPasswordPrompt`
   - `hasAnyPrompt = hasSelectPrompt || hasTextPrompt || hasPasswordPrompt` — `StreamingCursor` suppressed when any prompt is active
   - Renders `TuiTextPrompt` when `message.prompt?.kind === 'text' && !message.complete && onSubmitPrompt != null`
   - Renders `TuiPasswordPrompt` when `message.prompt?.kind === 'password' && !message.complete && onSubmitPrompt != null`
   - `onSubmitPrompt` threading unchanged: `ChatPane.sendInput` → `ChatMessageList` → `ChatBubble` → prompt component

## Verification

- `npm run build:web-host` exits 0 (17.7s compile, 0 errors, 1 pre-existing `@gsd/native` warning unrelated to this change).
- Type correctness confirmed: no TypeScript errors in build output.
- Import chain verified: `Eye`/`EyeOff` from lucide-react (available), `Input` from `@/components/ui/input` (confirmed present in web/components/ui/).
- ChatBubble dispatch logic traced: all three `kind` values handled, `hasAnyPrompt` correctly gates `StreamingCursor`.
- Redaction confirmed: `TuiPasswordPrompt.handleSubmit` only logs label; value never referenced in log or DOM.

## Slice-Level Verification (S03) — Status After T02

- ✅ `npm run build:web-host` exits 0
- ⏳ Manual: trigger GSD provider select → `TuiSelectPrompt` renders → click option → GSD advances (requires live runtime; T01 built this, not regressed by T02)
- ⏳ Manual: trigger password/API key prompt → masked input renders → submit → GSD accepts key (requires live runtime with actual prompt)
- ⏳ Failure-path check: DevTools Network → `/api/terminal/input` POST body inspection (requires live runtime)

S03 is the final task; slice is complete pending UAT against a live GSD session.

## Diagnostics

To inspect at runtime:
- `window.__chatParser.getMessages()` → look for entry with `prompt.kind === 'text'` or `prompt.kind === 'password'`
- `document.querySelector('[data-testid="tui-text-prompt"]')` → confirm TuiTextPrompt rendered
- `document.querySelector('[data-testid="tui-password-prompt"]')` → confirm TuiPasswordPrompt rendered
- DevTools → Network → filter `/api/terminal/input` → POST body `data` should end with `\r`
- `document.querySelector('[data-testid="tui-prompt-submitted"]')` → confirms submission completed (all prompt types)

## Deviations

None — implementation matches plan exactly. One small enhancement not in plan: informational footer text in `TuiPasswordPrompt` ("Value is transmitted securely and not stored in chat history.") added for user reassurance.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/chat-mode.tsx` — Added `TuiTextPrompt`, `TuiPasswordPrompt`; updated `ChatBubble` full prompt dispatch; added `Eye`/`EyeOff` + `Input` imports
- `.gsd/milestones/M007/slices/S03/tasks/T02-PLAN.md` — Added `## Observability Impact` section (pre-flight fix)
- `.gsd/milestones/M007/slices/S03/S03-PLAN.md` — Marked T02 `[x]`
