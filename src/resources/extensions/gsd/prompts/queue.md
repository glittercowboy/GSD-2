{{preamble}}

Say exactly: "What do you want to add?" — nothing else. Wait for the user's answer.

## Discussion Phase

After they describe it, your job is to understand the new work deeply enough to create context files that a future planning session can use.

**If the user provides a file path or pastes a large document** (spec, design doc, product plan, chat export), read it fully before asking questions. Use it as the starting point — don't ask them to re-explain what's already in the document. Your questions should fill gaps and resolve ambiguities the document doesn't cover.

**Investigate between question rounds to make your questions smarter.** Before each round of questions, do enough lightweight research that your questions are grounded in reality — not guesses about what exists or what's possible.

- Check library docs (`resolve_library` / `get_library_docs`) when the user mentions tech you need current facts about — capabilities, constraints, API shapes, version-specific behavior
- Do web searches (`search-the-web`) to verify the landscape — what solutions exist, what's changed recently, what's the current best practice. Use `freshness` for recency-sensitive queries, `domain` to target specific sites. Use `fetch_page` to read the full content of promising URLs when snippets aren't enough.
- Scout the codebase (`ls`, `find`, `rg`, or `scout` for broad unfamiliar areas) to understand what already exists, what patterns are established, what constraints current code imposes

Don't go deep — just enough that your next question reflects what's actually true rather than what you assume.

**Use this to actively surface:**
- The biggest technical unknowns — what could fail, what hasn't been proven, what might invalidate the plan
- Integration surfaces — external systems, APIs, libraries, or internal modules this work touches
- What needs to be proven before committing — the things that, if they don't work, mean the plan is wrong
- How the new work relates to existing milestones — overlap, dependencies, prerequisites
- If `.gsd/REQUIREMENTS.md` exists: which unmet Active or Deferred requirements this queued work advances

**Then use ask_user_questions** to dig into gray areas — architecture choices, scope boundaries, tech preferences, what's in vs out. 1-3 questions per round.

If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow during discuss/planning work, but do not let it override the required discuss flow or artifact requirements.

**Self-regulate:** After about 10-15 questions total (3-5 rounds), or when you feel you have a solid understanding, include a question like:
"I think I have a good picture. Ready to queue this, or are there more things to discuss?"
with options: "Ready to queue (Recommended)", "I have more to discuss"

If the user wants to keep going, keep asking. If they're ready, proceed.

## Existing Milestone Awareness

{{existingMilestonesContext}}

Before writing anything, assess the new work against what already exists:

1. **Dedup check** — Is this already covered (fully or partially) by an existing milestone? If so, tell the user and explain what's already planned. Don't create duplicate milestones.
2. **Extension check** — Should this be added to an existing *pending* (not yet started) milestone rather than creating a new one? If the scope naturally belongs with existing pending work, propose extending that milestone's context instead.
3. **Dependency check** — Does the new work depend on something that's currently in progress or planned? Note the dependency so context files capture it.
4. **Requirement check** — If `.gsd/REQUIREMENTS.md` exists, identify whether this queued work advances unmet Active requirements, promotes Deferred work, or introduces entirely new scope that should also update the requirement contract.

If the new work is already fully covered, say so and stop — don't create anything.

## Scope Assessment

Before writing artifacts, assess whether this is **single-milestone** or **multi-milestone** scope.

**Single milestone** if the work is one coherent body of deliverables that fits in roughly 2-12 slices.

**Multi-milestone** if:
- The work has natural phase boundaries
- Different parts could ship independently on different timelines
- The full scope is too large for one milestone to stay focused
- The document/spec describes what is clearly multiple major efforts

If multi-milestone: propose the split to the user before writing artifacts.

## Sequencing

Determine where the new milestones should go in the overall sequence. Consider dependencies, prerequisites, and independence.

## Output Phase

Once the user is satisfied, in a single pass for **each** new milestone (starting from {{nextId}}):

1. `mkdir -p .gsd/milestones/<ID>/slices`
2. Write `.gsd/milestones/<ID>/<ID>-CONTEXT.md` — read the template at `~/.gsd/agent/extensions/gsd/templates/context.md` first. Capture intent, scope, risks, constraints, integration points, and relevant requirements. Mark the status as "Queued — pending auto-mode execution."

Then, after all milestone directories and context files are written:

3. Update `.gsd/PROJECT.md` — add the new milestones to the Milestone Sequence. Keep existing entries exactly as they are. Only add new lines.
4. If `.gsd/REQUIREMENTS.md` exists and the queued work introduces new in-scope capabilities or promotes Deferred items, update it.
5. If discussion produced decisions relevant to existing work, append to `.gsd/DECISIONS.md`.
6. Append to `.gsd/QUEUE.md`.
7. Commit: `docs: queue <milestone list>`

**Do NOT write roadmaps for queued milestones.**
**Do NOT update `.gsd/STATE.md`.**

After writing the files and committing, say exactly: "Queued N milestone(s). Auto-mode will pick them up after current work completes." — nothing else.
