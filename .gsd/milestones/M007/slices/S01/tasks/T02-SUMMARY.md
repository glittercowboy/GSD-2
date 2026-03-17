---
id: T02
parent: S01
milestone: M007
provides:
  - TUI select prompt detection — ink-style numbered option lists produce prompt.kind==='select' with options[] and selectedIndex
  - Text prompt detection — @clack/prompts ◆-prefixed text prompts produce prompt.kind==='text' with label
  - Password/API-key prompt detection — prompts matching API key / password / token patterns produce prompt.kind==='password'
  - CompletionSignal debounce — 2-second silence after main prompt reappearance before emitting (false-positive guard)
  - selectedIndex tracking — prompt.selectedIndex reflects the highlighted option (0-based) at time of commit
key_files:
  - web/lib/pty-chat-parser.ts
key_decisions:
  - TUI option detection must run BEFORE isPromptLine — the GSD cursor glyph "›" is also a PROMPT_MARKER; processing order is: TUI option lines → prompt boundary → system lines → clack prompts → regular content
  - Select block committed by hints line (↑/↓) or window timer (300ms) — hints are the reliable commit signal; timer is the fallback
  - 2-second debounce on CompletionSignal — cancels if any new PTY input arrives; re-arms on next prompt line; conservative to avoid premature panel close
  - Clack (onboarding) prompts detected by ◆/▲/? prefix + trailing colon — password kind matched by API key / password / token / secret in label
patterns_established:
  - Select block accumulator: options upserted by 1-based index during window; committed and sorted on hints/timer; MIN_SELECT_OPTIONS=2 guard prevents false positives from single numbered lines
  - Option label header captured after bar line (──────) and stored as TuiPrompt.label
  - _lastHeaderText set only when _looksLikeQuestionHeader() is true (after bar, not just any content)
  - Completion signal: _completionEmitted flag prevents double-fire if timer fires before the feed() cancel path runs
observability_surfaces:
  - '[pty-chat-parser] tui prompt detected kind=select options=N selectedIndex=N source=...' — fires when select block commits
  - '[pty-chat-parser] tui prompt detected kind=text label=... source=...' — fires on text prompt match
  - '[pty-chat-parser] tui prompt detected kind=password source=...' — fires on password prompt match
  - '[pty-chat-parser] completion signal scheduled (debounce=2000ms) source=...' — fires when prompt reappears
  - '[pty-chat-parser] completion signal emitted source=... debounce=Nms' — fires when 2s elapses with no new output
  - 'parser.getMessages().filter(m => m.prompt)' — DevTools inspection surface for all TUI prompt states
duration: ~45min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: TUI Prompt Detector and Completion Signal Emitter

**Extended `web/lib/pty-chat-parser.ts` with ink/clack TUI prompt detection and debounced CompletionSignal emission; all 23 fixture assertions pass.**

## What Happened

Extended the existing `PtyChatParser` class with:

1. **Select prompt detection** — GSD's shared UI renders select lists with numbered options, using `› N. Label` (selected) and `  N. Label` (unselected) after ANSI stripping. A `SelectBlock` accumulator collects options as they arrive; a 300ms window timer is the fallback commit, but the hints line (`↑/↓ to move`) is the primary commit trigger. Options are sorted by their 1-based index; the selected option drives `prompt.selectedIndex` (0-based). A bar line (`───────`) signals a block boundary and resets `_lastHeaderText` so the next non-option line gets captured as the prompt label.

2. **Text and password detection** — GSD's onboarding uses `@clack/prompts` which renders `◆  Label:` style prompts. A password-specific regex matches labels containing `API key`, `password`, `token`, or `secret` (case-insensitive). Any other `◆`/`▲`/`?`-prefixed colon-terminated line becomes `kind:'text'`. Both patterns attach a `TuiPrompt` to the currently active (or newly started) assistant message.

