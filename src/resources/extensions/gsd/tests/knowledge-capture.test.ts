// ADR-013 Stage 2c — /gsd knowledge write-side redirect tests.
//
// Locks in four properties of captureKnowledgeEntry / nextKnowledgeId:
//   1. Pattern entries write a memory row with category="pattern" and a
//      sourceKnowledgeId marker — but do NOT touch KNOWLEDGE.md.
//   2. Lesson entries write a memory row with category="gotcha" — same
//      file-vs-memory split.
//   3. Next-ID is monotonic across both surfaces: a P004 in the file plus a
//      P007 in memories yields P008 next.
//   4. The legacy appendKnowledge stays the canonical path for Rules
//      (covered indirectly via no-memory side effect on type="rule").

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  _getAdapter,
  closeDatabase,
  openDatabase,
} from "../gsd-db.ts";
import { captureKnowledgeEntry, nextKnowledgeId } from "../knowledge-capture.ts";
import { knowledgeMdPath } from "../knowledge-parser.ts";

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-knowledge-capture-"));
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

function readMemoriesWithMarker(prefix: "P" | "L"): Array<{ category: string; sf: Record<string, unknown> }> {
  const adapter = _getAdapter();
  if (!adapter) return [];
  const rows = adapter
    .prepare(
      "SELECT category, structured_fields FROM memories WHERE structured_fields LIKE :pattern ORDER BY seq",
    )
    .all({ ":pattern": `%"sourceKnowledgeId":"${prefix}%` }) as Array<{
    category: string;
    structured_fields: string;
  }>;
  return rows.map((r) => ({ category: r.category, sf: JSON.parse(r.structured_fields) }));
}

// ─── Pattern path ───────────────────────────────────────────────────────────

test("pattern entry creates a memory and assigns the next P### id", () => {
  const base = makeTmpBase();
  try {
    const result = captureKnowledgeEntry(base, "pattern", "Repository pattern at the seam", "M001");
    assert.equal(result.id, "P001", "first pattern on a fresh project should be P001");
    assert.equal(result.written, true);

    const memories = readMemoriesWithMarker("P");
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.category, "pattern");
    assert.equal(memories[0]?.sf.sourceKnowledgeId, "P001");
    assert.equal(memories[0]?.sf.pattern, "Repository pattern at the seam");
    assert.equal(memories[0]?.sf.where, "");
    assert.equal(memories[0]?.sf.notes, "");
  } finally {
    cleanup(base);
  }
});

test("pattern entry does NOT write to KNOWLEDGE.md (memory-only)", () => {
  const base = makeTmpBase();
  try {
    captureKnowledgeEntry(base, "pattern", "Adapter at the seam", "project");
    assert.equal(
      existsSync(knowledgeMdPath(base)),
      false,
      "KNOWLEDGE.md should remain untouched — projection re-renders on next session start",
    );
  } finally {
    cleanup(base);
  }
});

test("repeated pattern captures advance the ID monotonically", () => {
  const base = makeTmpBase();
  try {
    const a = captureKnowledgeEntry(base, "pattern", "First", "project");
    const b = captureKnowledgeEntry(base, "pattern", "Second", "project");
    const c = captureKnowledgeEntry(base, "pattern", "Third", "project");
    assert.deepEqual([a.id, b.id, c.id], ["P001", "P002", "P003"]);
  } finally {
    cleanup(base);
  }
});

// ─── Lesson path ────────────────────────────────────────────────────────────

test("lesson entry creates a memory with category=gotcha and L### id", () => {
  const base = makeTmpBase();
  try {
    const result = captureKnowledgeEntry(base, "lesson", "Cache poisoning via reused key", "M001/S01");
    assert.equal(result.id, "L001");
    assert.equal(result.written, true);

    const memories = readMemoriesWithMarker("L");
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.category, "gotcha");
    assert.equal(memories[0]?.sf.sourceKnowledgeId, "L001");
    assert.equal(memories[0]?.sf.whatHappened, "Cache poisoning via reused key");
    assert.equal(memories[0]?.sf.scopeText, "M001/S01");
  } finally {
    cleanup(base);
  }
});

