<!-- Project/App: GSD-2 -->
<!-- File Purpose: ADR for PROJECT.md authority and projection semantics. -->

# ADR-018: PROJECT Authority Contract

**Status:** Accepted
**Date:** 2026-05-13
**Author:** GSD architecture review
**Related:** ADR-013 (memory store consolidation), ADR-015 (runtime invariant modules), ADR-017 (drift-driven state reconciliation), issues #5911 and #5912

## Context

The DB-authoritative runtime model treats `.gsd/**` markdown files as projections unless an explicit recovery or migration command says otherwise. `PROJECT.md` was still ambiguous: prompts described it as a file agents could write directly, while `gsd_summary_save(PROJECT)` also persisted the artifact into the database and registered milestone rows from its Milestone Sequence.

That ambiguity makes future prompt and write-gate work hard to reason about. If direct `PROJECT.md` writes are valid, then markdown can silently become a second authority for project state. If direct writes are invalid, agents need one tool path that records the artifact, updates the disk projection, and performs any DB registration side effects.

## Decision

`PROJECT.md` is a DB-backed project artifact whose disk file is a projection. The canonical write path is `gsd_summary_save` with `artifact_type: "PROJECT"`.

The accepted contract is:

- The artifact content is persisted in the DB artifacts table before projection writes are attempted.
- The disk file `.gsd/PROJECT.md` is a human-readable projection of the DB-backed artifact content.
- Milestone registration side effects are owned by the PROJECT tool path. A valid PROJECT save may parse the submitted project content to register milestone rows, but that parsing is part of the DB-backed tool surface, not a direct markdown import.
- Normal runtime, dispatch, reconciliation, and guided startup must not treat hand-edited `PROJECT.md` as authoritative DB state.
- Direct `PROJECT.md` edits are only valid as explicit recovery/migration input, or as operator-authored draft material before it is persisted through the DB-backed tool.
- When disk and DB disagree, runtime keeps DB authority and should either regenerate the projection or surface explicit recovery guidance. It must not silently import the disk file.

## Consequences

- Prompts should instruct agents to call `gsd_summary_save(PROJECT)`, not to use generic write/edit tools on `.gsd/PROJECT.md`.
- Write gates and tool contracts may block or warn on direct PROJECT writes during normal workflow units.
- Queue, discussion, and completion flows need prompt cleanup so PROJECT updates use the tool contract.
- Tests should prove direct PROJECT projection changes do not mutate runtime DB state outside explicit recovery/import commands.
- Existing explicit recovery/import commands can continue to read markdown as operator-selected recovery input.

## Alternatives considered

- **Keep PROJECT as a hand-authored source of truth.** Rejected because it preserves split-brain behavior between markdown and DB state.
- **Make PROJECT a pure generated projection with no submitted content.** Rejected for now because project setup and discussion flows still need a human-authored narrative artifact. The DB-backed tool path preserves that narrative while keeping one authoritative write path.
- **Hybrid without a tool boundary.** Rejected because it leaves callers guessing which fields are canonical and which writes are projections.
