# S04: Tool Cards — The Art — Research

**Date:** 2026-03-18

## Summary

S04 replaces the `ToolStub` placeholder component with bespoke, collapsed/expandable tool cards that are the visual centerpiece of the app. The work is large in surface area but architecturally straightforward — it's a UI decomposition problem on well-understood data shapes, not a risky integration challenge.

The existing codebase provides everything needed: `buildMessageBlocks()` already extracts `ToolUseBlock` with `toolName`, `toolCallId`, `status`, `args`, and `result` from the event stream. The TUI's `ToolExecutionComponent` (600+ lines in `packages/pi-coding-agent/src/modes/interactive/components/tool-execution.ts`) serves as the authoritative reference for what data each tool type exposes and how to render it — collapsed headers, expanded content, truncation, diffs, syntax highlighting, error states. The React implementation is a translation of those rendering decisions into Tailwind-styled JSX with Shiki for syntax highlighting (reusing the existing `codePlugin` and `components` from S03).

The key change needed beyond pure UI work: the `ToolUseBlock` type and `buildMessageBlocks()` must be enhanced to also process `tool_execution_update` events (for streaming partial results) and to carry the structured `result.details` separately from `result.content` — the current model only stores the raw `result` blob. This is a small, focused model change that unblocks all card rendering.

## Recommendation

Build bottom-up: first enhance the message model to carry richer tool data, then build the ToolCard shell (collapsed/expanded with animation), then build individual card types in priority order (Edit → Bash → Read → Write → then the rest), finally wire into MessageStream replacing ToolStub. The `diff` library (already a dependency of the pi-coding-agent package) should be installed in `studio` for intra-line diff highlighting in Edit cards. Shiki (already loaded via `@streamdown/code`) should be reused for code highlighting inside Read/Write/Edit cards.

## Implementation Landscape

### Key Files

- `studio/src/renderer/src/lib/message-model.ts` — **Needs modification.** Enhance `ToolUseBlock` type to carry structured tool data: separate `result.content` (text/image array) from `result.details` (tool-specific metadata like `diff`, `truncation`, `firstChangedLine`). Add `tool_execution_update` case to accumulate `partialResult`. Add `isError` boolean from `tool_execution_end`.
- `studio/src/renderer/src/components/message-stream/ToolStub.tsx` — **Replace entirely.** The stub passes `toolName` and `status` — the new ToolCard receives the full `ToolUseBlock`.
- `studio/src/renderer/src/components/message-stream/MessageStream.tsx` — **Needs modification.** Change the `tool-use` case in `BlockRenderer` to render the new ToolCard instead of ToolStub, passing the full block.
- `studio/src/renderer/src/components/markdown/components.tsx` — **Reuse as-is.** Import the `Components` object and `codePlugin` for rendering markdown inside expanded cards.
- `studio/src/renderer/src/components/markdown/shiki-theme.ts` — **Reuse as-is.** Shiki theme for code highlighting inside tool cards.
- `studio/src/renderer/src/styles/index.css` — **Minor additions.** Diff line colors (red/green bg for removed/added), expand animation keyframes.
- `studio/test/message-model.test.mjs` — **Needs new tests.** Cover `tool_execution_update` handling, structured result extraction, `isError` flag.
- `packages/pi-coding-agent/src/modes/interactive/components/tool-execution.ts` — **Reference only.** The authoritative rendering logic for every tool type — what data to extract from args/result, what to show collapsed vs expanded, truncation rules. Do NOT import from this file.
- `packages/pi-coding-agent/src/core/tools/edit-diff.ts` — **Reference only.** Diff format: unified diff string with `+NNN content`, `-NNN content`, ` NNN content` lines. The `details.diff` field contains this string.

### Tool Types and Their Card Data

Priority order based on frequency of use:

1. **Edit** — `args: { path, oldText, newText }`. `result.details: { diff: string, firstChangedLine?: number }`. Collapsed: path + line number + diff summary (e.g., "+3 -2 lines"). Expanded: syntax-highlighted unified diff with red/green removed/added lines and intra-line change highlighting.
2. **Bash** — `args: { command, timeout? }`. `result.content: [{type:'text', text:'...'}]`, `result.details: { truncation?, fullOutputPath? }`. Collapsed: `$ command` header + first ~5 lines. Expanded: full output. Terminal-styled monospace.
3. **Read** — `args: { path, offset?, limit? }`. `result.content: [{type:'text', text:'...'}]`, `result.details: { truncation? }`. Collapsed: path with line range + first ~10 lines syntax-highlighted. Expanded: full content.
4. **Write** — `args: { path, content }`. `result.content: [{type:'text', text:'...'}]`. Collapsed: path + line count. Expanded: syntax-highlighted file content.
5. **Grep** — `args: { pattern, path?, glob?, limit? }`. `result.content: text output`. Collapsed: `/pattern/` in path + match count. Expanded: full match listing.
6. **Find** — `args: { pattern, path?, limit? }`. Similar to grep.
7. **Ls** — `args: { path, limit? }`. Directory listing. Collapsed: path. Expanded: file list.
8. **Lsp** — `args: { action, file?, ... }`. Various LSP operations. Collapsed: action + file. Expanded: results.
9. **GenericCard** — Fallback for extension tools (browser_*, subagent, mcp_call, etc.). Collapsed: tool name. Expanded: JSON-formatted args + text result.

