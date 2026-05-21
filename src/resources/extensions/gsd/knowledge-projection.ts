// GSD2 — KNOWLEDGE.md hybrid projection renderer (ADR-013 Stage 2b).
//
// Renders `.gsd/KNOWLEDGE.md` as a hybrid file:
//   - Rules section: read directly from the existing KNOWLEDGE.md (manual,
//     per ADR-013 line 39 — Rules are not migrated to memories).
//   - Patterns section: read from `memories` where `category = "pattern"`
//     AND `structured_fields.sourceKnowledgeId` is set (matches the marker
//     written by knowledge-backfill.ts).
//   - Lessons Learned section: read from `memories` where
//     `category = "gotcha"` AND `structured_fields.sourceKnowledgeId` is set.
//
// Triggered opportunistically by `buildBeforeAgentStartResult` after the
// knowledge backfill runs. Output is byte-stable when nothing has changed
// (atomic write). The Rules section is preserved verbatim — including
// indentation, trailing whitespace, and comments — so manual edits to that
// section continue to round-trip through `/gsd knowledge`.
//
// Memories captured directly via `capture_thought` (without a
// `sourceKnowledgeId` marker) are intentionally NOT rendered into
// KNOWLEDGE.md. They remain accessible via the loadMemoryBlock auto-injection
// surface; KNOWLEDGE.md projects only the KNOWLEDGE.md-originating subset.

import { atomicWriteSync } from "./atomic-write.js";
import { _getAdapter, isDbAvailable } from "./gsd-db.js";
import {
  KNOWLEDGE_SECTIONS,
  knowledgeMdPath,
  readKnowledgeMd,
} from "./knowledge-parser.js";
import { logWarning } from "./workflow-logger.js";

const RULES_HEADING = "## Rules";
const PATTERNS_HEADING = "## Patterns";
const LESSONS_HEADING = "## Lessons Learned";

const PATTERNS_HEADER = "| # | Pattern | Where | Notes |";
const PATTERNS_SEPARATOR = "|---|---------|-------|-------|";

const LESSONS_HEADER = "| # | What Happened | Root Cause | Fix | Scope |";
const LESSONS_SEPARATOR = "|---|--------------|------------|-----|-------|";

const DEFAULT_INTRO = [
  "# Project Knowledge",
  "",
  "Append-only register of project-specific rules, patterns, and lessons learned.",
  "Agents read this before every unit. Add entries when you discover something worth remembering.",
  "",
].join("\n");

interface KnowledgeMemoryRow {
  sourceId: string;
  structured: Record<string, unknown>;
}

interface KnowledgeMemoryReadResult {
  ok: boolean;
  rows: KnowledgeMemoryRow[];
}

export interface KnowledgeProjectionResult {
  written: boolean;
  content: string;
}

/**
 * Read pattern memories that originated from KNOWLEDGE.md, ordered by
 * `sourceKnowledgeId` (lexicographic — P001 < P002 < P010). Memories whose
 * structuredFields fail to parse are skipped silently; they are diagnosed
 * separately by the memory-consolidation scanner.
 */
function readKnowledgeMemories(category: "pattern" | "gotcha"): KnowledgeMemoryReadResult {
  if (!isDbAvailable()) return { ok: false, rows: [] };
  const adapter = _getAdapter();
  if (!adapter) return { ok: false, rows: [] };
  try {
    const rows = adapter
      .prepare(
        "SELECT structured_fields FROM memories WHERE category = :cat AND structured_fields IS NOT NULL",
      )
      .all({ ":cat": category }) as Array<{ structured_fields: string | null }>;

    const out: KnowledgeMemoryRow[] = [];
    for (const row of rows) {
      if (!row.structured_fields) continue;
      let sf: Record<string, unknown>;
      try {
        sf = JSON.parse(row.structured_fields) as Record<string, unknown>;
      } catch {
        continue;
      }
      const sourceId = sf["sourceKnowledgeId"];
      if (typeof sourceId !== "string" || sourceId.length === 0) continue;
      out.push({ sourceId, structured: sf });
    }
    // Lexicographic sort matches the docstring contract (P001 < P002 < P010).
    // DB seq order is creation-time; sorting by sourceId stabilizes the
    // rendered output across reruns.
    out.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    return { ok: true, rows: out };
  } catch {
    return { ok: false, rows: [] };
  }
}

