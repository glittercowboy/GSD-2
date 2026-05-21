// ADR-013 Phase 6 cutover (Stage 2a) — locks in the four behavioral changes:
//
//   1. memory-backfill includes superseded decisions + preserves
//      structuredFields.superseded_by
//   2. memory-backfill drift auto-heal: when a decision's superseded_by
//      changes after migration, the memory's structuredFields update
//   3. context-store.queryDecisionsFromMemories filters out rows whose
//      structuredFields.superseded_by is set (active-only)
//   4. context-store.getAllDecisionsFromMemories returns the full register
//      including superseded rows, and the saveDecisionToDb projection regen
//      uses it — producing byte-equivalent DECISIONS.md to the legacy path

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  _getAdapter,
  closeDatabase,
  insertDecision,
  openDatabase,
} from "../gsd-db.ts";
import { saveDecisionToDb, generateDecisionsMd } from "../db-writer.ts";
import {
  getAllDecisionsFromMemories,
  queryDecisionsFromMemories,
} from "../context-store.ts";
import { backfillDecisionsToMemories } from "../memory-backfill.ts";
import type { Decision } from "../types.ts";

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-decisions-stage2a-"));
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

function seedRawDecision(args: {
  id: string;
  when_context: string;
  scope: string;
  decision: string;
  choice: string;
  rationale: string;
  revisable?: string;
  made_by?: "human" | "agent" | "collaborative";
  superseded_by?: string | null;
}): void {
  insertDecision({
    id: args.id,
    when_context: args.when_context,
    scope: args.scope,
    decision: args.decision,
    choice: args.choice,
    rationale: args.rationale,
    revisable: args.revisable ?? "Yes",
    made_by: args.made_by ?? "agent",
    superseded_by: args.superseded_by ?? null,
  });
}

function setDecisionSupersededBy(id: string, supersededBy: string): void {
  const adapter = _getAdapter();
  if (!adapter) throw new Error("DB adapter unavailable");
  adapter
    .prepare("UPDATE decisions SET superseded_by = :s WHERE id = :id")
    .run({ ":s": supersededBy, ":id": id });
}

// ─── Backfill: superseded inclusion + structuredFields preservation ────────

test("backfill migrates superseded decisions (no active-only filter)", () => {
  const base = makeTmpBase();
  try {
    seedRawDecision({
      id: "D001",
      when_context: "M001 discuss",
      scope: "M001",
      decision: "Use A",
      choice: "A",
      rationale: "first idea",
      superseded_by: "D002",
    });
    seedRawDecision({
      id: "D002",
      when_context: "M001 discuss",
      scope: "M001",
      decision: "Switch to B",
      choice: "B",
      rationale: "second thought",
      superseded_by: null,
    });

    const written = backfillDecisionsToMemories();
    assert.equal(written, 2, "both active and superseded rows should be migrated");

    const all = getAllDecisionsFromMemories();
    assert.equal(all.length, 2);
    const d001 = all.find((d) => d.id === "D001");
    const d002 = all.find((d) => d.id === "D002");
    assert.ok(d001 && d002);
    assert.equal(d001.superseded_by, "D002", "structuredFields.superseded_by must be preserved");
    assert.equal(d002.superseded_by, null);
  } finally {
    cleanup(base);
  }
});

test("backfill is idempotent — re-running over migrated rows is a no-op", () => {
  const base = makeTmpBase();
  try {
    seedRawDecision({
      id: "D001",
      when_context: "M001",
      scope: "M001",
      decision: "x",
      choice: "y",
      rationale: "z",
    });

    const first = backfillDecisionsToMemories();
    assert.equal(first, 1);
    const second = backfillDecisionsToMemories();
    assert.equal(second, 0, "already-migrated rows must not be re-inserted");
  } finally {
    cleanup(base);
  }
});

// ─── Drift auto-heal ───────────────────────────────────────────────────────

