<!-- Project/App: GSD-2 -->
<!-- File Purpose: ADR for unifying TUI rendering on copy-clean content surfaces. -->

# ADR-019: Unify the TUI Style System Around Copy-Clean Content Surfaces

**Status:** Accepted
**Date:** 2026-05-18
**Author:** TUI audit (Phase 2)
**Related:** `docs/tui-audit.md` (Phase 2)

## Context

Two problems converge here.

**1. Users cannot cleanly copy TUI output.** Terminal text selection is the
terminal's job, not the application's — when a user selects text, the
terminal copies every character on those lines, including any border or
padding the app drew. Today every content surface (message turns, tool
output, bash output, summaries) is wrapped in a box: a vertical `│ ` or rail
`┃ ` prefixes every body line. Users have complained that copying output
means hand-stripping those prefixes and the border rows. This is a real,
recurring usability defect.

**2. The style system is fragmented.** The TUI draws bordered/padded
surfaces through **four independent border implementations**:

1. `packages/pi-tui/src/style.ts` — `TerminalStyle`, an immutable builder.
   Border modes `none / rule / single / rounded / heavy / minimal`, density,
   tone, titles. Framework-agnostic (takes color functions). Consumers:
   `tool-execution.ts`, `chat-frame.ts`, `adaptive-layout.ts`.
2. `tui-style-kit.ts` — `roundedPanel()` + `badge` / `keyValue` /
   `padRight` / `alignRight` / `breakpoint`. Consumers: `adaptive-layout.ts`,
   `transcript-design.ts`.
3. `transcript-design.ts` — hand-rolled `cardRow()` plus the
   `renderTranscriptCard` / `renderToolLineCard` / `renderCommandCard` family
   and the `renderUserRail` / `renderAssistantRail` rail renderers.
   Consumers: `user-message`, `assistant-message`, `footer`,
   `tool-execution`, `bash-execution`.
4. `chat-frame.ts` — `renderChatFrame()`, a third hand-rolled rounded box.
   Consumers: `skill-invocation-message`, `compaction-summary-message`.

They overlap heavily and the dependency graph is tangled
(`transcript-design.ts` imports `tui-style-kit.ts`; `chat-frame.ts` imports
`style.ts`). On top of that, transcript messages use three incompatible
container vocabularies — rail (`┃` + bg fill), framed (`╭╮╰╯`), and
box-background — so adjacent components don't visually agree.

Note: `TerminalStyle`'s existing `rule` mode is **not** copy-clean — it
still prefixes body lines with `│ `. None of the four current
implementations produce copy-clean output.

## Decision

### 1. Content surfaces are copy-clean

Surfaces whose text users read and copy — **message turns, tool output,
bash output, compaction/skill/branch summaries** — render with
**horizontal-rule framing**:

- A top rule line carrying the label/status: `─── bash · success ───────`.
- Body lines with **zero leading characters** — no `│`, no `┃`, no left
  padding glyphs. A body line contains only its content.
- An optional bottom rule line.

Selecting body lines then copies exactly that text. If a selection happens
to include a rule line, it copies as a single row of dashes — harmless and
easily dropped.

The rail (`┃` prefix) and the box-background style are both **eliminated** —
both put characters on every content line.

### 2. One border primitive

`TerminalStyle` (`pi-tui/src/style.ts`) is the **only** code permitted to
draw borders, rules, and padding. It is the most complete implementation and
belongs in the engine package (framework-agnostic, theme-decoupled).

A new border mode — **`open`** — is added to `TerminalStyle`: top rule with
optional title/right-title, body lines emitted with no prefix and no border
column, optional bottom rule. (The existing `rule` mode is left as-is for
any caller that still wants the `│ ` gutter, or removed if it has no
remaining consumers after migration.)

`tui-style-kit.ts`, the `transcript-design.ts` card renderers, and
`chat-frame.ts` stop drawing borders themselves and delegate to
`TerminalStyle`.

### 3. One app-level vocabulary module

