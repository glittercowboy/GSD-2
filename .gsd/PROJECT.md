# GSD Studio

## What This Is

A local desktop coding agent app — a premium GUI for gsd-2. Built with Electron + Vite + React, it replaces the terminal experience with a beautifully designed three-column interface where you can see the conversation stream, the code being written, the file tree, and a live preview of what's being built — all at once.

The AI backend is gsd-2 communicating over its existing JSON-RPC protocol (stdin/stdout JSONL). The app spawns gsd-2 as a subprocess and renders its event stream as a continuous document flow with premium markdown rendering, bespoke tool cards with syntax highlighting and diffs, and wizard-style interactive prompts.

## Core Value

<!-- This is the primary value anchor for prioritization and tradeoffs.
     If scope must shrink, this should survive. -->

Tool cards that are art — beautiful, informative, syntax-highlighted cards for every tool call the agent makes. This is what you stare at 90% of the time while the agent works. If nothing else ships perfectly, the tool cards must be stunning.

## Current State

M001 is in progress. S01 and S02 are complete. The `studio/` Electron workspace boots a real desktop shell with the dark amber design system and a full bidirectional RPC pipe to gsd-2. GsdService spawns the agent as a subprocess, communicates over JSONL stdin/stdout with LF-only framing, handles crash recovery with exponential backoff, and auto-responds to interactive extension UI requests. The preload bridge routes events through six IPC channels to a Zustand session store, and the CenterPanel renders a live connection badge, scrollable raw event stream, and working composer. The next slice (S03) replaces raw JSON with structured markdown rendering.

## Architecture / Key Patterns

- **Desktop shell:** Electron + Vite + React (TypeScript)
- **UI primitives:** Radix (headless) + Tailwind CSS — custom component library, not shadcn
- **Design system:** Dark monochrome + warm amber accent, Inter + JetBrains Mono, Phosphor Icons
- **Code editor:** Monaco Editor with custom dark theme
- **Syntax highlighting (messages):** Shiki for code blocks in markdown
- **Diff rendering:** react-diff-viewer or custom diff component with Shiki highlighting
- **State management:** Zustand
- **AI backend:** gsd-2 spawned as subprocess via `RpcClient` from `@gsd/pi-coding-agent`
- **Preview pane:** Localhost iframe pointing at dev server the agent spawns
- **Electron IPC:** Main process manages gsd-2 subprocess, renderer communicates via contextBridge/preload

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001-1ya5a3: GSD Studio MVP — Full coding agent GUI with message stream, tool cards, editor, preview, and interactive prompts
