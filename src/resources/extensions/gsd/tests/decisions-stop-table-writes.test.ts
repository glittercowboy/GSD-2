// ADR-013 Phase 6 cutover (Stage 3) — destructive lock-in.
//
// After this stage, new decisions written via gsd_save_decision land ONLY in
// the memories table. The decisions table receives no new rows; its existing
// rows remain for backwards-compat reads until #5756 drops the table.
//
// Tests cover five properties:
//   1. New saveDecisionToDb call does NOT insert into the decisions table
//   2. The new decision DOES appear as a memory row with sourceDecisionId
//   3. The rendered DECISIONS.md projection includes the new decision
//   4. Pre-existing decisions-table rows are untouched
//   5. Decision IDs are monotonic across both surfaces (max of either + 1)

import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  _getAdapter,
  closeDatabase,
  insertDecision,
  openDatabase,
} from "../gsd-db.ts";
import { saveDecisionToDb } from "../db-writer.ts";
import {
  getAllDecisionsFromMemories,
  queryDecisions,
} from "../context-store.ts";

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-decisions-stage3-"));
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

function countDecisionRows(): number {
  const adapter = _getAdapter();
  if (!adapter) return 0;
  const row = adapter
    .prepare("SELECT COUNT(*) as n FROM decisions")
    .get() as { n: number };
  return row.n;
}

function seedLegacyDecision(args: {
  id: string;
  when_context: string;
  scope: string;
  decision: string;
  choice: string;
  rationale: string;
  superseded_by?: string | null;
}): void {
  insertDecision({
    id: args.id,
    when_context: args.when_context,
    scope: args.scope,
    decision: args.decision,
    choice: args.choice,
    rationale: args.rationale,
    revisable: "Yes",
    made_by: "agent",
    superseded_by: args.superseded_by ?? null,
  });
}

// ─── Core invariants ────────────────────────────────────────────────────────

test("saveDecisionToDb no longer writes to the decisions table", async () => {
  const base = makeTmpBase();
  try {
    const before = countDecisionRows();
    assert.equal(before, 0);

    await saveDecisionToDb(
      {
        when_context: "M001 discuss",
        scope: "M001",
        decision: "Stage 3 destructive: memories-only writes",
        choice: "Drop the upsertDecision call",
        rationale: "Cutover step required by ADR-013 Phase 6",
        revisable: "Yes",
        made_by: "agent",
      },
      base,
    );

    const after = countDecisionRows();
    assert.equal(after, 0, "decisions table must remain empty after Stage 3 save");
  } finally {
    cleanup(base);
  }
});

test("saveDecisionToDb writes the new decision into memories with sourceDecisionId", async () => {
  const base = makeTmpBase();
  try {
    const { id } = await saveDecisionToDb(
      {
        when_context: "M001 discuss",
        scope: "M001",
        decision: "Use atomic file writes",
        choice: "atomicWriteSync",
        rationale: "crash-safe markdown projections",
        revisable: "Yes",
        made_by: "agent",
      },
      base,
    );

    const fromMemories = getAllDecisionsFromMemories();
    assert.equal(fromMemories.length, 1);
    assert.equal(fromMemories[0]?.id, id);
    assert.equal(fromMemories[0]?.decision, "Use atomic file writes");
  } finally {
    cleanup(base);
  }
});

