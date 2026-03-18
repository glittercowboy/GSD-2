---
id: M007-aos64t
provides:
  - Deterministic runtime proof fixture and harness for the fact-check correction loop
  - Live dispatch reroute and planner evidence-injection proof through real runtime code paths
  - Durable validation report for repeatable milestone closeout and future inspection
key_decisions:
  - Final closeout verification uses `npx tsx --test` because the gsd extension's internal TypeScript import graph is not reliably executable with `node --test`
patterns_established:
  - Runtime-proof milestones should combine deterministic fixtures, real dispatch/prompt code paths, and durable machine-readable reports rather than relying on console-only evidence
observability_surfaces:
  - `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` machine-readable closeout artifact
  - `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` repeatable proof-suite command
  - `factcheck-reroute → plan-slice` dispatch trace and `## Fact-Check Evidence` prompt section as grepable runtime signals
requirement_outcomes:
  - id: R064
    from_status: active
    to_status: validated
    proof: Full closeout rerun passed via `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` (42/42). Fixture, live reroute, and final audit tests prove research-triggered fact-check artifacts are produced and consumed through the runtime path.
  - id: R068
    from_status: active
    to_status: validated
    proof: `factcheck-runtime-live.test.ts` and `factcheck-final-audit.test.ts` prove planner prompt assembly includes `## Fact-Check Evidence`, REFUTED claim C001, and corrected value `5.2.0`; durable evidence recorded in `M007-VALIDATION-REPORT.json`.
  - id: R069
    from_status: active
    to_status: validated
    proof: Live dispatch tests prove `FACTCHECK-STATUS.json` with `planImpacting=true` reroutes to `plan-slice`, and the final audit report records `dispatchAction={action:"dispatch",unitType:"plan-slice",unitId:"M999-PROOF/S01"}`.
  - id: R070
    from_status: active
    to_status: validated
    proof: Live integration tests prove plan-impacting slice refutations dispatch `plan-slice`, while negative tests fall through when fact-check status is missing or non-impacting, preserving explicit routing semantics.
  - id: R071
    from_status: active
    to_status: validated
    proof: `factcheck-final-audit.test.ts` writes and schema-validates `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json`, which reports refuted count, reroute target, corrected-evidence presence, dispatch action, and proof artifacts for milestone closeout.
duration: ~3h35m
verification_result: passed
completed_at: 2026-03-18T20:03:25Z
---

# M007-aos64t: Live Runtime Proof for Fact-Check Loop

**Delivered a repeatable live proof that the fact-check loop writes runtime artifacts, reroutes planning through the real dispatcher, injects corrected evidence into the reinvoked planner prompt, and leaves durable closeout diagnostics on disk.**

## What Happened

M007 closed the exact gap left by M006: the fact-check correction loop was already implemented in parts, but it had not been proven as one deterministic runtime sequence. S01 established the contract boundary with a synthetic fixture pack centered on a known false claim, a manifest declaring the expected refutation, and a harness that exposed the downstream values needed for runtime assertions. That retired the determinism risk and gave later slices a stable proof substrate.

S02 then wired the real runtime behavior. The dispatcher gained an explicit factcheck-reroute rule that inspects `FACTCHECK-STATUS.json` and takes precedence over normal planning when a plan-impacting refutation exists. Prompt assembly gained `loadFactcheckEvidence`, which pulls REFUTED claim annotations from the slice factcheck directory and inlines corrected evidence into the real `plan-slice` prompt path. A live integration test exercised the production dispatch and prompt builders against the S01 fixture and proved reroute plus corrected-evidence injection without relying on mocks.

S03 turned that proof into a durable milestone closeout surface. The final audit test reran the same proof path, wrote `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json`, verified the report schema, and confirmed the milestone could be closed on repeatable evidence rather than memory or console logs. At closeout, the entire proof suite was rerun successfully, confirming the slices integrate cleanly as one assembled runtime path.

## Cross-Slice Verification

All roadmap success criteria were re-checked at milestone closeout and met.

