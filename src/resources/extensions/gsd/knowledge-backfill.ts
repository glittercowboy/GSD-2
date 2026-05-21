// GSD2 — KNOWLEDGE.md -> memories backfill (ADR-013 Stage 2b).
//
// Idempotent migration of `.gsd/KNOWLEDGE.md` Patterns and Lessons rows into
// the `memories` table. Patterns become memories with `category: "pattern"`;
// Lessons become memories with `category: "gotcha"` (mirroring the ADR-013
// line 38 contract). Rules (K###) are NOT migrated — they remain manually
// maintained in `KNOWLEDGE.md` per ADR-013 line 39.
//
// Idempotency is enforced by tagging each backfilled memory with
// `structured_fields.sourceKnowledgeId = "<P|L>NNN"`. The
// memory-consolidation-scanner (PR #5765) checks for the same marker.
//
// Triggered opportunistically by `buildBeforeAgentStartResult` so the cost
// only ever fires once per project. Costs O(N) inserts on first run where N
// is the row count; subsequent runs are an O(N) lookup that finds existing
// markers and exits.

import { _getAdapter, isDbAvailable } from "./gsd-db.js";
import { createMemory } from "./memory-store.js";
import { parseKnowledgeRows, readKnowledgeMd, type KnowledgeRow } from "./knowledge-parser.js";
import { logWarning } from "./workflow-logger.js";

interface SynthesizedRow {
  table: "patterns" | "lessons";
  id: string;
  category: "pattern" | "gotcha";
  content: string;
  scope: string;
  structuredFields: Record<string, unknown>;
}

/**
 * Backfill KNOWLEDGE.md Patterns + Lessons rows into the memories table.
 *
 * - Idempotent (per-row): each migrated memory carries
 *   `structured_fields.sourceKnowledgeId = "<P|L>NNN"`. Rows whose ID is
 *   already present in the memory store are skipped.
 * - Best-effort: never throws. Logs and returns 0 on failure so a broken
 *   backfill cannot block agent startup.
 * - Rules (K###) are intentionally skipped — they remain manually maintained
 *   in `KNOWLEDGE.md` per ADR-013.
 *
 * Returns the number of memories written (0 when there's nothing to migrate
 * or when the file is absent).
 */
export function backfillKnowledgeToMemories(basePath: string): number {
  if (!isDbAvailable()) return 0;
  const adapter = _getAdapter();
  if (!adapter) return 0;

  try {
    const content = readKnowledgeMd(basePath);
    if (!content.trim()) return 0;

    const rows = parseKnowledgeRows(content);
    if (rows.length === 0) return 0;

    const checkExisting = adapter.prepare(
      "SELECT 1 FROM memories WHERE structured_fields LIKE :pattern LIMIT 1",
    );

    let written = 0;
    for (const row of rows) {
      const synth = synthesize(row);
      if (!synth) continue;

      // Pattern is anchored on both sides of the value to avoid prefix
      // collisions (e.g. P1 vs P10).
      const matchPattern = `%"sourceKnowledgeId":"${synth.id}"%`;
      if (checkExisting.get({ ":pattern": matchPattern })) continue;

      const id = createMemory({
        category: synth.category,
        content: synth.content,
        scope: synth.scope,
        confidence: 0.85,
        structuredFields: synth.structuredFields,
      });
      if (id) written += 1;
    }

    return written;
  } catch (e) {
    logWarning(
      "memory-backfill",
      `KNOWLEDGE.md -> memories backfill failed: ${(e as Error).message}`,
    );
    return 0;
  }
}

/**
 * Convert a parsed KNOWLEDGE.md row into the memory payload we insert.
 * Returns `null` for Rules (K###) which are not migrated, or for rows whose
 * primary content cell is empty (defensive against malformed manual edits).
 */
function synthesize(row: KnowledgeRow): SynthesizedRow | null {
  if (row.table === "rules") return null;

  if (row.table === "patterns") {
    // Cells: [P###, Pattern, Where, Notes]
    const [, pattern, where, notes] = row.cells;
    const cleaned = (pattern ?? "").trim();
    if (!cleaned) return null;

    const contentParts: string[] = [cleaned];
    if (where && where.trim() && where.trim() !== "—") {
      contentParts.push(`Where: ${where.trim()}.`);
    }
    if (notes && notes.trim() && notes.trim() !== "—") {
      contentParts.push(`Notes: ${notes.trim()}.`);
    }

    return {
      table: "patterns",
      id: row.id,
      category: "pattern",
      content: trim(contentParts.join(" "), 600),
      scope: (where ?? "").trim() || "project",
      structuredFields: {
        sourceKnowledgeId: row.id,
        sourceKnowledgeTable: "patterns",
        pattern: cleaned,
        where: (where ?? "").trim(),
        notes: (notes ?? "").trim(),
      },
    };
  }

  // table === "lessons"
  // Cells: [L###, What Happened, Root Cause, Fix, Scope]
  const [, whatHappened, rootCause, fix, scope] = row.cells;
  const cleanedWhat = (whatHappened ?? "").trim();
  if (!cleanedWhat) return null;

  const contentParts: string[] = [cleanedWhat];
  if (rootCause && rootCause.trim() && rootCause.trim() !== "—") {
    contentParts.push(`Root cause: ${rootCause.trim()}.`);
  }
  if (fix && fix.trim() && fix.trim() !== "—") {
    contentParts.push(`Fix: ${fix.trim()}.`);
  }

  return {
    table: "lessons",
    id: row.id,
    category: "gotcha",
    content: trim(contentParts.join(" "), 600),
    scope: (scope ?? "").trim() || "project",
    structuredFields: {
      sourceKnowledgeId: row.id,
      sourceKnowledgeTable: "lessons",
      whatHappened: cleanedWhat,
      rootCause: (rootCause ?? "").trim(),
      fix: (fix ?? "").trim(),
      scopeText: (scope ?? "").trim(),
    },
  };
}

function trim(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}
