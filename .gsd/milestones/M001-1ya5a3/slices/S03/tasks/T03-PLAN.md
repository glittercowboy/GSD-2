---
estimated_steps: 4
estimated_files: 5
---

# T03: Add UserBlock, ToolStub, and polish streaming UX

**Slice:** S03 — Message Stream + Markdown Rendering
**Milestone:** M001-1ya5a3

## Description

Complete the message stream with all block types and polish the overall visual quality. Create `UserBlock` for user prompts and `ToolStub` for tool execution placeholders. Import streamdown's CSS for caret animations. Polish spacing, typography rhythm, and auto-scroll behavior. This is the final quality pass that makes S03 demo-ready — after this, the message stream looks premium.

**Relevant skills:** `make-interfaces-feel-better` (spacing, visual rhythm, micro-details)

## Steps

1. **Create `studio/src/renderer/src/components/message-stream/UserBlock.tsx`.** Styled display of the user's prompt:
   - Shows the prompt text with subtle visual distinction from assistant text.
   - Design: left amber accent border (`border-l-2 border-accent/60`), slightly different background (`bg-bg-secondary/30`), padding, rounded corners.
   - Text styled as body text (`text-[15px] leading-7 text-text-primary`).
   - Include a small "You" label above the text in `text-text-tertiary text-[12px] font-medium uppercase tracking-wide`.
   - Simple component — just a styled div with the prompt text. No markdown rendering (user prompts are plain text).

2. **Create `studio/src/renderer/src/components/message-stream/ToolStub.tsx`.** Minimal placeholder for tool execution events that S04 will replace with bespoke cards:
   - Shows the tool name in a compact single-line layout.
   - Design: subtle bordered container (`border border-border/60 rounded-[8px] bg-bg-secondary/30 px-4 py-2.5`), tool name in `text-[13px] font-mono text-text-secondary`, a small right-facing chevron icon (Phosphor `CaretRight`) to indicate expandability.
   - If status is `'running'`, show a subtle pulse animation on the tool name or a small spinner indicator.
   - If status is `'done'`, show a check icon in `text-emerald-500/70`.
   - If status is `'error'`, show an X icon in `text-red-500/70`.
   - Keep it minimal — this is a placeholder. S04 replaces the entire component with bespoke tool cards.
   - Import tool name formatting: capitalize, strip underscores → spaces (e.g., `tool_execution` → `Tool Execution`). Better: use the actual `toolName` from the block (e.g., "Edit", "Read", "Bash").

3. **Update `studio/src/renderer/src/components/message-stream/MessageStream.tsx`.** Wire in the new components and polish:
   - Import `UserBlock` and `ToolStub`.
   - Update the block rendering switch: `user-prompt` → `<UserBlock>`, `tool-use` → `<ToolStub>`, `assistant-text` → `<AssistantBlock>` (already done in T02).
   - **Spacing between blocks:** Use `gap-6` on the container flex column for breathing room between message types. Between consecutive assistant-text blocks that are part of the same turn, use tighter spacing (`gap-1`).
   - **Max-width constraint:** Wrap the block list in `mx-auto max-w-3xl w-full` to keep the reading width comfortable (matching the existing CenterPanel max-w-3xl).
   - **Empty state:** When `blocks` is empty, render an empty state with the Phosphor `SparkleIcon` and "Send a prompt to start a session" text (port from the original CenterPanel EmptyState, or keep it inline).
   - **Auto-scroll refinement:** Ensure the scroll-to-bottom triggers on `blocks` content changes (not just `events.length`). Use a ref to track the last rendered block count or content hash. The `useEffect` dependency should be `blocks` (the derived array) not `events`.

4. **Update `studio/src/renderer/src/styles/index.css`.** Add the streamdown styles import for caret animations:
   - Add `@import "streamdown/styles.css";` after the tailwind import. This provides the CSS for the block caret animation.
   - If the import causes issues with Vite/Tailwind processing, alternatively copy the relevant keyframes into the CSS file directly (the caret is a simple blinking animation).
   - Verify caret appears during streaming and disappears cleanly when `isAnimating` becomes false.

## Must-Haves

- [ ] UserBlock renders user prompts with amber accent border and "You" label
- [ ] ToolStub renders tool names with status indicator (running/done/error)
- [ ] Streamdown caret CSS imported — block caret animates during streaming
- [ ] Empty state shows when no messages
- [ ] Auto-scroll follows streaming content, respects manual scroll-up (80px threshold)
- [ ] Consistent spacing between blocks — document feels like a cohesive flow, not disconnected cards
- [ ] `npm run build -w studio` passes

## Verification

- `npm run build -w studio` — zero errors
- Dev app: user prompts render with amber left border and "You" label
- Dev app: tool execution events render as compact stubs with tool name and status icon
- Dev app: streaming cursor (block caret) appears during generation, disappears when streaming ends
- Dev app: empty state shows before first message (SparkleIcon + prompt text)
- Dev app: auto-scroll follows new content; scroll up manually → stays put → new content doesn't yank back
- Dev app: overall spacing between blocks feels cohesive — no jarring gaps or cramped sections

## Inputs

- `studio/src/renderer/src/components/message-stream/MessageStream.tsx` — container to update (from T01 + T02)
- `studio/src/renderer/src/components/message-stream/AssistantBlock.tsx` — already rendering (from T02)
- `studio/src/renderer/src/lib/message-model.ts` — MessageBlock types including `user-prompt` and `tool-use` variants
- `studio/src/renderer/src/styles/index.css` — main CSS file for streamdown import
- Streamdown caret: requires `import "streamdown/styles.css"` and `caret="block" isAnimating={bool}` on the component (already set in T02's AssistantBlock)
- Phosphor icons: `SparkleIcon`, `CaretRight`, `Check`, `X` from `@phosphor-icons/react`

## Observability Impact

- **New inspection surfaces:** UserBlock and ToolStub are visible in React DevTools component tree. ToolStub's `status` prop reflects the live tool execution state (`running` → `done`/`error`).
- **Diagnostic path:** Inspect block rendering: open React DevTools → find `MessageStream` → check child components are `UserBlock`, `ToolStub`, or `AssistantBlock` with correct props. Empty state renders when `blocks.length === 0`.
- **Failure visibility:** If streamdown caret CSS fails to load, the block caret animation won't appear during streaming — visible immediately as a missing cursor. If Phosphor icons fail to import, ToolStub status indicators will be blank (React error boundary would catch).
- **Auto-scroll diagnostics:** `isNearBottom` ref can be inspected via React DevTools on the MessageStream component. If auto-scroll misbehaves, check that `scrollRef.current.scrollHeight - scrollTop - clientHeight < 80` is evaluating correctly.

## Expected Output

- `studio/src/renderer/src/components/message-stream/UserBlock.tsx` — styled user prompt display
- `studio/src/renderer/src/components/message-stream/ToolStub.tsx` — minimal tool execution placeholder
- `studio/src/renderer/src/components/message-stream/MessageStream.tsx` — updated with all block types, spacing, empty state
- `studio/src/renderer/src/styles/index.css` — streamdown styles imported for caret animation
- The complete message stream is now demo-ready: user prompts, streaming markdown with highlighting, tool stubs, cursor, scroll behavior