`transcript-design.ts` becomes the single module pi-coding-agent components
import for surface rendering. It binds theme tokens to `TerminalStyle` and
exposes the two named surfaces below. `tui-style-kit.ts` is folded in and
deleted; `chat-frame.ts` is deleted; `badge` / `keyValue` / `breakpoint`
move into the vocabulary; generic helpers (`padRight` / `alignRight`) move
to `pi-tui` utils.

### 4. Two surfaces, chosen by role

- **Open** — every content surface (message turns, tool/bash output,
  summaries). Horizontal-rule framing, copy-clean, via `TerminalStyle`'s
  `open` mode. Tool calls are content (an artifact a user reads and copies),
  so they are Open, not bordered.
- **Panel** — interactive UI only: dialogs, selectors, overlays. Keeps the
  bordered `rounded` `TerminalStyle` treatment. Nobody copies a menu, so the
  copy constraint does not apply; these are unchanged by this ADR.

A component picks its surface by **what it is**, never by author preference.

## Resolved decisions

- **Tool calls are an Open content surface**, not bordered — they are read
  and copied like any other output.
- **Delineation is horizontal-rule framing** (top/bottom rules, no vertical
  bars). Background-tint and indent-only were considered; rules win because
  they are copy-clean *and* legible regardless of theme background contrast.
- **Copy-clean rendering applies to content surfaces only.** Dialogs,
  selectors, and overlays keep their bordered panels.
- Panels (interactive) use `rounded` borders — the established house style.

## Consequences

**Positive**

- Selecting and copying TUI output yields clean text — the reported defect
  is fixed structurally, not per-component.
- One place to fix any border/rule/padding/truncation bug.
- New components have an unambiguous surface to conform to.
- `pi-tui` keeps a clean, theme-agnostic primitive; theme binding lives in
  exactly one app module.

**Negative / risks**

- Touches many files in one coherent effort — not a drive-by change.
- Visual identity shifts: the transcript loses its boxes and rail in favour
  of lighter rule-framed blocks. This is intentional but is a noticeable
  redesign — capture before/after screenshots per migration step.
- Vertical separation now relies on rules + blank-line rhythm rather than
  enclosing boxes; the spacing rhythm must be deliberate or surfaces will
  blur together. The consistency-pass step addresses this.
- The rail's baked-in background fill disappears; any theme that leaned on it
  for the user/assistant distinction now distinguishes turns by the header
  rule label instead.

## Implementation plan

Seven steps, each an independent stacked PR. Steps are ordered so every PR
leaves the TUI working.

1. **Add the `open` border mode to `TerminalStyle`** (`pi-tui`). Top rule +
   title, no body prefix, optional bottom rule. Unit-test that no body line
   gains a leading character. Purely additive.
2. **Add the vocabulary, no consumers yet.** In `transcript-design.ts`, add
   `openSurface()` (built on `TerminalStyle.border("open")`) and keep
   `panel()` for interactive UI. Additive — nothing calls `openSurface` yet.
3. **Migrate `chat-frame.ts` consumers.** Point `skill-invocation-message`
   and `compaction-summary-message` at `openSurface()`. Delete `chat-frame.ts`.
4. **Re-base the card renderers.** Reimplement `renderTranscriptCard` /
   `renderToolLineCard` / `renderCommandCard` on `openSurface()`; delete the
   hand-rolled `cardRow()` and border code. Migrate `tool-execution.ts` and
   `bash-execution.ts`.
5. **Convert the rail.** `user-message.ts` and `assistant-message.ts` move
   from `renderUserRail` / `renderAssistantRail` to `openSurface()`; delete
   the rail renderers and their background fill.
6. **Fold in `tui-style-kit.ts`.** Move `badge` / `keyValue` / `breakpoint`
   into the vocabulary; relocate `padRight` / `alignRight` to `pi-tui` utils;
   update `adaptive-layout.ts`. Delete `tui-style-kit.ts`.
7. **Consistency pass.** One blank-line rhythm and rule weight across all
   Open surfaces; unify keyboard-hint footers through `keybinding-hints.ts`.

Verification per step: `tsc --noEmit` on both packages, the `pi-tui` test
suite, a manual before/after screenshot of the affected surfaces, and a
manual copy-paste check confirming body lines copy without prefixes.
