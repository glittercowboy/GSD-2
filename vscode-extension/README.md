# GSD-2 — VS Code Extension

Control the [GSD-2 coding agent](https://github.com/gsd-build/gsd-2) directly from VS Code. Run autonomous coding sessions, chat with `@gsd`, monitor agent activity in real-time, and manage your workflow — all without leaving the editor.

![GSD Extension Overview](docs/images/overview.png)

## Requirements

- **GSD-2** installed globally: `npm install -g gsd-pi`
- **Node.js** >= 22.0.0
- **Git** installed and on PATH
- **VS Code** >= 1.95.0

## Quick Start

1. Install GSD: `npm install -g gsd-pi`
2. Install this extension
3. Open a project folder in VS Code
4. Click the **GSD icon** in the Activity Bar (left sidebar)
5. Click **Start Agent** or run `Ctrl+Shift+P` > **GSD: Start Agent**
6. Start chatting with `@gsd` in VS Code Chat or use the sidebar controls

---

## Feature Guide

### 1. Sidebar Dashboard

The sidebar is your command center. Click the **GSD icon** in the Activity Bar to open it.

![Sidebar Dashboard](docs/images/sidebar-dashboard.png)

**Header card** shows at-a-glance status:
- **Connection status** — green dot when connected, red when disconnected
- **Model name** — click to switch models
- **Session ID** — click to rename the session
- **Message count** and **thinking level** — click thinking to cycle levels
- **Context window** — thin progress bar showing how full the context is (green < 50%, yellow 50-80%, red > 80%)
- **Cost** — running session cost displayed in the header

**Sections are collapsible** — click any section header to collapse/expand. The state persists between refreshes.

---

### 2. Workflow Controls

The **Workflow** section provides one-click access to GSD's core automation commands.

![Workflow Controls](docs/images/workflow-controls.png)

| Button | What it does |
|--------|-------------|
| **Auto** | Start autonomous mode — GSD researches, plans, and executes automatically |
| **Next** | Execute one unit of work, then pause |
| **Quick** | Run a quick task without full planning (opens input box) |
| **Capture** | Capture a thought or idea for later triage (opens input box) |
| **Status** | Show current milestone/phase progress |
| **Fork** | Fork the session from any previous message |

These buttons send `/gsd <command>` prompts to the agent — they work exactly like typing the slash commands in chat.

---

### 3. Settings Panel

Toggle agent behaviors without leaving the sidebar.

![Settings Panel](docs/images/settings-panel.png)

| Toggle | Description |
|--------|-------------|
| **Auto-compact** | Automatically compress context when it gets large |
| **Auto-retry** | Retry failed operations automatically |
| **Steering** | Queue mode for steering messages: `all` (batch) or `1-at-a-time` |
| **Follow-up** | Queue mode for follow-up messages: `all` (batch) or `1-at-a-time` |

Click any pill to toggle its state.

---

### 4. Actions

Quick access to common operations.

![Actions Panel](docs/images/actions-panel.png)

| Button | Description |
|--------|-------------|
| **New** | Start a fresh session |
| **Compact** | Manually trigger context compaction |
| **Copy** | Copy the last agent response to clipboard |
| **Export** | Export the full conversation as HTML |
| **History** | Open the conversation history viewer |
| **Cmds** | Browse and run available GSD slash commands |
| **Stop Agent** | Shut down the agent process |

---

### 5. Chat Integration (`@gsd`)

Use `@gsd` in VS Code's built-in Chat panel (`Ctrl+Shift+I` / `Cmd+Shift+I`) to talk to the agent directly.

![Chat Participant](docs/images/chat-participant.png)

```
@gsd refactor the auth module to use JWT
@gsd /gsd auto
@gsd what's the current milestone status?
```

Features:
- **Auto-starts** the agent if it's not running
- **File context** — use `#file` references to include file context
- **Streaming** — shows tool execution progress in real-time
- **Clickable file anchors** — files modified by the agent appear as links
- **Token usage** — footer shows token counts for each response
- **Follow-up suggestions** — suggested next actions after each response

---

### 6. Activity Feed

The **Activity** panel shows a real-time log of every tool the agent executes.

![Activity Feed](docs/images/activity-feed.png)

Each entry shows:
- **Tool icon** — different icon per tool type (file, terminal, search, etc.)
- **Tool name + summary** — e.g., "Read src/index.ts", "Bash: npm test"
- **Status** — yellow (running), green (success), red (error)
- **Duration** — how long the tool execution took

Click on file-related items to open the file in the editor. Use the **clear** button in the view title to reset the feed.

---

### 7. Sessions

The **Sessions** panel lists all session files for the current workspace.

![Sessions Panel](docs/images/sessions-panel.png)

- Sessions are `.jsonl` files stored in `~/.pi/agent/sessions/<workspace>/`
- **Current session** is highlighted with a green icon
- **Click** any session to switch to it
- Shows friendly timestamps (Today, Yesterday, Mon 2:30 PM, etc.)
- Use the **refresh** button to rescan the sessions directory

---

### 8. Conversation History

Open the full conversation with **History** button or `Ctrl+Shift+P` > **GSD: Show Conversation History**.

![Conversation History](docs/images/conversation-history.png)

Features:
- **Full message rendering** — user and assistant messages with role headers
- **Tool call blocks** — collapsible blocks showing tool invocations and results
- **Thinking blocks** — collapsible thinking/reasoning from the model
- **Search** — filter messages by text content
- **Fork from here** — hover any message to see a "Fork" button that creates a new session branching from that point

---

### 9. Code Lens

Above every function and class declaration, GSD adds inline actions.

![Code Lens](docs/images/code-lens.png)

| Action | What it does |
|--------|-------------|
| **Ask GSD** | Explain the function/class |
| **Refactor** | Suggest improvements to clarity, performance, or structure |
| **Find Bugs** | Review for potential bugs and edge cases |
| **Tests** | Generate comprehensive test coverage |

Supported languages: TypeScript, JavaScript, Python, Go, Rust.

Toggle code lens on/off in settings: `gsd.codeLens`.

---

### 10. Slash Command Completion

Type `/` at the start of a line in any editor to get auto-completion for all GSD slash commands.

![Slash Completion](docs/images/slash-completion.png)

- Works in Markdown, plaintext, TypeScript, and JavaScript files
- Shows command source (extension, prompt, or skill) and location
- Commands are cached and auto-refreshed when the agent reconnects

---

### 11. File Decorations

Files modified by the agent get a **"G" badge** in the Explorer.

![File Decorations](docs/images/file-decorations.png)

- Uses git-style coloring for modified files
- Automatically applied when the agent uses Write or Edit tools
- Clears when the agent disconnects
- Manually clear with `Ctrl+Shift+P` > **GSD: Clear File Decorations**

---

### 12. Bash Terminal

When the agent runs shell commands, output streams to a dedicated **"GSD Agent" terminal**.

![Bash Terminal](docs/images/bash-terminal.png)

- Auto-creates the terminal on first Bash tool execution
- Shows command prompts in dim gray
- Streams stdout in real-time
- Closes when the agent disconnects

---

### 13. Progress Notifications

While the agent is working, a progress notification appears with:

- Current tool being executed (e.g., "Running Bash...")
- A **cancel button** to abort the operation
- Auto-dismisses when the agent completes

Toggle with setting: `gsd.showProgressNotifications`.

---

### 14. Context Window Warning

When context usage exceeds a configurable threshold, a warning notification appears suggesting compaction.

- Default threshold: 80%
- Click **"Compact Now"** to immediately compact
- Throttled to once per 60 seconds to avoid spam

Configure: `gsd.showContextWarning` and `gsd.contextWarningThreshold`.

---

## All Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **GSD: Start Agent** | | Connect to the GSD agent |
| **GSD: Stop Agent** | | Disconnect the agent |
| **GSD: New Session** | `Cmd+Shift+G Cmd+Shift+N` | Start a fresh conversation |
| **GSD: Send Message** | `Cmd+Shift+G Cmd+Shift+P` | Send a message to the agent |
| **GSD: Abort Current Operation** | `Cmd+Shift+G Cmd+Shift+A` | Interrupt the current operation |
| **GSD: Steer Agent** | `Cmd+Shift+G Cmd+Shift+I` | Send a steering message mid-operation |
| **GSD: Switch Model** | | Pick a model from QuickPick |
| **GSD: Cycle Model** | `Cmd+Shift+G Cmd+Shift+M` | Rotate to the next model |
| **GSD: Set Thinking Level** | | Choose off / low / medium / high |
| **GSD: Cycle Thinking Level** | `Cmd+Shift+G Cmd+Shift+T` | Rotate through thinking levels |
| **GSD: Compact Context** | | Trigger context compaction |
| **GSD: Export Conversation as HTML** | | Save session as HTML |
| **GSD: Show Session Stats** | | Display token usage and cost |
| **GSD: Run Bash Command** | | Execute a shell command via the agent |
| **GSD: List Available Commands** | | Browse GSD slash commands |
| **GSD: Set Session Name** | | Rename the current session |
| **GSD: Copy Last Response** | | Copy last agent response to clipboard |
| **GSD: Switch Session** | | Switch to a different session file |
| **GSD: Refresh Sessions** | | Rescan session directory |
| **GSD: Show Conversation History** | | Open conversation history viewer |
| **GSD: Ask About Symbol** | | Explain a function/class (via code lens) |
| **GSD: Refactor Symbol** | | Refactor a function/class (via code lens) |
| **GSD: Find Bugs in Symbol** | | Review for bugs (via code lens) |
| **GSD: Generate Tests for Symbol** | | Generate tests (via code lens) |
| **GSD: Clear File Decorations** | | Remove "G" badges from files |
| **GSD: Clear Activity Feed** | | Clear the activity feed |
| **GSD: Fork Session** | | Fork session from a previous message |
| **GSD: Toggle Auto-Retry** | | Toggle auto-retry on failure |
| **GSD: Abort Retry** | | Cancel a pending retry |
| **GSD: Toggle Steering Mode** | | Switch steering queue mode |
| **GSD: Toggle Follow-Up Mode** | | Switch follow-up queue mode |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gsd.binaryPath` | `"gsd"` | Path to the GSD binary if not on PATH |
| `gsd.autoStart` | `false` | Start the agent when the extension activates |
| `gsd.autoCompaction` | `true` | Enable automatic context compaction |
| `gsd.codeLens` | `true` | Show code lens above functions and classes |
| `gsd.showProgressNotifications` | `true` | Show progress notification while agent works |
| `gsd.activityFeedMaxItems` | `100` | Maximum items in the activity feed |
| `gsd.showContextWarning` | `true` | Warn when context usage exceeds threshold |
| `gsd.contextWarningThreshold` | `80` | Context usage % that triggers the warning |

## Keyboard Shortcuts

All shortcuts use a two-chord pattern: `Cmd+Shift+G` followed by a second chord.

| Shortcut | Command |
|----------|---------|
| `Cmd+Shift+G` `Cmd+Shift+N` | New Session |
| `Cmd+Shift+G` `Cmd+Shift+M` | Cycle Model |
| `Cmd+Shift+G` `Cmd+Shift+T` | Cycle Thinking Level |
| `Cmd+Shift+G` `Cmd+Shift+A` | Abort Operation |
| `Cmd+Shift+G` `Cmd+Shift+I` | Steer Agent |
| `Cmd+Shift+G` `Cmd+Shift+P` | Send Message |

> On Windows/Linux, replace `Cmd` with `Ctrl`.

## How It Works

The extension spawns `gsd --mode rpc` as a child process and communicates over JSON-RPC via stdin/stdout. All agent events (tool executions, message updates, model changes) stream in real-time to power the sidebar, activity feed, chat participant, and notifications.

The agent process auto-restarts on crash (up to 3 times within 60 seconds) and all pending requests are properly cleaned up on disconnect.

## Links

- [GSD Documentation](https://github.com/gsd-build/gsd-2/tree/main/docs)
- [Getting Started](https://github.com/gsd-build/gsd-2/blob/main/docs/getting-started.md)
- [Issue Tracker](https://github.com/gsd-build/gsd-2/issues)