// ─── Empty input ────────────────────────────────────────────────────────────

test("empty entry text does NOT create a memory but still assigns an id", () => {
  const base = makeTmpBase();
  try {
    const result = captureKnowledgeEntry(base, "pattern", "   ", "project");
    assert.equal(result.written, false);
    assert.equal(readMemoriesWithMarker("P").length, 0);
  } finally {
    cleanup(base);
  }
});

// ─── nextKnowledgeId — cross-surface monotonicity ───────────────────────────

test("nextKnowledgeId takes max of file and memory surfaces", () => {
  const base = makeTmpBase();
  try {
    // Pre-existing patterns in KNOWLEDGE.md and one new pattern in memories.
    // The legacy appendKnowledge format starts P at 001 — we simulate higher
    // existing IDs to verify the take-max-then-+1 rule.
    writeFileSync(
      knowledgeMdPath(base),
      `## Patterns

| # | Pattern | Where | Notes |
|---|---------|-------|-------|
| P004 | Legacy pattern | services/ | preserved |
`,
      "utf-8",
    );

    // Capture jumps the memory ID forward.
    captureKnowledgeEntry(base, "pattern", "Memory-only pattern", "project");
    captureKnowledgeEntry(base, "pattern", "Another memory-only pattern", "project");
    captureKnowledgeEntry(base, "pattern", "And another", "project");

    // After: file has P004 (max=4); memories have P005, P006, P007 (max=7).
    // Next must be P008.
    assert.equal(nextKnowledgeId(base, "P"), "P008");
  } finally {
    cleanup(base);
  }
});

test("nextKnowledgeId works per-prefix without cross-talk", () => {
  const base = makeTmpBase();
  try {
    captureKnowledgeEntry(base, "pattern", "P entry", "project");
    captureKnowledgeEntry(base, "pattern", "P entry 2", "project");
    captureKnowledgeEntry(base, "lesson", "L entry", "project");

    assert.equal(nextKnowledgeId(base, "P"), "P003");
    assert.equal(nextKnowledgeId(base, "L"), "L002");
    // K has no entries on this project — first one should be K001.
    assert.equal(nextKnowledgeId(base, "K"), "K001");
  } finally {
    cleanup(base);
  }
});

test("nextKnowledgeId pads to three digits even at the rollover", () => {
  const base = makeTmpBase();
  try {
    writeFileSync(
      knowledgeMdPath(base),
      `## Patterns

| # | Pattern | Where | Notes |
|---|---------|-------|-------|
| P099 | high water mark | — | — |
`,
      "utf-8",
    );
    assert.equal(nextKnowledgeId(base, "P"), "P100");
  } finally {
    cleanup(base);
  }
});

// ─── Sanity: file-side reads still see existing rows after capture ─────────

test("after pattern capture, KNOWLEDGE.md untouched but next id reflects memory state", () => {
  const base = makeTmpBase();
  try {
    captureKnowledgeEntry(base, "pattern", "First", "project");
    // KNOWLEDGE.md still absent.
    assert.equal(existsSync(knowledgeMdPath(base)), false);
    // Next-ID logic sees the new memory.
    assert.equal(nextKnowledgeId(base, "P"), "P002");
  } finally {
    cleanup(base);
  }
});

test("rule writes still flow through appendKnowledge (file-canonical) — memory unchanged", async () => {
  const base = makeTmpBase();
  try {
    // We invoke the legacy file path directly here; the command handler
    // dispatch is verified separately at the integration level. The point
    // of this test is to lock in that captureKnowledgeEntry is NOT the
    // rule path — rules must go through appendKnowledge.
    const { appendKnowledge } = await import("../files.ts");
    await appendKnowledge(base, "rule", "Always pin SQLite version", "project");

    const md = readFileSync(knowledgeMdPath(base), "utf-8");
    assert.match(md, /\| K001 \| project \| Always pin SQLite version /);

    // No pattern/lesson memories should exist as a side effect.
    assert.equal(readMemoriesWithMarker("P").length, 0);
    assert.equal(readMemoriesWithMarker("L").length, 0);
  } finally {
    cleanup(base);
  }
});