### Build Order

**Phase 1: Model Enhancement** — Modify `ToolUseBlock` and `buildMessageBlocks()` to carry structured result data (`content`, `details`, `isError`) and handle `tool_execution_update`. Add tests. This unblocks all card rendering.

**Phase 2: ToolCard Shell** — Build the shared `ToolCard` component: collapsed/expanded toggle, status indicator, expand/collapse animation (CSS transition on max-height or grid-rows), tool icon, header slot, content slot. Establish the visual language — border, background, border-radius, padding that fits the design system.

**Phase 3: Bespoke Cards** — Build each card type. Edit card is the riskiest (diff parsing + intra-line highlighting + syntax coloring). Bash card is next (terminal styling). Read/Write share code highlighting logic. Grep/Find/Ls are simpler text displays. Lsp is a variant. GenericCard is the JSON fallback.

**Phase 4: Integration** — Wire ToolCard into MessageStream replacing ToolStub. Update tests.

### Verification Approach

- `npm run test -w studio` — All existing tests pass plus new message-model tests for `tool_execution_update`, structured results, and `isError`
- `npm run build -w studio` — Zero build errors, all new components bundled
- `npx tsc --noEmit -p studio/tsconfig.web.json` — Zero type errors
- Visual verification: the build succeeds and components type-check. Live rendering verification deferred to UAT (requires connected gsd-2)

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Unified diff parsing (line-level) | Manual parser from diff string format | The diff format from `edit-diff.ts` is simple: `+NNN content`, `-NNN content`, ` NNN content`. Parse with regex — no library needed |
| Intra-line diff highlighting | `diff` npm package (v8) | Already used by the TUI (`packages/pi-coding-agent`). `Diff.diffWords()` gives word-level change detection. Install `diff` + `@types/diff` in studio |
| Code syntax highlighting | Shiki via `@streamdown/code` (already loaded) | S03 already loads the Shiki WASM bundle. Reuse by calling the Shiki highlighter directly for code inside cards. Import `codeToHtml` or use `<Streamdown>` wrapping for code content |
| File extension → language detection | Simple extension map | The TUI has `getLanguageFromPath()` but it's not importable. Build a small utility (20-line map of common extensions → Shiki language IDs) |

## Constraints

- **No imports from pi-coding-agent** — Studio is fully decoupled per architecture decision. All tool-specific rendering logic must be self-contained in `studio/src/renderer/`. The TUI's `tool-execution.ts` is reference only.
- **Shiki is async** — `codeToHtml()` returns a Promise. Code blocks inside tool cards must handle the async loading (show unhighlighted text first, replace when highlighting completes, or use Streamdown's existing lazy approach).
- **`tool_execution_update` is not currently handled** — The message model skips it. Must add a case for partial result accumulation, keyed by `toolCallId`.
- **`result` in `tool_execution_end` is the full `AgentToolResult`** — Shape: `{ content: [{type:'text'|'image', text?:'...', data?:'...', mimeType?:'...'}], details: <tool-specific> }`. But it arrives as `data.result` in the raw event, so it's `unknown` and needs runtime type narrowing.
- **500-event cap in session store** — `MAX_EVENTS = 500` in `session-store.ts`. Long sessions with many tool calls may drop earlier events. Tool cards render from the derived blocks, which is fine — the blocks capture the last state of each tool.

## Common Pitfalls

- **Diff string format assumptions** — The unified diff from `edit-diff.ts` uses `+NNN content` / `-NNN content` / ` NNN content` lines with a `---` separator between hunks. Don't assume standard unified diff format (`@@` hunks) — this is a custom compact format. Parse it by checking the first character of each line.
- **Shiki language ID mismatch** — Shiki uses TextMate grammar names (e.g., `typescript` not `ts`, `javascript` not `js`). The file extension → language map must use Shiki-compatible IDs. Check Shiki's bundled languages list.
- **XCircle icon collision** — K006: Don't import `X` from Phosphor — it's aliased to `AlignBottomSimple`. Use `XCircle` for error states (already established pattern from S03).
- **Expand animation jank** — CSS `max-height` transitions are janky when the real height is unknown. Use `grid-template-rows: 0fr → 1fr` or measure with ResizeObserver for smooth expand/collapse.
- **`result` may be undefined while tool is running** — `tool_execution_start` has args but no result. `tool_execution_end` adds the result. Cards must handle the running state (show args only, spinner).

## Open Risks

- **Shiki highlighting for code inside tool cards may need a different API than Streamdown provides** — Streamdown handles markdown→HTML with Shiki. For raw code strings (Read/Write card content), we may need to call `codeToHtml()` from `shiki` directly rather than through Streamdown. This may require installing `shiki` as a direct dependency (it's currently a transitive dep via `@streamdown/code`). Alternatively, wrap code in markdown fences and render through Streamdown — simpler but less control.
- **Large tool results may cause render performance issues** — A Read of a 2000-line file or a Bash with thousands of lines of output could bloat the DOM. The collapsed state should truncate aggressively (5-10 lines preview). The expanded state should consider virtualization for very large content, but initial implementation can render all lines and defer optimization.