test("backfill auto-heals when a source decision's superseded_by changes after migration", () => {
  const base = makeTmpBase();
  try {
    seedRawDecision({
      id: "D001",
      when_context: "M001",
      scope: "M001",
      decision: "Original",
      choice: "A",
      rationale: "r",
    });
    // Initial migration: D001 is active.
    backfillDecisionsToMemories();
    const beforeHeal = getAllDecisionsFromMemories().find((d) => d.id === "D001");
    assert.equal(beforeHeal?.superseded_by, null);

    // Simulate md-importer setting superseded_by on the existing decision row.
    seedRawDecision({
      id: "D002",
      when_context: "M001",
      scope: "M001",
      decision: "New",
      choice: "B",
      rationale: "newer",
    });
    setDecisionSupersededBy("D001", "D002");

    // Second backfill pass: should heal D001's memory + migrate D002.
    backfillDecisionsToMemories();

    const afterHeal = getAllDecisionsFromMemories().find((d) => d.id === "D001");
    assert.equal(
      afterHeal?.superseded_by,
      "D002",
      "drift auto-heal must update structuredFields.superseded_by on existing migrated memories",
    );
    const d002 = getAllDecisionsFromMemories().find((d) => d.id === "D002");
    assert.equal(d002?.superseded_by, null, "newly-migrated D002 stays active");
  } finally {
    cleanup(base);
  }
});

test("backfill drift auto-heal updates only the selected memory row", () => {
  const base = makeTmpBase();
  try {
    seedRawDecision({
      id: "D001",
      when_context: "M001",
      scope: "M001",
      decision: "Original",
      choice: "A",
      rationale: "r",
    });
    backfillDecisionsToMemories();

    const adapter = _getAdapter();
    if (!adapter) throw new Error("DB adapter unavailable");
    const now = new Date().toISOString();
    adapter
      .prepare(
        `INSERT INTO memories (
          id, category, content, confidence, created_at, updated_at, scope, tags, structured_fields
        ) VALUES (
          :id, 'architecture', 'duplicate marker', 0.8, :created_at, :updated_at, 'project', '[]', :structured_fields
        )`,
      )
      .run({
        ":id": "manual-duplicate-D001",
        ":created_at": now,
        ":updated_at": now,
        ":structured_fields": JSON.stringify({
          sourceDecisionId: "D001",
          superseded_by: null,
          note: "manual duplicate should not be healed as a side effect",
        }),
      });

    setDecisionSupersededBy("D001", "D002");
    backfillDecisionsToMemories();

    const rows = adapter
      .prepare("SELECT id, structured_fields FROM memories WHERE structured_fields LIKE :pattern ORDER BY seq")
      .all({ ":pattern": '%"sourceDecisionId":"D001"%' }) as Array<{
        id: string;
        structured_fields: string;
      }>;
    assert.equal(rows.length, 2);
    const healed = rows.find((row) => row.id !== "manual-duplicate-D001");
    const duplicate = rows.find((row) => row.id === "manual-duplicate-D001");
    assert.equal(JSON.parse(healed?.structured_fields ?? "{}").superseded_by, "D002");
    assert.equal(
      JSON.parse(duplicate?.structured_fields ?? "{}").superseded_by,
      null,
      "drift auto-heal must not update every memory matching the sourceDecisionId pattern",
    );
  } finally {
    cleanup(base);
  }
});

// ─── queryDecisionsFromMemories: active-only via structuredFields ──────────

test("queryDecisionsFromMemories filters out rows whose structuredFields.superseded_by is set", () => {
  const base = makeTmpBase();
  try {
    seedRawDecision({
      id: "D001",
      when_context: "M001",
      scope: "M001",
      decision: "Old",
      choice: "A",
      rationale: "r1",
      superseded_by: "D002",
    });
    seedRawDecision({
      id: "D002",
      when_context: "M001",
      scope: "M001",
      decision: "New",
      choice: "B",
      rationale: "r2",
    });
    backfillDecisionsToMemories();

    const active = queryDecisionsFromMemories();
    assert.equal(active.length, 1, "only the non-superseded decision should appear");
    assert.equal(active[0]?.id, "D002");
  } finally {
    cleanup(base);
  }
});

// ─── getAllDecisionsFromMemories: full register including superseded ───────

test("getAllDecisionsFromMemories returns the full register including superseded", () => {
  const base = makeTmpBase();
  try {
    seedRawDecision({
      id: "D001",
      when_context: "M001",
      scope: "M001",
      decision: "First",
      choice: "A",
      rationale: "r1",
      superseded_by: "D002",
    });
    seedRawDecision({
      id: "D002",
      when_context: "M001",
      scope: "M001",
      decision: "Second",
      choice: "B",
      rationale: "r2",
    });
    backfillDecisionsToMemories();

    const all = getAllDecisionsFromMemories();
    assert.equal(all.length, 2);
    assert.deepEqual(
      all.map((d) => ({ id: d.id, superseded_by: d.superseded_by })),
      [
        { id: "D001", superseded_by: "D002" },
        { id: "D002", superseded_by: null },
      ],
    );
  } finally {
    cleanup(base);
  }
});

