// GSD-2 — KNOWLEDGE.md parsing helpers shared by the consolidation scanner,
// the Patterns/Lessons backfill, and the hybrid projection renderer
// (ADR-013 Stage 2a/2b).
//
// The KNOWLEDGE.md format is locked in `files.ts:appendKnowledge`:
//
//   # Project Knowledge
//
//   <optional intro prose>
//
//   ## Rules
//
//   | # | Scope | Rule | Why | Added |
//   |---|-------|------|-----|-------|
//   | K001 | project | <rule text> | <reason> | <date> |
//
//   ## Patterns
//
//   | # | Pattern | Where | Notes |
//   |---|---------|-------|-------|
//   | P001 | <pattern> | <location> | <notes> |
//
//   ## Lessons Learned
//
//   | # | What Happened | Root Cause | Fix | Scope |
//   |---|--------------|------------|-----|-------|
//   | L001 | <what> | <cause> | <fix> | <scope> |
//
// Row IDs use a strict <prefix><digits> format (K001, P001, L001 …). Parsers
// skip the column-title and separator rows; only rows whose first cell
// matches the expected prefix are emitted.

import { existsSync, readFileSync } from "node:fs";

import { resolveGsdRootFile } from "./paths.js";

export type KnowledgeTable = "rules" | "patterns" | "lessons";

export interface KnowledgeRow {
  table: KnowledgeTable;
  id: string;
  /** Full table row, trimmed. Useful as a sample for diagnostic surfaces. */
  raw: string;
  /** Pipe-split cell values (excluding the leading/trailing empty cells from `| ... |`). */
  cells: string[];
}

export const KNOWLEDGE_SECTIONS: ReadonlyArray<{
  table: KnowledgeTable;
  heading: string;
  idPrefix: string;
}> = [
  { table: "rules", heading: "## Rules", idPrefix: "K" },
  { table: "patterns", heading: "## Patterns", idPrefix: "P" },
  { table: "lessons", heading: "## Lessons Learned", idPrefix: "L" },
];

/** Read `.gsd/KNOWLEDGE.md` content if present. Returns "" when absent or unreadable. */
export function readKnowledgeMd(basePath: string): string {
  const path = resolveGsdRootFile(basePath, "KNOWLEDGE");
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/** Resolve the canonical `.gsd/KNOWLEDGE.md` path. */
export function knowledgeMdPath(basePath: string): string {
  return resolveGsdRootFile(basePath, "KNOWLEDGE");
}

/**
 * Parse KNOWLEDGE.md into row records. Skips intro prose, table headers,
 * separator lines, and rows from unrecognized sections. Each row's first
 * cell must match the section's expected prefix (K/P/L + digits).
 */
export function parseKnowledgeRows(content: string): KnowledgeRow[] {
  const rows: KnowledgeRow[] = [];
  if (!content.trim()) return rows;

  const lines = content.split("\n");
  let activeSection: (typeof KNOWLEDGE_SECTIONS)[number] | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      activeSection = KNOWLEDGE_SECTIONS.find((s) => s.heading === trimmed);
      continue;
    }
    if (!activeSection) continue;
    if (!trimmed.startsWith("|")) continue;

    const idMatch = new RegExp(`^\\|\\s*(${activeSection.idPrefix}\\d+)\\s*\\|`).exec(trimmed);
    if (!idMatch) continue;

    rows.push({
      table: activeSection.table,
      id: idMatch[1] ?? "",
      raw: trimmed,
      cells: splitPipeRow(trimmed),
    });
  }

  return rows;
}

/**
 * Slice the KNOWLEDGE.md content to just the intro prose plus the `## Rules`
 * section, dropping `## Patterns` and `## Lessons Learned`. Used by
 * `loadKnowledgeBlock` to avoid double-injecting Patterns and Lessons —
 * those reach the LLM via `loadMemoryBlock` after the ADR-013 Stage 2b
 * cutover, so re-emitting them through the KNOWLEDGE.md block is pure
 * token-cost overhead.
 *
 * Returns the full content unchanged when no `## Rules` heading exists
 * (legacy projects or unusual layouts — better to over-inject than drop
 * unfamiliar content silently).
 */
export function extractIntroAndRules(content: string): string {
  if (!content.trim()) return "";
  const lines = content.split("\n");
  const rulesIdx = lines.findIndex((l) => l.trim() === "## Rules");
  if (rulesIdx === -1) return content;

  // End of the Rules section is the next `## ` heading (Patterns or
  // Lessons Learned) or end-of-file. Drop trailing blank lines so the
  // caller can join the slice without producing a triple newline.
  let endIdx = lines.length;
  for (let i = rulesIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("## ")) {
      endIdx = i;
      break;
    }
  }
  const slice = lines.slice(0, endIdx);
  while (slice.length > 0 && slice[slice.length - 1]!.trim() === "") {
    slice.pop();
  }
  return slice.join("\n") + "\n";
}

/**
 * Split a Markdown table row on un-escaped pipes. Returns the cell values
 * (without the leading/trailing empty fragments from `| ... |`), each
 * trimmed. Escaped pipes (`\|`) inside a cell are preserved as `|` in the
 * output.
 */
export function splitPipeRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "\\" && row[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    cells.push(current.trim());
  }
  // Drop the leading empty fragment from `|<cell>|...|` — the first split
  // produces an empty string before the first pipe.
  if (cells.length > 0 && cells[0] === "") cells.shift();
  return cells;
}
