// ADR-013 Stage 2b — KNOWLEDGE.md backfill + hybrid projection tests.
//
// Covers four behaviors:
//   1. parser: splits cells correctly, skips header/separator rows, respects
//      section boundaries
//   2. backfill: Patterns -> memories(category=pattern), Lessons ->
//      memories(category=gotcha), Rules NOT migrated, idempotent
//   3. projection: hybrid output preserves manual Rules verbatim while
//      projecting Patterns + Lessons from memories
//   4. bootstrap path: backfill + projection round-trip produces a stable
//      file that re-reading reconstitutes the same memory set

import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  _getAdapter,
  closeDatabase,
  openDatabase,
} from "../gsd-db.ts";
import { backfillKnowledgeToMemories } from "../knowledge-backfill.ts";
import {
  knowledgeMdPath,
  parseKnowledgeRows,
  splitPipeRow,
} from "../knowledge-parser.ts";
import { renderKnowledgeProjection } from "../knowledge-projection.ts";

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-knowledge-stage2b-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  openDatabase(join(base, ".gsd", "gsd.db"));
  return base;
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    /* noop */
  }
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

function writeKnowledgeMd(base: string, body: string): void {
  writeFileSync(join(base, ".gsd", "KNOWLEDGE.md"), body, "utf-8");
}

const FIXTURE = `# Project Knowledge

Append-only register of project-specific rules, patterns, and lessons learned.
Agents read this before every unit. Add entries when you discover something worth remembering.

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | All timestamps in UTC | clarity | 2026-01-01 |
| K002 | M001 | Never trust user input | safety | 2026-01-02 |

## Patterns

| # | Pattern | Where | Notes |
|---|---------|-------|-------|
| P001 | Repository pattern | services/ | guards |
| P002 | Adapter at the seam | packages/pi-ai/ | observability |

## Lessons Learned

| # | What Happened | Root Cause | Fix | Scope |
|---|--------------|------------|-----|-------|
| L001 | Cache poisoning | reused key | versioned key | project |
`;

// ─── splitPipeRow ──────────────────────────────────────────────────────────

test("splitPipeRow extracts cells from a standard table row", () => {
  const cells = splitPipeRow("| K001 | project | All timestamps in UTC | clarity | 2026-01-01 |");
  assert.deepEqual(cells, ["K001", "project", "All timestamps in UTC", "clarity", "2026-01-01"]);
});

test("splitPipeRow preserves escaped pipes inside a cell", () => {
  const cells = splitPipeRow(`| K001 | project | Use A \\| B operator | safety | 2026-01-01 |`);
  assert.equal(cells[2], "Use A | B operator");
});

// ─── parseKnowledgeRows ────────────────────────────────────────────────────

test("parseKnowledgeRows returns rows per section with the correct table tag", () => {
  const rows = parseKnowledgeRows(FIXTURE);
  assert.equal(rows.length, 5, "two rules + two patterns + one lesson");
  const tables = rows.map((r) => r.table);
  assert.deepEqual(tables, ["rules", "rules", "patterns", "patterns", "lessons"]);
});

test("parseKnowledgeRows captures cell values aligned with the section schema", () => {
  const rows = parseKnowledgeRows(FIXTURE);
  const p1 = rows.find((r) => r.id === "P001");
  assert.ok(p1);
  assert.equal(p1.cells[1], "Repository pattern");
  assert.equal(p1.cells[2], "services/");
});

// ─── backfillKnowledgeToMemories ───────────────────────────────────────────

test("backfill migrates Patterns + Lessons but skips Rules", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(base, FIXTURE);
    const written = backfillKnowledgeToMemories(base);
    assert.equal(written, 3, "P001 + P002 + L001 should migrate; K rows skipped");

    const adapter = _getAdapter();
    assert.ok(adapter);

    const knowledgeMemories = adapter
      .prepare(
        "SELECT category, structured_fields FROM memories WHERE structured_fields LIKE '%\"sourceKnowledgeId\":\"%' ORDER BY seq",
      )
      .all() as Array<{ category: string; structured_fields: string }>;

    assert.equal(knowledgeMemories.length, 3);
    const categoriesById: Record<string, string> = {};
    for (const m of knowledgeMemories) {
      const sf = JSON.parse(m.structured_fields) as { sourceKnowledgeId: string };
      categoriesById[sf.sourceKnowledgeId] = m.category;
    }
    assert.equal(categoriesById["P001"], "pattern");
    assert.equal(categoriesById["P002"], "pattern");
    assert.equal(categoriesById["L001"], "gotcha");
    assert.equal(categoriesById["K001"], undefined, "K001 must NOT be in memories");
  } finally {
    cleanup(base);
  }
});

test("backfill is idempotent — second run on the same file is a no-op", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(base, FIXTURE);
    const first = backfillKnowledgeToMemories(base);
    assert.equal(first, 3);
    const second = backfillKnowledgeToMemories(base);
    assert.equal(second, 0, "already-migrated rows must not be re-inserted");
  } finally {
    cleanup(base);
  }
});

