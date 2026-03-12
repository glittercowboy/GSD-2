# GEMINI-GIT-SYNTHESIS: The New GSD 2 Git Standard (2026)

This document synthesizes the 2026 Git audit findings and the subsequent implementation of elite Git best practices into the core of GSD 2.

## 1. The Challenge (Audit Findings)

GSD 2 was already doing "branch-per-slice" and "squash-merge" correctly, but it suffered from three primary architectural weaknesses identified during the audit:

- **LLM Improv:** Git commands were mostly driven by prompts. This led to non-deterministic staging (`git add -A`), repetitive commit messages, and a lack of programmatic safety.
- **Trunk Pollution:** A broken slice could be merged to `main` without verification, potentially breaking the starting point for all subsequent work.
- **Context Noise:** Frequent "auto-commits" for dirty state recovery cluttered the branch history with `chore: auto-commit` messages, making the development log harder to read for senior engineers.

## 2. The Solution: Deterministic Git Orchestration

We transitioned GSD 2 from an **agent-mediated** Git model to a **system-mediated** Git model. The system now acts as a high-fidelity ledger that manages the "how" of Git while the agent focuses on the "what" and "why."

### Key Architectural Pillars:

- **`GitService`:** A centralized, deterministic TypeScript service for all high-level Git operations.
- **Hidden Snapshot Refs:** We introduced `refs/gsd/snapshots/<branch>/<timestamp>` to provide atomic recovery points without polluting the human-visible commit log.
- **Programmatic Merge Guards:** GSD 2 now automatically detects and executes verification commands (e.g., `npm run test`, `cargo test`) before a squash-merge. A failure blocks the merge, keeping `main` pristine.
- **High-Fidelity Main History:** Squash commits on `main` are now enriched with the list of completed tasks and the GSD slice title, providing a perfect changelog out of the box.

## 3. The Implementation Details

### For the "Vibe Coder" (Zero Config)
- **Invisible Git:** All task commits are handled automatically by the system.
- **Automatic Cleanup:** Merged branches are deleted by default (configurable) to keep the repository clean.
- **Safe by Default:** Verification runs automatically if tests are detected.

### For the "Senior Engineer" (Opt-In Power)
- **`preserve_branches: true`:** Keeps slice branches for `git bisect` or detailed drill-downs.
- **`auto_push: true`:** Automatically pushes `main` (and optionally slice branches) to remotes for backup and team visibility.
- **Custom `merge_guard`:** Define exact CI-equivalent commands to run before landing work.

## 4. Final Lifecycle of a GSD Slice

1.  **Start Slice:** System cuts a branch from a fresh trunk (namespaced if in a worktree).
2.  **Execute Task:** 
    - Agent builds the feature and writes the task summary.
    - System detects the task summary title and performs a `feat(sid/tid): <Title>` commit automatically.
    - System takes a hidden snapshot for recovery.
3.  **Complete Slice:** 
    - Agent writes the slice summary and UAT results.
    - System performs the final branch commit.
4.  **Land Work (Merge Guard):**
    - System triggers the verification command.
    - If passed, system squash-merges to `main` with a rich commit message.
    - System pushes to remote (if enabled).
    - System cleans up the branch.

## 5. Conclusion

By baking these practices into GSD 2, we have removed the "Git Tax" from the development process. Git is no longer a tool the agent *operates*; it is the **database of progress** that GSD 2 *manages* on behalf of the user.

**Trunk is always green. History is always clean. Recovery is always possible.**