// ─── Projection parity: legacy table source vs memories source ─────────────

function decisionFromLegacyRow(row: Record<string, unknown>): Decision {
  return {
    seq: row["seq"] as number,
    id: row["id"] as string,
    when_context: row["when_context"] as string,
    scope: row["scope"] as string,
    decision: row["decision"] as string,
    choice: row["choice"] as string,
    rationale: row["rationale"] as string,
    revisable: row["revisable"] as string,
    made_by: ((row["made_by"] as string) ?? "agent") as Decision["made_by"],
    superseded_by: (row["superseded_by"] as string) ?? null,
  };
}

test("DECISIONS.md projection from memories matches the legacy decisions-table render", async () => {
  const base = makeTmpBase();
  try {
    // Seed three decisions with mixed superseded chains directly into the
    // decisions table to ensure the legacy-side fixture is realistic.
    seedRawDecision({
      id: "D001",
      when_context: "M001 discuss",
      scope: "M001",
      decision: "Initial direction",
      choice: "A",
      rationale: "rationale-1",
      superseded_by: "D003",
    });
    seedRawDecision({
      id: "D002",
      when_context: "M001 plan",
      scope: "M001-S01",
      decision: "Active call",
      choice: "B",
      rationale: "rationale-2",
    });
    seedRawDecision({
      id: "D003",
      when_context: "M002 review",
      scope: "M002",
      decision: "Replacement for D001",
      choice: "C",
      rationale: "rationale-3",
    });

    // Run backfill so memories carries the full chain.
    backfillDecisionsToMemories();

    // Legacy render: read the decisions table directly, render via the
    // existing generateDecisionsMd helper.
    const adapter = _getAdapter();
    if (!adapter) throw new Error("DB adapter unavailable");
    const legacyRows = adapter.prepare("SELECT * FROM decisions ORDER BY seq").all() as Array<
      Record<string, unknown>
    >;
    const legacyDecisions = legacyRows.map(decisionFromLegacyRow);
    const legacyMd = generateDecisionsMd(legacyDecisions);

    // Memory-sourced render: same generator, but Decision[] from memories.
    const memoryDecisions = getAllDecisionsFromMemories();
    const memoryMd = generateDecisionsMd(memoryDecisions);

    assert.equal(memoryMd, legacyMd, "memory-sourced projection must match decisions-table render byte-for-byte");
  } finally {
    cleanup(base);
  }
});

test("saveDecisionToDb writes a DECISIONS.md projection sourced from memories that round-trips", async () => {
  const base = makeTmpBase();
  try {
    // Use the public write path so dual-write + projection happen end-to-end.
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
    await saveDecisionToDb(
      {
        when_context: "M001 plan",
        scope: "M001-S01",
        decision: "Schema versioning",
        choice: "header column",
        rationale: "simplest to read",
      },
      base,
    );

    const md = readFileSync(join(base, ".gsd", "DECISIONS.md"), "utf-8");
    // The projection must include both rows by ID — proving the regen
    // sourced from memories (where dual-write landed them) rather than
    // silently skipping anything.
    assert.match(md, /\| D001 \|/);
    assert.match(md, /\| D002 \|/);
    assert.match(md, /Adopt SQLite/);
    assert.match(md, /Schema versioning/);
    assert.match(md, /# Decisions Register/);
    assert.match(md, /\| D002 \|[^\n]*\| Yes \| agent \|/);
  } finally {
    cleanup(base);
  }
});

test("saveDecisionToDb injects a projection fallback when memory mirror is absent", async () => {
  const base = makeTmpBase();
  try {
    const result = await saveDecisionToDb(
      {
        when_context: "M001 fallback",
        scope: "M001",
        decision: "",
        choice: "",
        rationale: "",
      },
      base,
    );

    assert.equal(result.id, "D001");
    assert.equal(getAllDecisionsFromMemories().some((d) => d.id === "D001"), false);

    const md = readFileSync(join(base, ".gsd", "DECISIONS.md"), "utf-8");
    assert.match(md, /\| D001 \| M001 fallback \| M001 \|  \|  \|  \| Yes \| agent \|/);
  } finally {
    cleanup(base);
  }
});
