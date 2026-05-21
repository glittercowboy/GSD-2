// GSD Extension — Regression test for #4996: deferred milestone dir creation

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { isReusableGhostMilestone } from "../state.ts";
import { nextMilestoneIdReserved } from "../milestone-id-reservation.ts";
import { clearReservedMilestoneIds, findMilestoneIds } from "../milestone-ids.ts";
import { invalidateAllCaches } from "../cache.ts";
import { closeDatabase, openDatabase } from "../gsd-db.ts";

function makeBase(prefix = "gsd-deferred-dir-"): string {
  const base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

describe("deferred milestone dir creation (#4996)", () => {
  let base: string;

  beforeEach(() => {
    clearReservedMilestoneIds();
  });

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    try { invalidateAllCaches(); } catch { /* ignore */ }
    try { clearReservedMilestoneIds(); } catch { /* ignore */ }
    try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("(a) fresh project: milestones dir has no M001 entry before any discuss flow", () => {
    base = makeBase();
    const nextId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    assert.equal(nextId, "M001");

    const ids = findMilestoneIds(base);
    assert.equal(ids.length, 0);
    assert.ok(!existsSync(join(base, ".gsd", "milestones", "M001")));
  });

  it("(b) abandoned discuss flow leaves no orphan", () => {
    base = makeBase();
    const nextId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    assert.equal(nextId, "M001");

    const m001Dir = join(base, ".gsd", "milestones", "M001");
    assert.ok(!existsSync(m001Dir));
    assert.equal(isReusableGhostMilestone(base, "M001"), false);
    assert.ok(!findMilestoneIds(base).includes("M001"));
  });

  it("(c) a stub dir left from a previous bug is reusable", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    mkdirSync(join(base, ".gsd", "milestones", "M001", "slices"), { recursive: true });

    assert.equal(isReusableGhostMilestone(base, "M001"), true);
    assert.equal(nextMilestoneIdReserved(findMilestoneIds(base), false, base), "M001");
    assert.ok(!existsSync(join(base, ".gsd", "milestones", "M002")));
  });
});