function escapeCell(value: string | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function renderPatternsSection(memories: KnowledgeMemoryRow[]): string[] {
  const lines = [PATTERNS_HEADING, "", PATTERNS_HEADER, PATTERNS_SEPARATOR];
  for (const m of memories) {
    const pattern = escapeCell(typeof m.structured["pattern"] === "string" ? (m.structured["pattern"] as string) : "");
    const where = escapeCell(typeof m.structured["where"] === "string" ? (m.structured["where"] as string) : "");
    const notes = escapeCell(typeof m.structured["notes"] === "string" ? (m.structured["notes"] as string) : "");
    lines.push(`| ${m.sourceId} | ${pattern} | ${where || "—"} | ${notes || "—"} |`);
  }
  lines.push("");
  return lines;
}

function renderLessonsSection(memories: KnowledgeMemoryRow[]): string[] {
  const lines = [LESSONS_HEADING, "", LESSONS_HEADER, LESSONS_SEPARATOR];
  for (const m of memories) {
    const what = escapeCell(typeof m.structured["whatHappened"] === "string" ? (m.structured["whatHappened"] as string) : "");
    const rootCause = escapeCell(typeof m.structured["rootCause"] === "string" ? (m.structured["rootCause"] as string) : "");
    const fix = escapeCell(typeof m.structured["fix"] === "string" ? (m.structured["fix"] as string) : "");
    const scope = escapeCell(typeof m.structured["scopeText"] === "string" ? (m.structured["scopeText"] as string) : "");
    lines.push(`| ${m.sourceId} | ${what} | ${rootCause || "—"} | ${fix || "—"} | ${scope || "project"} |`);
  }
  lines.push("");
  return lines;
}

/**
 * Extract the Rules section (heading + table) from the existing
 * `KNOWLEDGE.md` content, verbatim. Returns an empty default section
 * (heading + empty table) when the source has no `## Rules` heading.
 */
function extractRulesSection(existing: string): string[] {
  const lines = existing.split("\n");
  const startIdx = lines.findIndex((l) => l.trim() === RULES_HEADING);
  if (startIdx === -1) {
    return [
      RULES_HEADING,
      "",
      "| # | Scope | Rule | Why | Added |",
      "|---|-------|------|-----|-------|",
      "",
    ];
  }

  // Find the next H2 heading that ends the Rules section.
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("## ")) {
      endIdx = i;
      break;
    }
  }

  // Strip trailing blank lines from the captured slice — the assembled
  // output adds its own separator blank line between sections.
  const slice = lines.slice(startIdx, endIdx);
  while (slice.length > 0 && slice[slice.length - 1]!.trim() === "") {
    slice.pop();
  }
  slice.push("");
  return slice;
}

/**
 * Extract the intro prose (anything before `## Rules`) verbatim, preserving
 * any title (`# Project Knowledge`), comments, and description text. Falls
 * back to the `DEFAULT_INTRO` template when the source has no Rules heading
 * yet.
 */
function extractIntro(existing: string): string {
  if (!existing.trim()) return DEFAULT_INTRO;
  const lines = existing.split("\n");
  const rulesIdx = lines.findIndex((l) => l.trim() === RULES_HEADING);
  if (rulesIdx === -1) return DEFAULT_INTRO;
  // Trim trailing blank lines so the assembly adds its own separator.
  const slice = lines.slice(0, rulesIdx);
  while (slice.length > 0 && slice[slice.length - 1]!.trim() === "") {
    slice.pop();
  }
  slice.push("");
  return slice.join("\n");
}

/**
 * Render the hybrid `KNOWLEDGE.md`: manual Rules + projected Patterns +
 * projected Lessons. Returns the rendered content and a flag indicating
 * whether the file was written (skipped when content is byte-identical to
 * what's on disk).
 *
 * Best-effort: catches all errors and returns `{ written: false, content: "" }`.
 */
export function renderKnowledgeProjection(basePath: string): KnowledgeProjectionResult {
  try {
    const existing = readKnowledgeMd(basePath);
    const intro = extractIntro(existing);
    const rules = extractRulesSection(existing);
    const patternMemories = readKnowledgeMemories("pattern");
    const lessonMemories = readKnowledgeMemories("gotcha");
    if (!patternMemories.ok || !lessonMemories.ok) {
      return { written: false, content: existing };
    }
    const patterns = renderPatternsSection(patternMemories.rows);
    const lessons = renderLessonsSection(lessonMemories.rows);

    const introText = intro
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+$/g, "");
    const projectedText = [...patterns, ...lessons]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+$/g, "");
    const content = [introText, rules.join("\n"), projectedText]
      .join("\n")
      .replace(/\s+$/g, "")
      + "\n";

    if (content === existing) {
      return { written: false, content };
    }

    atomicWriteSync(knowledgeMdPath(basePath), content, "utf-8");
    return { written: true, content };
  } catch (e) {
    logWarning("renderer", `KNOWLEDGE.md projection render failed: ${(e as Error).message}`);
    return { written: false, content: "" };
  }
}

// Re-export the section headings so tests can assert on the canonical
// structure without re-defining the strings.
export { KNOWLEDGE_SECTIONS };