- **Deterministic live runtime scenario writes artifacts** — Verified by S01 fixture contract plus full proof-suite rerun: `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` passed 42/42. Evidence includes fixture claim files, `FACTCHECK-STATUS.json`, and final report output. No unmet criterion.
- **Dispatcher reroutes to the correct planner from the real runtime path** — Verified by `factcheck-runtime-live.test.ts` and final audit rerun. Observed result: `action=dispatch`, `unitType=plan-slice`, `unitId=M999-PROOF/S01`. No unmet criterion.
- **Reinvoked planner receives corrected evidence through the real prompt assembly path** — Verified by live prompt assertions and final audit output showing `## Fact-Check Evidence`, REFUTED claim `C001`, and corrected value `5.2.0` in the generated prompt. No unmet criterion.
- **Proof run is repeatable and leaves durable diagnostics** — Verified by `factcheck-final-audit.test.ts` writing `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json`, then schema-validating it on reread. The report records reroute action, corrected-value presence, refuted count, and proof artifact names. No unmet criterion.

Definition of done was also explicitly verified:

- All slices are complete: `S01`, `S02`, `S03` summaries exist and are marked complete.
- Cross-slice integration works: S01 fixture feeds S02 live reroute proof, and S03 consumes that proof path to generate a durable validation artifact.
- Final integrated proof rerun succeeded: `npx tsx --test src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` passed 3/3 and `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` passed 42/42.

## Requirement Changes

- R064: active → validated — Closeout rerun proved research-triggered fact-check artifacts are produced and consumed through the runtime proof flow (`factcheck-*.test.ts`, 42/42 pass).
- R068: active → validated — Live prompt assembly includes aggregate fact-check evidence plus REFUTED claim correction `5.2.0`, proven by live tests and `M007-VALIDATION-REPORT.json`.
- R069: active → validated — Live dispatch reroute sends plan-impacting refutations back to `plan-slice` before stale execution continues, with durable dispatch evidence captured in the validation report.
- R070: active → validated — Routing semantics are explicit and proven: slice-impacting fact-check corrections reroute `plan-slice`, while missing/non-impacting status falls through to normal planning behavior.
- R071: active → validated — Milestone closeout now emits durable fact-check outcome reporting through `M007-VALIDATION-REPORT.json` and this summary.

## Forward Intelligence

### What the next milestone should know
- The fact-check loop now has a trusted runtime proof substrate: the S01 synthetic fixture, S02 live reroute test, and S03 final audit report together provide a repeatable baseline for telemetry and experiment milestones.
- The authoritative closeout artifact is `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json`; future milestones should consume it instead of reconstructing proof state from logs.

### What's fragile
- Test execution depends on `npx tsx --test` rather than `node --test` — the gsd extension's internal `.ts` files import local modules via `.js` specifiers, and Node's strip-types path does not handle that import graph reliably.
- Worktree test execution still relies on `src/resources/extensions/gsd/tests/dist-redirect.mjs` pointing at built packages in the main repo — if package layout changes, proof tests can fail before runtime assertions even run.

### Authoritative diagnostics
- `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` — machine-readable PASS artifact with refuted count, reroute target, dispatch action, corrected-value presence, and proof artifact list.
- `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` — full regression-proof command covering fixture contract, live reroute, prompt injection, and durable closeout report.
- `npx tsx --test src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` — fastest single command to re-prove milestone closeout behavior.

### What assumptions changed
- Original assumption: helper-level and integration tests from M006 were sufficient to treat the correction loop as runtime-proven.
- What actually happened: a deterministic runtime harness plus durable validation artifact were required to prove the real dispatch and prompt path end-to-end.
- Original assumption: `node --test` would be enough for closeout verification.
- What actually happened: `tsx` was required because the extension's transitive `.js` imports inside `.ts` files are not reliably supported by Node's strip-types execution path.

## Files Created/Modified

- `.gsd/milestones/M007-aos64t/M007-aos64t-SUMMARY.md` — Milestone closeout summary with verified success criteria, requirement transitions, and forward intelligence.
- `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` — Durable machine-readable validation artifact proving reroute and corrected-evidence injection.
- `.gsd/REQUIREMENTS.md` — Updated R064, R068, R069, R070, and R071 from active to validated with closeout evidence.
- `.gsd/PROJECT.md` — Updated current project state to show M007-aos64t complete and validated.
- `.gsd/KNOWLEDGE.md` — Appended reusable lesson about runtime-proof milestones needing deterministic fixtures plus durable validation artifacts.