test("DECISIONS.md projection includes the memory-only decision", async () => {
  const base = makeTmpBase();
  try {
    await saveDecisionToDb(
      {
        when_context: "M001 discuss",
        scope: "M001",
        decision: "Adopt SQLite",
        choice: "better-sqlite3",
        rationale: "synchronous + native",
        revisable: "Yes",
        made_by: "agent",
      },
      base,
    );

    const md = readFileSync(join(base, ".gsd", "DECISIONS.md"), "utf-8");
    assert.match(md, /\| D001 \|/);
    assert.match(md, /Adopt SQLite/);
    assert.match(md, /# Decisions Register/);
  } finally {
    cleanup(base);
  }
});

// ─── Existing decisions table is preserved ──────────────────────────────────

test("pre-existing decisions-table rows are untouched by Stage 3 saves", async () => {
  const base = makeTmpBase();
  try {
    // Seed two legacy decisions directly into the table — simulates a
    // pre-cutover project.
    seedLegacyDecision({
      id: "D001",
      when_context: "M001 historical",
      scope: "M001",
      decision: "Legacy decision one",
      choice: "A",
      rationale: "r1",
    });
    seedLegacyDecision({
      id: "D002",
      when_context: "M001 historical",
      scope: "M001",
      decision: "Legacy decision two",
      choice: "B",
      rationale: "r2",
    });
    assert.equal(countDecisionRows(), 2);

    // New save via the cutover path.
    await saveDecisionToDb(
      {
        when_context: "M001 today",
        scope: "M001",
        decision: "Post-cutover decision",
        choice: "C",
        rationale: "r3",
        revisable: "Yes",
        made_by: "agent",
      },
      base,
    );

    // Decisions table unchanged.
    assert.equal(countDecisionRows(), 2);

    // Legacy reads still see the pre-existing rows.
    const fromLegacy = queryDecisions();
    assert.equal(fromLegacy.length, 2);
    assert.deepEqual(
      fromLegacy.map((d) => d.id).sort(),
      ["D001", "D002"],
    );
  } finally {
    cleanup(base);
  }
});

// ─── Cross-surface ID monotonicity ─────────────────────────────────────────

test("decision IDs are monotonic across legacy table + memory surfaces", async () => {
  const base = makeTmpBase();
  try {
    // Pre-cutover project with D001..D005 in the legacy table (no memory
    // backfill yet — simulates an upgrade that hasn't run backfill).
    for (let i = 1; i <= 5; i++) {
      seedLegacyDecision({
        id: `D${String(i).padStart(3, "0")}`,
        when_context: "historical",
        scope: "M001",
        decision: `Decision ${i}`,
        choice: "x",
        rationale: "y",
      });
    }
    assert.equal(countDecisionRows(), 5);

    // First Stage 3 save: must pick the next-after-table ID.
    const a = await saveDecisionToDb(
      {
        when_context: "M001 today",
        scope: "M001",
        decision: "First post-cutover",
        choice: "A",
        rationale: "r",
        revisable: "Yes",
        made_by: "agent",
      },
      base,
    );
    assert.equal(a.id, "D006", "first cutover save must follow the legacy table max (D005 -> D006)");

    // Second save: must pick the next-after-memory ID.
    const b = await saveDecisionToDb(
      {
        when_context: "M001 today",
        scope: "M001",
        decision: "Second post-cutover",
        choice: "B",
        rationale: "r",
        revisable: "Yes",
        made_by: "agent",
      },
      base,
    );
    assert.equal(b.id, "D007", "second cutover save must follow memory max (D006 -> D007)");

    // Decisions table still has only the original five.
    assert.equal(countDecisionRows(), 5);
  } finally {
    cleanup(base);
  }
});

test("next-ID falls back to D001 when both surfaces are empty", async () => {
  const base = makeTmpBase();
  try {
    const { id } = await saveDecisionToDb(
      {
        when_context: "M001",
        scope: "M001",
        decision: "First ever",
        choice: "A",
        rationale: "r",
        revisable: "Yes",
        made_by: "agent",
      },
      base,
    );
    assert.equal(id, "D001");
  } finally {
    cleanup(base);
  }
});

test("next-ID skips beyond memory-only entries when the legacy table is empty", async () => {
  const base = makeTmpBase();
  try {
    // Three memory-only saves on a fresh project.
    const a = await saveDecisionToDb(
      { when_context: "M001", scope: "M001", decision: "A", choice: "1", rationale: "r", revisable: "Yes", made_by: "agent" },
      base,
    );
    const b = await saveDecisionToDb(
      { when_context: "M001", scope: "M001", decision: "B", choice: "2", rationale: "r", revisable: "Yes", made_by: "agent" },
      base,
    );
    const c = await saveDecisionToDb(
      { when_context: "M001", scope: "M001", decision: "C", choice: "3", rationale: "r", revisable: "Yes", made_by: "agent" },
      base,
    );

    assert.deepEqual([a.id, b.id, c.id], ["D001", "D002", "D003"]);
    assert.equal(countDecisionRows(), 0, "no decisions-table writes despite three saves");
  } finally {
    cleanup(base);
  }
});

// ─── Defensive: malformed structured_fields don't break next-ID ────────────

test("malformed structuredFields in memories are silently skipped during next-ID computation", async () => {
  const base = makeTmpBase();
  try {
    // Insert a memory with broken JSON in structured_fields. The next-ID
    // logic must not throw.
    const adapter = _getAdapter();
    assert.ok(adapter);
    adapter
      .prepare(
        "INSERT INTO memories (id, category, content, confidence, created_at, updated_at, structured_fields) VALUES ('mem-broken', 'architecture', 'oops', 0.5, datetime('now'), datetime('now'), '{\"sourceDecisionId\":\"D999\"')",
      )
      .run();

    const { id } = await saveDecisionToDb(
      { when_context: "M001", scope: "M001", decision: "Survivor", choice: "x", rationale: "y", revisable: "Yes", made_by: "agent" },
      base,
    );

    // Broken JSON for D999 doesn't parse, so the surfaced max stays at 0.
    // The new save must still produce a valid sequential ID.
    assert.equal(id, "D001");
  } finally {
    cleanup(base);
  }
});