test("backfill returns 0 when KNOWLEDGE.md is absent", () => {
  const base = makeTmpBase();
  try {
    assert.equal(backfillKnowledgeToMemories(base), 0);
  } finally {
    cleanup(base);
  }
});

// ─── renderKnowledgeProjection ─────────────────────────────────────────────

test("projection preserves the manual Rules section verbatim", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(base, FIXTURE);
    backfillKnowledgeToMemories(base);
    renderKnowledgeProjection(base);

    const rendered = readFileSync(knowledgeMdPath(base), "utf-8");
    // Both K-rows must appear unchanged.
    assert.match(rendered, /\| K001 \| project \| All timestamps in UTC \| clarity \| 2026-01-01 \|/);
    assert.match(rendered, /\| K002 \| M001 \| Never trust user input \| safety \| 2026-01-02 \|/);
  } finally {
    cleanup(base);
  }
});

test("projection renders Patterns + Lessons from memories", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(base, FIXTURE);
    backfillKnowledgeToMemories(base);
    // Wipe the original Patterns/Lessons table rows from the file so the
    // projection's output can ONLY come from memories. Keep Rules intact.
    writeKnowledgeMd(
      base,
      `# Project Knowledge

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | All timestamps in UTC | clarity | 2026-01-01 |
| K002 | M001 | Never trust user input | safety | 2026-01-02 |
`,
    );

    renderKnowledgeProjection(base);
    const rendered = readFileSync(knowledgeMdPath(base), "utf-8");

    assert.match(rendered, /\| P001 \| Repository pattern \| services\/ \| guards \|/);
    assert.match(rendered, /\| P002 \| Adapter at the seam \| packages\/pi-ai\/ \| observability \|/);
    assert.match(rendered, /\| L001 \| Cache poisoning \| reused key \| versioned key \| project \|/);

    // Section structure must still be the canonical three headings, in order.
    const rulesIdx = rendered.indexOf("## Rules");
    const patternsIdx = rendered.indexOf("## Patterns");
    const lessonsIdx = rendered.indexOf("## Lessons Learned");
    assert.ok(rulesIdx >= 0 && patternsIdx > rulesIdx && lessonsIdx > patternsIdx, "headings must appear in canonical order");
  } finally {
    cleanup(base);
  }
});

test("projection is idempotent when nothing has changed", () => {
  const base = makeTmpBase();
  try {
    // Seed a file the projection will *change* (no canonical headers yet, so
    // the first render must rewrite to add structure).
    writeKnowledgeMd(
      base,
      `# Project Knowledge

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | manual rule | reason | 2026-01-01 |
`,
    );

    const first = renderKnowledgeProjection(base);
    assert.equal(first.written, true, "first render adds the missing Patterns + Lessons section scaffolding");

    const second = renderKnowledgeProjection(base);
    assert.equal(second.written, false, "second render is a no-op when content already matches");
  } finally {
    cleanup(base);
  }
});

test("projection emits empty section tables when no rows exist for that category", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(
      base,
      `# Project Knowledge

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
`,
    );
    renderKnowledgeProjection(base);
    const rendered = readFileSync(knowledgeMdPath(base), "utf-8");

    assert.match(rendered, /## Patterns/);
    assert.match(rendered, /## Lessons Learned/);
    // The empty-table headers must be present.
    assert.match(rendered, /\| # \| Pattern \| Where \| Notes \|/);
    assert.match(rendered, /\| # \| What Happened \| Root Cause \| Fix \| Scope \|/);
  } finally {
    cleanup(base);
  }
});

test("projection escapes pipes in memory content", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(
      base,
      `## Patterns

| # | Pattern | Where | Notes |
|---|---------|-------|-------|
| P001 | Use A \\| B fallback | adapters/ | watch out |
`,
    );
    backfillKnowledgeToMemories(base);
    renderKnowledgeProjection(base);
    const rendered = readFileSync(knowledgeMdPath(base), "utf-8");

    // Pipe MUST stay escaped in the rendered output so the table doesn't break.
    assert.match(rendered, /\| P001 \| Use A \\\| B fallback \| adapters\/ \| watch out \|/);
  } finally {
    cleanup(base);
  }
});

// ─── End-to-end round-trip ─────────────────────────────────────────────────

test("backfill + projection round-trip: re-running backfill on rendered file is a no-op", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(base, FIXTURE);
    const initial = backfillKnowledgeToMemories(base);
    assert.equal(initial, 3);

    renderKnowledgeProjection(base);
    assert.ok(existsSync(knowledgeMdPath(base)));

    // The rendered file contains the same P/L IDs as the source. A second
    // backfill pass must NOT re-insert them.
    const second = backfillKnowledgeToMemories(base);
    assert.equal(second, 0, "round-trip rendered file must remain idempotent for backfill");
  } finally {
    cleanup(base);
  }
});
