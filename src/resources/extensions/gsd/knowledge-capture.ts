// GSD2 — KNOWLEDGE.md write-side cutover (ADR-013 Stage 2c).
//
// Replaces the legacy `appendKnowledge` file-append path for Patterns and
// Lessons with `createMemory` calls. Rules (K###) continue to flow through
// the legacy file-append because they are intentionally not migrated to
// memories per ADR-013 line 39.
//
// Next-ID assignment is the cross-surface stable rule: read the existing
// `.gsd/KNOWLEDGE.md` for the highest <prefix>### in that section, AND read
// the memories table for the highest `sourceKnowledgeId` with the matching
// prefix, take the max, and increment. This stays stable across the
// knowledge backfill mid-run (when some rows exist only in the file and
// others only in memories) and on a fresh project where neither has any
// entries yet.

import { _getAdapter, isDbAvailable } from "./gsd-db.js";
import { createMemory } from "./memory-store.js";
import { parseKnowledgeRows, readKnowledgeMd } from "./knowledge-parser.js";
import { logWarning } from "./workflow-logger.js";

export type PatternLessonType = "pattern" | "lesson";

export interface CaptureKnowledgeResult {
  /** The assigned <prefix>### identifier (e.g. "P004"). */
  id: string;
  /** Whether the memory row was actually written. False only when the
   *  DB is unavailable or the createMemory call returned undefined. */
  written: boolean;
}

/**
 * Append a new Pattern or Lesson by writing it as a memory row carrying a
 * `sourceKnowledgeId` marker. The next session's KNOWLEDGE.md projection
 * render (`knowledge-projection.ts`) picks it up and emits the row into the
 * appropriate section.
 *
 * `entryText` is treated as the row's primary description cell (Pattern for
 * patterns, "What Happened" for lessons). Auxiliary cells (Where/Notes for
 * patterns; Root Cause/Fix/Scope for lessons) are left empty — the projection
 * renders `—` for empty cells. Users who need richer structure can call
 * `capture_thought` directly with a fuller `structuredFields` payload.
 */
export function captureKnowledgeEntry(
  basePath: string,
  type: PatternLessonType,
  entryText: string,
  scope: string,
): CaptureKnowledgeResult {
  const cleaned = entryText.trim();
  const idPrefix = type === "pattern" ? "P" : "L";
  const id = nextKnowledgeId(basePath, idPrefix);

  if (!cleaned) {
    return { id, written: false };
  }

  if (!isDbAvailable()) {
    logWarning("knowledge-capture", "DB unavailable; cannot persist knowledge entry");
    return { id, written: false };
  }

  try {
    const category = type === "pattern" ? "pattern" : "gotcha";
    const structuredFields: Record<string, unknown> =
      type === "pattern"
        ? {
            sourceKnowledgeId: id,
            sourceKnowledgeTable: "patterns",
            pattern: cleaned,
            where: "",
            notes: "",
          }
        : {
            sourceKnowledgeId: id,
            sourceKnowledgeTable: "lessons",
            whatHappened: cleaned,
            rootCause: "",
            fix: "",
            scopeText: scope,
          };

    const memoryId = createMemory({
      category,
      content: cleaned,
      scope: scope || "project",
      confidence: 0.85,
      structuredFields,
    });

    return { id, written: !!memoryId };
  } catch (e) {
    logWarning(
      "knowledge-capture",
      `failed to persist ${type} entry as memory: ${(e as Error).message}`,
    );
    return { id, written: false };
  }
}

/**
 * Compute the next <prefix>### identifier across both the legacy
 * `.gsd/KNOWLEDGE.md` and the `memories.structured_fields.sourceKnowledgeId`
 * surface. Takes the max numeric suffix from either side and increments.
 *
 * Padded to three digits to match the existing `appendKnowledge` convention.
 * Exported for tests; production callers go through `captureKnowledgeEntry`.
 */
export function nextKnowledgeId(basePath: string, prefix: "K" | "P" | "L"): string {
  const fromFile = maxIdInFile(basePath, prefix);
  const fromMemories = maxIdInMemories(prefix);
  const next = Math.max(fromFile, fromMemories) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function maxIdInFile(basePath: string, prefix: "K" | "P" | "L"): number {
  const content = readKnowledgeMd(basePath);
  if (!content.trim()) return 0;
  const expectedTable =
    prefix === "K" ? "rules" : prefix === "P" ? "patterns" : "lessons";

  let max = 0;
  for (const row of parseKnowledgeRows(content)) {
    if (row.table !== expectedTable) continue;
    const num = parseInt(row.id.slice(1), 10);
    if (Number.isFinite(num) && num > max) max = num;
  }
  return max;
}

function maxIdInMemories(prefix: "K" | "P" | "L"): number {
  if (!isDbAvailable()) return 0;
  const adapter = _getAdapter();
  if (!adapter) return 0;
  try {
    const rows = adapter
      .prepare(
        "SELECT structured_fields FROM memories WHERE structured_fields LIKE :pattern",
      )
      .all({ ":pattern": `%"sourceKnowledgeId":"${prefix}%` }) as Array<{
      structured_fields: string | null;
    }>;
    let max = 0;
    for (const row of rows) {
      if (!row.structured_fields) continue;
      let sf: Record<string, unknown>;
      try {
        sf = JSON.parse(row.structured_fields) as Record<string, unknown>;
      } catch {
        continue;
      }
      const sourceId = sf["sourceKnowledgeId"];
      if (typeof sourceId !== "string" || !sourceId.startsWith(prefix)) continue;
      const num = parseInt(sourceId.slice(1), 10);
      if (Number.isFinite(num) && num > max) max = num;
    }
    return max;
  } catch {
    return 0;
  }
}
