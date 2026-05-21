// GSD-2 auto-start regression test: cleanStaleRuntimeUnits is DB-gated (#4663)

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { cleanStaleRuntimeUnits } from "../auto-worktree.ts";

function makeBase(): string {
  return join(tmpdir(), `gsd-clean-runtime-${randomUUID()}`);
}

describe("auto-start cleanStaleRuntimeUnits DB gating (#4663)", () => {
  test("predicate controls whether milestone runtime units are removed", () => {
    const base = makeBase();
    const unitsDir = join(base, ".gsd", "runtime", "units");
    try {
      mkdirSync(unitsDir, { recursive: true });
      const unitFile = join(unitsDir, "execute-task-M001-S01-T01.json");
      writeFileSync(unitFile, "{}\n", "utf-8");

      assert.equal(cleanStaleRuntimeUnits(join(base, ".gsd"), () => false), 0);
      assert.equal(existsSync(unitFile), true);

      assert.equal(cleanStaleRuntimeUnits(join(base, ".gsd"), (mid) => mid === "M001"), 1);
      assert.equal(existsSync(unitFile), false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("cleanStaleRuntimeUnits removes legacy pseudo deep-setup runtime files", () => {
    const base = makeBase();
    const gsdRoot = join(base, ".gsd");
    const unitsDir = join(gsdRoot, "runtime", "units");
    try {
      mkdirSync(unitsDir, { recursive: true });
      const staleFiles = [
        "discuss-milestone-PROJECT.json",
        "workflow-preferences-WORKFLOW-PREFS.json",
        "discuss-project-PROJECT.json",
        "discuss-requirements-REQUIREMENTS.json",
        "research-decision-RESEARCH-DECISION.json",
        "research-project-RESEARCH-PROJECT.json",
      ];
      const valid = join(unitsDir, "discuss-milestone-M001.json");
      for (const file of staleFiles) writeFileSync(join(unitsDir, file), "{}\n", "utf-8");
      writeFileSync(valid, "{}\n", "utf-8");

      const cleaned = cleanStaleRuntimeUnits(gsdRoot, () => false);

      assert.equal(cleaned, staleFiles.length);
      for (const file of staleFiles) assert.equal(existsSync(join(unitsDir, file)), false);
      assert.equal(existsSync(valid), true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
