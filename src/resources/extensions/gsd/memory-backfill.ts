// GSD2 — Decisions -> memories backfill (ADR-013 step 5)
//
// Idempotent migration that copies every decisions row (active and
// superseded — see Stage 2a note below) into the memories table with
// category="architecture" and a structured_fields payload preserving the
// original gsd_save_decision schema (when_context, scope, decision, choice,
// rationale, made_by, revisable, superseded_by, sourceDecisionId).
//
// The backfill exists so the cutover in ADR-013 step 6 can drop the
// decisions table without losing schema fidelity. Idempotency is enforced
// by tagging each backfilled memory with structured_fields.sourceDecisionId
// and skipping any decision whose ID already appears in the memories table.
//
// Triggered opportunistically by buildBeforeAgentStartResult so the cost
// only ever fires once per project. Costs O(N) inserts on first run where
// N is the active-decisions count; subsequent runs are an O(N) lookup that
// finds existing markers and exits.
//
// ADR-013 Stage 2a (PR #5755): backfill now includes superseded rows so the
// DECISIONS.md projection regen can source from memories without losing
// historical entries. An auto-heal pass runs after the initial migration to
// pick up superseded_by changes that occurred after the source decision was
// already migrated (e.g. a fresh md-importer run that introduced a new
// supersedes-chain).

import { isDbAvailable, _getAdapter } from "./gsd-db.js";
import { createMemory } from "./memory-store.js";
import { logWarning } from "./workflow-logger.js";

interface DecisionRow {
  id: string;
  when_context: string;
  scope: string;
  decision: string;
  choice: string;
  rationale: string;
  made_by: string;
  revisable: string;
  superseded_by: string | null;
}

type DecisionContentFields = Pick<DecisionRow, "decision" | "choice" | "rationale">;

/**
 * Backfill decisions rows into the memories table.
 *
 * - Idempotent (per-row): every row written carries
 *   `structured_fields.sourceDecisionId = "<decisionId>"`. Each candidate
 *   decision is checked individually; only decisions whose id is already
 *   present in the memory store are skipped. A user-authored memory with
 *   their own `sourceDecisionId` does NOT abort the backfill.
 * - Best-effort: never throws. Logs and returns 0 on failure so a broken
 *   backfill cannot block agent startup.
 * - Full migration (ADR-013 Stage 2a): both active and superseded rows are
 *   migrated. `structured_fields.superseded_by` preserves the supersedes
 *   chain so the DECISIONS.md projection regen can source from memories
 *   without losing historical entries.
 * - Drift auto-heal: after the initial insert pass, the function updates
 *   any pre-existing memory whose `structured_fields.superseded_by` drifted
 *   from the source decision (e.g. a fresh md-importer run introduced a
 *   new supersedes annotation after the initial migration).
 *
 * Returns the number of memories written (0 when already backfilled or
 * when the DB has no decisions). Drift-heal updates are not counted in
 * this return — they are logged separately.
 */
