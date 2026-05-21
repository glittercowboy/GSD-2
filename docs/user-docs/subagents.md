# Subagents

Subagents delegate focused work to separate agent processes. Each child gets its own context window, model selection, tools, and system prompt, while the parent session receives the final answer, usage data, and a durable run record that can be inspected later.

Use subagents for bounded work such as codebase scouting, implementation, review, security checks, doc writing, or independent task batches. Auto mode may also dispatch subagents during reactive task execution when ready tasks do not depend on each other.

## Available Agents

List agents from an active session:

```text
/subagent
```

Agents are Markdown files loaded from:

| Location | Scope |
|----------|-------|
| `~/.gsd/agent/agents/` | User-wide agents |
| `.gsd/agents/` | Project-local agents |

Project-local agents are repository-controlled. For trusted-repo prompts, the parent can set `confirmProjectAgents: true` so GSD asks before running project-local agents.

## Invocation Modes

The `subagent` tool supports three launch shapes:

```json
{ "agent": "scout", "task": "Find the files involved in auth redirects." }
```

```json
{
  "tasks": [
    { "agent": "tester", "task": "Run focused API tests and report failures." },
    { "agent": "reviewer", "task": "Review the changed auth files for regressions." }
  ]
}
```

```json
{
  "chain": [
    { "agent": "scout", "task": "Map the checkout flow." },
    { "agent": "planner", "task": "Create an implementation plan from this context: {previous}" },
    { "agent": "worker", "task": "Implement the plan: {previous}" }
  ]
}
```

Single mode runs one child. Parallel mode runs independent tasks concurrently, with a maximum of eight tasks and an execution concurrency cap of four. Chain mode runs steps sequentially and replaces `{previous}` with the prior step's output.

Optional fields:

| Field | Applies to | Description |
|-------|------------|-------------|
| `agentScope` | all modes | `"user"`, `"project"`, or `"both"`; default is `"both"` |
| `model` | all modes | Model override for the child process |
| `cwd` | single, task, or chain step | Working directory for that child |
| `context` | all modes, task, or chain step | `"fresh"` or `"fork"`; default is `"fresh"` |
| `background` | single mode | Return immediately and persist progress for later `status` checks |
| `isolated` | launch | Run through the configured filesystem isolation backend before merging patches back |

## Context Modes

`context: "fresh"` is the default. The child starts with the agent's prompt and the delegated task, keeping the parent conversation out of the child context.

`context: "fork"` branches from the current parent session. Use it when the child needs the exact conversation state, selected files, or prior decisions. Forked context requires a persisted parent session and a current session leaf; in-memory sessions cannot be forked.

Child processes are marked with `GSD_SUBAGENT_CHILD=1`, which suppresses recursive subagent registration inside the child.

## Background Runs

For a long single-agent task, launch in the background:

```json
{
  "agent": "tester",
  "task": "Run the full regression suite and summarize failures.",
  "background": true
}
```

The tool returns a run id:

```text
Started background subagent run <runId>. Use action: "status" with runId: "<runId>" to inspect it.
```

Check the persisted run:

```json
{ "action": "status", "runId": "<runId>" }
```

Status output includes the run status, mode, context mode, update time, child status, exit code, output or error, and the child session file when one exists.

Each child is also assigned a random tracking name, shown as `<tracking-name> / <agent>`. The name is only for human tracking in status and result output; agent selection still uses the configured agent id.

## Resume And Follow-Up

Resume follows up inside a child session captured by a previous run:

```json
{
  "action": "resume",
  "runId": "<runId>",
  "followUp": "Apply the smallest fix for the failing test and report changed files."
}
```

If the run has more than one resumable child session, include the agent selector:

```json
{
  "action": "resume",
  "runId": "<runId>",
  "agent": "tester",
  "followUp": "Re-run only the failing tests."
}
```

Resume requires a run record with exactly one matching child session file. If no run exists, no child session was recorded, or multiple child sessions match without an `agent` selector, GSD returns a hard error instead of guessing.

## Run State

Subagent run records are JSON files stored under:

```text
~/.gsd/agent/subagent-runs/<runId>.json
```

`GSD_HOME` and `GSD_CODING_AGENT_DIR` can move this location; the store uses the active GSD agent directory returned by the runtime. Each record contains:

| Field | Meaning |
|-------|---------|
| `runId` | Unique dispatch id |
| `mode` | `single`, `parallel`, or `chain` |
| `contextMode` | `fresh` or `fork` |
| `status` | `running`, `succeeded`, `failed`, or `interrupted` |
| `cwd` | Parent working directory for the dispatch |
| `children` | Per-child tracking name, agent, task, cwd, status, session file, output, stderr, usage, model, and merge result |
| `failure` | Failure category and message when the run did not succeed |

The persisted record is the operational source for `status` and `resume`. The child session JSONL file remains the source for conversation continuation.

## Filesystem Isolation

By default, subagents run in the selected working directory and can edit that checkout according to their tool permissions.

Set `isolated: true` to request task-level filesystem isolation. Isolation only activates when global settings contain a supported backend:

```json
{
  "taskIsolation": {
    "mode": "worktree"
  }
}
```

Supported modes are:

| Mode | Behavior |
|------|----------|
| `worktree` | Creates a detached git worktree under `~/.gsd/wt/<encoded-cwd>/<task-id>/`, snapshots parent dirty state into it, captures the child delta, applies the patch back to the parent checkout, then removes the worktree |
| `fuse-overlay` | Uses `fuse-overlayfs` on Linux when available, otherwise falls back to `worktree` |

If `taskIsolation.mode` is unset or invalid, `isolated: true` is ignored and the child runs in the normal working directory. If patch merge fails, the run is marked failed and the merge result lists applied and failed patches.

## Recovery Behavior

When the parent session shuts down, GSD sends `SIGTERM` to live child processes and then `SIGKILL` to any process that does not exit promptly. Completed, failed, and interrupted child evidence is written to the run record when available.

Use `status` first after an interruption. If a child session file was recorded, use `resume` with a follow-up instruction to continue that child's conversation. If the child never launched far enough to create a session file, relaunch the task from the parent with a new `launch` action.

Subagent run records are local machine state, not a team artifact. They are intended for same-host recovery and inspection; do not rely on them as shared project documentation.
