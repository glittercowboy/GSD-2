import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { runGSDDoctor } from "../doctor.ts";
import { clearParseCache } from "../files.ts";
import { clearPathCache } from "../paths.ts";
import { invalidateAllCaches } from "../cache.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-doctor-severity-${randomUUID()}`);
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

// ─── Reproduction: missing_slice_dir severity for future (not-yet-started) slices ───

test("missing_slice_dir for slices ahead of active slice should NOT be 'error'", async () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    const mDir = join(base, ".gsd", "milestones", "M001");

    // S01 is done, S02-S05 have no directories yet (normal forward state)
    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [x] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: S01 works
- [ ] **S02: Second Slice** \`risk:low\` \`depends:[S01]\`
  > After this: S02 works
- [ ] **S03: Third Slice** \`risk:low\` \`depends:[S01]\`
  > After this: S03 works
- [ ] **S04: Fourth Slice** \`risk:low\` \`depends:[S02]\`
  > After this: S04 works
- [ ] **S05: Fifth Slice** \`risk:low\` \`depends:[S03]\`
  > After this: S05 works
`);

    // Only S01 has a directory (it's the active/done one)
    mkdirSync(join(mDir, "slices", "S01", "tasks"), { recursive: true });

    const report = await runGSDDoctor(base, { fix: false, scope: "M001" });

    const missingDirIssues = report.issues.filter(i => i.code === "missing_slice_dir");
    assert.ok(missingDirIssues.length >= 4, `should have missing_slice_dir issues for S02-S05, got ${missingDirIssues.length}`);

    // S02 is the first non-done slice (the "active" one) — it should be "error"
    const s02 = missingDirIssues.find(i => i.unitId === "M001/S02");
    assert.ok(s02, "should have missing_slice_dir for S02");
    assert.equal(s02!.severity, "error", "active slice S02 missing dir should be error");

    // S03-S05 are future slices — they should NOT be "error"
    for (const sid of ["S03", "S04", "S05"]) {
      const issue = missingDirIssues.find(i => i.unitId === `M001/${sid}`);
      assert.ok(issue, `should have missing_slice_dir for ${sid}`);
      assert.notEqual(
        issue!.severity,
        "error",
        `future slice ${sid} missing dir should not be error severity (got: ${issue!.severity})`,
      );
    }
  } finally {
    cleanup(base);
  }
});

test("missing_slice_dir for the first non-done slice should remain 'error'", async () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    const mDir = join(base, ".gsd", "milestones", "M001");

    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [x] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: S01 works
- [ ] **S02: Active Slice** \`risk:low\` \`depends:[S01]\`
  > After this: S02 works
`);

    mkdirSync(join(mDir, "slices", "S01", "tasks"), { recursive: true });
    // S02 directory is missing

    const report = await runGSDDoctor(base, { fix: false, scope: "M001" });

    const s02Issue = report.issues.find(i => i.code === "missing_slice_dir" && i.unitId === "M001/S02");
    assert.ok(s02Issue, "should detect missing_slice_dir for S02");
    assert.equal(s02Issue!.severity, "error", "first non-done slice missing dir should be error");
  } finally {
    cleanup(base);
  }
});

test("missing_slice_dir for done slices should be 'warning' (not 'error')", async () => {
  const base = makeTmpBase();
  try {
    clearPathCache();
    clearParseCache();
    invalidateAllCaches();

    const mDir = join(base, ".gsd", "milestones", "M001");

    // S01 is marked done but has no directory (edge case)
    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [x] **S01: Done Slice** \`risk:low\` \`depends:[]\`
  > After this: S01 works
`);

    const report = await runGSDDoctor(base, { fix: false, scope: "M001" });

    const s01Issue = report.issues.find(i => i.code === "missing_slice_dir" && i.unitId === "M001/S01");
    assert.ok(s01Issue, "should detect missing_slice_dir for done S01");
    assert.equal(s01Issue!.severity, "warning", "done slice missing dir should be warning");
  } finally {
    cleanup(base);
  }
});