export function backfillDecisionsToMemories(): number {
  if (!isDbAvailable()) return 0;
  const adapter = _getAdapter();
  if (!adapter) return 0;

  try {
    const decisions = adapter
      .prepare("SELECT id, when_context, scope, decision, choice, rationale, made_by, revisable, superseded_by FROM decisions ORDER BY seq")
      .all() as Array<Record<string, unknown>>;

    if (decisions.length === 0) return 0;

    // Per-row idempotency: each memory backfilled from a decision carries
    // structured_fields.sourceDecisionId="<decisionId>". Skipping is decided
    // per row by matching that exact id, NOT by a global sentinel — a global
    // sentinel would silently abort the backfill if a user manually called
    // capture_thought with their own structuredFields.sourceDecisionId.
    const checkExisting = adapter.prepare(
      "SELECT id, structured_fields FROM memories WHERE structured_fields LIKE :pattern LIMIT 1",
    );
    const updateStructuredFields = adapter.prepare(
      "UPDATE memories SET structured_fields = :sf, updated_at = :ts WHERE id = :id",
    );

    let written = 0;
    let healed = 0;
    for (const raw of decisions) {
      const row: DecisionRow = {
        id: String(raw["id"] ?? ""),
        when_context: String(raw["when_context"] ?? ""),
        scope: String(raw["scope"] ?? ""),
        decision: String(raw["decision"] ?? ""),
        choice: String(raw["choice"] ?? ""),
        rationale: String(raw["rationale"] ?? ""),
        made_by: String(raw["made_by"] ?? "agent"),
        revisable: String(raw["revisable"] ?? ""),
        superseded_by: raw["superseded_by"] == null ? null : String(raw["superseded_by"]),
      };
      if (!row.id) continue;

      const pattern = `%"sourceDecisionId":"${row.id}"%`;
      const existing = checkExisting.get({ ":pattern": pattern }) as
        | { id: string; structured_fields: string | null }
        | undefined;

      if (existing) {
        // Drift auto-heal: if the source decision's superseded_by has changed
        // since the original migration, update the memory in place. Read-side
        // queries reconstruct Decision.superseded_by from this field, so the
        // DECISIONS.md projection stays accurate without us having to track
        // supersedes events at the write site.
        const parsedSf = existing.structured_fields
          ? safeParse(existing.structured_fields)
          : {};
        if (existing.structured_fields && !parsedSf) {
          logWarning(
            "memory-backfill",
            `decisions->memories drift heal skipped for ${row.id}: invalid structured_fields JSON`,
          );
          continue;
        }
        const currentSf = parsedSf ?? {};
        const memorySuperseded =
          typeof currentSf["superseded_by"] === "string" || currentSf["superseded_by"] === null
            ? (currentSf["superseded_by"] as string | null | undefined)
            : null;
        if (memorySuperseded !== row.superseded_by) {
          const merged = {
            ...currentSf,
            superseded_by: row.superseded_by,
          };
          updateStructuredFields.run({
            ":id": existing.id,
            ":sf": JSON.stringify(merged),
            ":ts": new Date().toISOString(),
          });
          healed += 1;
        }
        continue;
      }

      const content = synthesizeDecisionMemoryContent(row);
      const id = createMemory({
        category: "architecture",
        content,
        scope: row.scope || "project",
        confidence: 0.85,
        structuredFields: {
          sourceDecisionId: row.id,
          when_context: row.when_context,
          scope: row.scope,
          decision: row.decision,
          choice: row.choice,
          rationale: row.rationale,
          made_by: row.made_by,
          revisable: row.revisable,
          superseded_by: row.superseded_by,
        },
      });
      if (id) written += 1;
    }

    if (healed > 0) {
      logWarning(
        "memory-backfill",
        `decisions->memories drift healed: ${healed} row${healed === 1 ? "" : "s"} updated superseded_by`,
      );
    }

    return written;
  } catch (e) {
    logWarning("memory-backfill", `decisions->memories backfill failed: ${(e as Error).message}`);
    return 0;
  }
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Combine the decision's structured fields into a 1-3 sentence content
 * string suitable for keyword retrieval and human review.
 *
 * Format: "<decision> Chose: <choice>. Rationale: <rationale>."
 * Truncates each field to keep the synthesized line under ~600 chars so
 * memory_query rendering stays readable.
 */
export function synthesizeDecisionMemoryContent(row: DecisionContentFields): string {
  const trim = (value: string, max: number): string => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    return cleaned.length > max ? cleaned.slice(0, max - 1) + "\u2026" : cleaned;
  };
  const parts: string[] = [];
  const decision = trim(row.decision, 240);
  const choice = trim(row.choice, 200);
  const rationale = trim(row.rationale, 200);
  if (decision) parts.push(decision);
  if (choice) parts.push(`Chose: ${choice}.`);
  if (rationale) parts.push(`Rationale: ${rationale}.`);
  return parts.join(" ");
}
