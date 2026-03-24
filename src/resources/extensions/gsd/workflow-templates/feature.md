# Feature Workflow

<template_meta>
name: feature
version: 1
requires_project: false
artifact_dir: .gsd/workflows/features/
</template_meta>

<purpose>
Add a new feature to an existing project with full GitHub management: clean worktree,
branch from upstream, implementation with atomic commits, and a well-documented PR.
Designed for open-source forks and team repos where branch hygiene and PR quality matter.
Typical scope: a new command, endpoint, component, integration, or user-facing capability.
</purpose>

<phases>
1. setup      — Verify clean tree, fetch upstream, create worktree/branch from upstream/main
2. scope      — Define what to build, key design decisions, confirm boundaries
3. plan       — Break into 2-5 implementable tasks with file-level detail
4. implement  — Execute the plan with atomic commits per task
5. verify     — Run tests, build, lint, smoke check, and CI preflight (advisory)
6. pr         — Create a well-documented PR and report post-PR CI status (advisory)
</phases>

<process>

## Phase 1: Setup

**Goal:** Start from a known-good, isolated state based on the latest upstream.

1. **Check working tree:**
   - Run `git status` and confirm there are no uncommitted changes
   - If dirty, ask the user: stash, commit, or switch to a clean branch first
   - Do not proceed until the tree is clean

2. **Detect remote topology:**
   - Run `git remote -v` to identify remotes
   - If `upstream` exists → this is a fork. Branch base = `upstream/main` (or `upstream/master`)
   - If only `origin` → branch base = `origin/main`
   - Note the base for all subsequent steps

3. **Fetch latest:**
   - Run `git fetch <base-remote>` to get the latest commits
   - Note the latest commit SHA of the base branch for reference

4. **Create a worktree or branch:**
   - Determine a branch name: `feat/<slug>` where slug is derived from the feature description
   - **Preferred (worktrees):** `git worktree add ../<repo>-feat-<slug> -b feat/<slug> <base-remote>/main`
   - **Fallback (no worktree):** `git checkout -b feat/<slug> <base-remote>/main`
   - Confirm active branch: `git branch --show-current`

5. **Gate:** Report setup summary to user:
   - Base remote used
   - Branch name created
   - Worktree path (if created)
   - Proceed only with explicit confirmation or after user acknowledges

## Phase 2: Scope

**Goal:** Align on exactly what to build before writing any code.

1. **Understand the request:**
   - Clarify the feature's purpose and user-facing behavior
   - Ask: who uses this, what does it do, what does "done" look like?

2. **Surface design decisions:** Identify 3-5 questions that must be answered:
   - API shape / interface design
   - Where in the codebase this belongs (patterns to follow)
   - What existing code to reuse or extend
   - Edge cases to handle now vs defer
   - Breaking changes or deprecations required

3. **Define scope boundaries:**
   - What is explicitly IN scope for this PR
   - What is OUT of scope (capture as follow-up issues)

4. **Produce:** Write `CONTEXT.md` in the artifact directory:
   ```
   # Feature: <name>
   ## Purpose
   ## Key Decisions
   ## In Scope
   ## Out of Scope
   ## Reference Files (key files to understand before coding)
   ```

5. **Gate:** Present scope to user. Adjust if needed. Do not start planning until scope is confirmed.

## Phase 3: Plan

**Goal:** Create a clear, independently-committable task breakdown.

1. **Research:** Read all reference files identified in CONTEXT.md to understand existing patterns
2. **Break into tasks:** 2-5 tasks, each independently committable:
   - Each task = one logical change (one concern per commit)
   - Include specific file paths and what changes in each file
   - Include verification steps per task (what to check after this task)
   - Tasks should be sequenced to minimize merge conflicts
3. **Produce:** Write `PLAN.md` in the artifact directory:
   ```
   # Plan: <feature name>
   ## Task 1: <name>
   Files: ...
   Changes: ...
   Verify: ...
   ## Task 2: ...
   ```

