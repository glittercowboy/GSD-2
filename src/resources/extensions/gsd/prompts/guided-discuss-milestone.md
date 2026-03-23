Discuss milestone {{milestoneId}} ("{{milestoneTitle}}"). Identify gray areas, ask the user about them, and write `{{milestoneId}}-CONTEXT.md` in the milestone directory with the decisions. Use the **Context** output template below. If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow; do not override required artifact rules.

**Structured questions available: {{structuredQuestionsAvailable}}**

{{inlinedTemplates}}

---

## Interview Protocol

### Before your first question round

Do a lightweight targeted investigation so your questions are grounded in reality:
- Scout the codebase (`rg`, `find`, or `scout`) to understand what already exists that this milestone touches or builds on
- Check the roadmap context above (if present) to understand what surrounds this milestone
- Use `resolve_library` / `get_library_docs` for unfamiliar libraries — prefer this over `web_search` for library documentation
- Identify the 3–5 biggest behavioural and architectural unknowns: things where the user's answer will materially change what gets built

**Web search budget:** You have a limited number of web searches per turn (typically 3-5). Prefer `resolve_library` / `get_library_docs` for library documentation and `search_and_read` for one-shot topic research — they are more budget-efficient. Target 2-3 web searches in the investigation pass. Distribute remaining searches across subsequent question rounds rather than clustering them.

Do **not** go deep — just enough that your questions reflect what's actually true rather than what you assume.

### Question rounds

Ask **1–3 questions per round**. Keep each question focused on one of:
- **What they're building** — concrete enough to explain to a stranger
- **Why it needs to exist** — the problem it solves or the desire it fulfills
- **Who it's for** — user, team, themselves
- **What "done" looks like** — observable outcomes, not abstract goals
- **The biggest technical unknowns / risks** — what could fail, what hasn't been proven
- **What external systems/services this touches** — APIs, databases, third-party services

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` for each round. 1–3 questions per call, each as a separate question object. Keep option labels short (3–5 words). Always include a freeform "Other / let me explain" option. When the user picks that option or writes a long freeform answer, switch to plain text follow-up for that thread before resuming structured questions.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask questions in plain text. Keep each round to 1–3 focused questions. Wait for answers before asking the next round.

After the user answers, investigate further if any answer opens a new unknown, then ask the next round.

### Round cadence

After each round of answers, decide whether you already have enough depth to write a strong context file.

- If not, investigate any newly-opened unknowns and continue to the next round immediately. Do **not** ask a meta "ready to wrap up?" question after every round.
- Use a single wrap-up prompt only when you genuinely believe the depth checklist is satisfied or the user signals they want to stop.
- **If `{{structuredQuestionsAvailable}}` is `true` and you need that wrap-up prompt:** use `ask_user_questions` with options:
  - "Write the context file" *(recommended when depth is satisfied)*
  - "One more pass"
- **If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text only once you believe you are ready to write.

---

## Questioning philosophy

**Start open, follow energy.** Let the user's enthusiasm guide where you dig deeper.

**Challenge vagueness, make abstract concrete.** When the user says something abstract ("it should be smart" / "good UX"), push for specifics.

**Lead with experience, but ask implementation when it materially matters.** Default questions should target the experience and outcome. But when implementation choices materially change scope, proof, compliance, integration, deployment, or irreversible architecture, ask them directly instead of forcing a fake UX phrasing.

**Position-first framing.** Have opinions. "I'd lean toward X because Y — does that match your thinking?" is better than "what do you think about X vs Y?"

**Negative constraints.** Ask what would disappoint them. What they explicitly don't want. Negative constraints are sharper than positive wishes.

**Anti-patterns — never do these:**
- Checklist walking through predetermined topics regardless of what the user said
- Canned generic questions that could apply to any project
- Corporate speak ("What are your key success metrics?")
- Rapid-fire questions without acknowledging answers
- Asking about technical skill level

---

## Deep Abstraction + Research Calibration

For dense inputs (>300 words or when `deep_abstraction` is `always`), perform structured extraction before questioning:

1. **Item extraction:** Break the input into atomic items. Tag each: **CLEAR** (explicitly stated), **INTERPRETED** (reasonable inference), **UNCERTAIN** (ambiguous). Present in batches of ~3 via `ask_user_questions` for confirmation.
2. **Gap surfacing:** After items are confirmed, identify likely gaps (error handling, auth, deployment, observability) and confirm with the user.
3. **Research calibration:** After the discussion's focused research pass, recommend a `research_depth` tier — `skip`, `light`, `standard`, or `deep` — with a brief argument. Confirm via `ask_user_questions`. Write confirmed values into CONTEXT.md frontmatter: `research_depth`, `research_signals`, `research_focus`.

Skip item extraction when `deep_abstraction` is `off` or input is below `deep_abstraction_threshold` (~300 words). Research calibration always runs.

---

## Depth Verification

Before writing context, verify understanding across three dimensions in sequence. Each gets its own summary + confirmation.

### Dimension 1: What (`depth_verification_what`)

Print a concise summary (3–5 bullets) of what they're building, why it exists, who it's for, and what "done" looks like — using their terminology.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "What Check", question "Did I capture the what correctly?", options "Yes, you got it (Recommended)" / "Not quite — let me clarify", ID containing `depth_verification_what`.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text and wait for confirmation.

### Dimension 2: Risks (`depth_verification_risks`)

Print a concise summary (3–5 bullets) of technical unknowns, risks, unproven assumptions, and failure modes.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "Risks Check", question "Did I identify the key risks?", options "Yes, you got it (Recommended)" / "Not quite — let me clarify", ID containing `depth_verification_risks`.

### Dimension 3: Dependencies (`depth_verification_dependencies`)

Print a concise summary (3–5 bullets) of external systems, APIs, services, integration points, and deployment constraints.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "Deps Check", question "Did I capture the dependencies correctly?", options "Yes, you got it (Recommended)" / "Not quite — let me clarify", ID containing `depth_verification_dependencies`.

### Re-verification

If the user says "not quite" on any dimension, absorb the correction and re-verify **that dimension only**. All three must pass before CONTEXT.md can be written.

---

## Output

Once the user confirms depth:

1. Use the **Context** output template below
2. `mkdir -p` the milestone directory if needed
3. Write `{{milestoneId}}-CONTEXT.md` — preserve the user's exact terminology, emphasis, and framing. Do not paraphrase nuance into generic summaries. The context file is downstream agents' only window into this conversation.
4. {{commitInstruction}}
5. Say exactly: `"{{milestoneId}} context written."` — nothing else.