3. **CompletionSignal debounce** — When the main GSD prompt (`❯`, `›`, `>`, `$`) reappears, a 2-second timer is set. Any `feed()` call during that window cancels the timer. If 2 seconds elapse with no new PTY input, the signal fires. An `_completionEmitted` flag prevents double-fire on the rare race between timer and cancel.

4. **Processing order fix** — The most important implementation finding: `isPromptLine` uses `›` as a match pattern, and GSD's cursor glyph for selected option lines is also `›`. TUI option line detection was moved before `isPromptLine` to prevent selected options from being incorrectly treated as prompt boundaries.

## Verification

```
cd /Users/sn0w/Documents/dev/GSD-2 && npx tsx --tsconfig web/tsconfig.json web/lib/pty-chat-parser.fixture.ts
# Result: 23 passed, 0 failed

cd /Users/sn0w/Documents/dev/GSD-2/web && npx tsc --noEmit 2>&1 | grep "pty-chat-parser"
# Result: (no output) — zero errors from pty-chat-parser.ts
```

Fixture assertions confirmed:
- `stripAnsi()` regression: CSI colors, OSC sequences ✓
- T01 segmentation regression: user/assistant role assignment, no ANSI leak ✓
- Select prompt: 3 options, selectedIndex=0 (first selected), label from header ✓
- selectedIndex: option B highlighted → selectedIndex=1 ✓
- Password prompt: `◆  Paste your Anthropic API key:` → `kind='password'`, label matches ✓
- Text prompt: `◆  Enter project name:` → `kind='text'`, label matches ✓
- CompletionSignal: fires exactly once after 2s debounce, not before ✓
- CompletionSignal debounce cancelled when new input arrives before 2s ✓
- Unsubscribe works — no second signal after `unsub()` ✓
- No ANSI leak in any message content ✓

## Diagnostics

- `parser.getMessages().filter(m => m.prompt)` in DevTools → inspect `kind`, `label`, `options[]`, `selectedIndex`
- `[pty-chat-parser] tui prompt detected kind=...` log confirms detection fired and when
- `[pty-chat-parser] completion signal scheduled/emitted` logs show timer and debounce behavior
- If `options` is wrong length: the `SELECT_WINDOW_MS=300` window may be too short for slow PTY streams — increase to 500ms
- If `prompt` is `undefined` on expected select: verify the description lines (5-space indent) aren't matching `SELECT_OPTION_UNSELECTED_RE`

## Deviations

- Step 9 (selectedIndex update via cursor-up/down ANSI): not implemented. ANSI cursor sequences are stripped before line processing, so raw arrow key sequences aren't visible after stripping. Instead, `selectedIndex` is derived from which option has the `›` prefix at commit time — reflecting the state the TUI rendered, not keystroke tracking. This is functionally equivalent since ink re-renders the full list on each navigation step.
- Checkbox options (step 4 re: `◯`/`●` bullets): GSD's actual UI uses `[x]`/`[ ]` boxes, not `◯`/`●` unicode bullets. Checkbox detection implemented using the actual `CHECKBOX_SELECTED_RE` pattern matching `[x]`/`[ ]` prefix.

## Known Issues

- Description lines below options (5-space indent) that happen to start with a digit+dot (e.g., `     1. Some description`) would be misidentified as unselected options. In practice GSD option descriptions don't start with numbered patterns, but this is an edge case.
- `_looksLikeQuestionHeader` applies only when `_lastHeaderText === ''` (after a bar) or `_pendingSelect !== null`. This means question header text is only captured if it appears between a bar line and the first option — which is the GSD pattern. Unusual prompts with header text not preceded by a bar won't populate `prompt.label`.

## Files Created/Modified

- `web/lib/pty-chat-parser.ts` — extended with TUI detection, select block accumulator, clack prompt patterns, 2s completion debounce; ~480 lines total
- `.gsd/milestones/M007/slices/S01/tasks/T02-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
- `.gsd/KNOWLEDGE.md` — added two new entries: select/promptLine ordering gotcha; fixture files in web/lib tsconfig pitfall