4. **Gate:** Present plan to user for approval. Adjust if needed.

## Phase 4: Implement

**Goal:** Build the feature following the plan with clean, atomic commits.

1. Execute tasks in order per PLAN.md
2. After each task:
   - Verify the task's specific acceptance criteria (as defined in PLAN.md)
   - Stage only files for this task: `git add <specific files>`
   - Commit: `feat(<scope>): <description>` (Conventional Commits format)
   - Do not batch multiple tasks into one commit
3. If a task reveals the plan needs adjustment:
   - Note the deviation in PLAN.md
   - Adapt the plan, but do not expand scope
4. Run incremental tests as you go — don't save all testing for the end

## Phase 5: Verify

**Goal:** Ensure everything works locally and surface any likely CI failures before pushing.

1. Run the full test suite (e.g., `npm test`, `pytest`, `go test ./...`)
2. Run the build (e.g., `npm run build`, `make build`)
3. Run the linter (e.g., `npm run lint`, `ruff check`, `golangci-lint`)
4. Manual smoke check: exercise the new feature end-to-end if applicable
5. Fix any failures before proceeding — do not skip to PR with red tests

6. **CI preflight (advisory):**
   - Check for CI config: `ls .github/workflows/` (or `.circleci/`, `Makefile` CI targets, etc.)
   - Scan workflow files to identify what jobs run on pull_request (test, lint, build, typecheck, etc.)
   - For each job that can be run locally, run it and note the result
   - Report a preflight summary:
     ```
     CI Preflight
     ✓ tests       — npm test passed
     ✓ build       — npm run build passed
     ✓ lint        — npm run lint passed
     ~ typecheck   — skipped (requires local tsconfig setup)
     ```
   - This is advisory — surface issues, but do not block progression to the PR phase

7. **Produce:** Write `SUMMARY.md` in the artifact directory:
   - What was built
   - Files changed (with brief description of each change)
   - How to test / use the feature
   - CI preflight results
   - Known limitations or follow-up items

## Phase 6: PR

**Goal:** Create a well-documented pull request that makes review easy.

1. **Final checks:**
   - `git status` — confirm no uncommitted changes
   - `git log --oneline <base-remote>/main..HEAD` — review all commits in this branch
   - Ensure commit messages follow Conventional Commits format

2. **Detect PR target:**
   - If `upstream` remote exists → cross-fork PR: `--repo <upstream-org>/<repo> --base main --head <fork-user>:<branch>`
   - If only `origin` → standard PR: `--base main --head <branch>`
   - Confirm with user before creating

3. **Build the PR body:**
   - **TL;DR:** One-sentence summary of what this adds
   - **What:** Bullet points describing the changes
   - **Why:** The motivation / user problem being solved
   - **How:** Brief technical approach
   - **Testing:** How to verify the feature works
   - Link to issue if one was provided: `Closes #<issue>`
   - AI assistance disclosure if applicable

4. **Present PR details to user** for review and approval before running `gh pr create`

5. **Create the PR:**
   ```bash
   gh pr create --title "<type>(<scope>): <description>" \
     --body "$(cat <<'EOF'
   ## TL;DR
   ...
   ## What
   ...
   ## Why
   ...
   ## How
   ...
   ## Testing
   ...
   EOF
   )" [--repo <upstream-org>/<repo>] [--base main] [--head <fork>:<branch>]
   ```

6. **Post-PR CI check (advisory):**
   - After the PR is created, wait ~10 seconds for checks to register, then run:
     `gh pr checks <pr-number> --repo <repo>`
   - Report the check results to the user
   - If any checks are failing or pending, note them — do not re-run or auto-fix
   - Example output to surface:
     ```
     CI Status (advisory)
     ✓ test / ubuntu       passed
     ✓ lint                passed
     ✗ typecheck           failed — review at <url>
     ● deploy-preview      pending
     ```
   - This is informational only: the workflow is complete regardless of CI result

7. **Return the PR URL** so the user can track review status

</process>
