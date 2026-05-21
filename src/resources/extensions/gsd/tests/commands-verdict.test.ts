/**
 * Tests for /gsd verdict — manual override of milestone validation verdict.
 *
 * Covers parseValidationFile section extraction and handleVerdict end-to-end:
 * pass override, needs-remediation override with rationale, missing rationale
 * rejection, active-milestone fallback, missing VALIDATION rejection.
 *
 * Also asserts the three paused-state messages reference /gsd verdict so the
 * user has a discoverable recovery path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { handleVerdict, parseValidationFile } from "../commands-verdict.ts";
import { openDatabase, closeDatabase, _getAdapter, insertAssessment } from "../gsd-db.ts";
import { invalidateStateCache } from "../state.ts";

interface NotifyCall {
  message: string;
  kind: string;
}

function makeMockCtx(): { ctx: any; calls: NotifyCall[] } {
  const calls: NotifyCall[] = [];
  const ctx = {
    ui: {
      notify: (message: string, kind: string) => {
        calls.push({ message, kind });
      },
    },
  };
  return { ctx, calls };
}

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), `gsd-verdict-${randomUUID()}-`));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* swallow */ }
}

function openTestDb(base: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
}

function seedMilestone(milestoneId: string, title: string, status = "active"): void {
  const db = _getAdapter();
  if (!db) throw new Error("DB not open");
  db.prepare(
    "INSERT OR REPLACE INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)",
  ).run(milestoneId, title, status, new Date().toISOString());
}

function seedSlice(milestoneId: string, sliceId: string, status: string): void {
  const db = _getAdapter();
  if (!db) throw new Error("DB not open");
  db.prepare(
    "INSERT OR REPLACE INTO slices (milestone_id, id, title, status, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(milestoneId, sliceId, `Slice ${sliceId}`, status, new Date().toISOString());
}

function writeValidation(base: string, milestoneId: string, verdict: string, round = 0): string {
  const milestoneDir = join(base, ".gsd", "milestones", milestoneId);
  mkdirSync(milestoneDir, { recursive: true });
  const path = join(milestoneDir, `${milestoneId}-VALIDATION.md`);
  const md = [
    "---",
    `verdict: ${verdict}`,
    `remediation_round: ${round}`,
    "---",
    "",
    `# Milestone Validation: ${milestoneId}`,
    "",
    "## Success Criteria Checklist",
    "- [x] Criterion A met",
    "- [x] Criterion B met",
    "",
    "## Slice Delivery Audit",
    "| Slice | Result |",
    "| --- | --- |",
    "| S01 | delivered |",
    "",
    "## Cross-Slice Integration",
    "No cross-slice mismatches detected.",
    "",
    "## Requirement Coverage",
    "All requirements covered.",
    "",
    "## Verdict Rationale",
    `Initial verdict was ${verdict}.`,
    "",
  ].join("\n");
  writeFileSync(path, md);
  return path;
}

// ─── parseValidationFile ────────────────────────────────────────────────

test("parseValidationFile extracts all standard sections and frontmatter", () => {
  const md = [
    "---",
    "verdict: needs-attention",
    "remediation_round: 2",
    "---",
    "",
    "# Milestone Validation: M001",
    "",
    "## Success Criteria Checklist",
    "- [x] First",
    "- [ ] Second",
    "",
    "## Slice Delivery Audit",
    "| Slice | Delivered |",
    "",
    "## Cross-Slice Integration",
    "Boundary intact.",
    "",
    "## Requirement Coverage",
    "R001 covered.",
    "",
    "## Verification Class Compliance",
    "Operational: MET",
    "",
    "## Verdict Rationale",
    "Acceptance proof incomplete.",
    "",
    "## Remediation Plan",
    "Address acceptance proof.",
    "",
  ].join("\n");

  const parsed = parseValidationFile(md);

  assert.equal(parsed.verdict, "needs-attention");
  assert.equal(parsed.remediationRound, 2);
  assert.match(parsed.successCriteriaChecklist, /First/);
  assert.match(parsed.successCriteriaChecklist, /Second/);
  assert.match(parsed.sliceDeliveryAudit, /Delivered/);
  assert.match(parsed.crossSliceIntegration, /Boundary intact/);
  assert.match(parsed.requirementCoverage, /R001 covered/);
  assert.match(parsed.verificationClasses ?? "", /Operational: MET/);
  assert.match(parsed.verdictRationale, /Acceptance proof incomplete/);
  assert.match(parsed.remediationPlan ?? "", /Address acceptance proof/);
});

test("parseValidationFile omits optional sections when absent", () => {
  const md = [
    "---",
    "verdict: pass",
    "remediation_round: 0",
    "---",
    "",
    "## Success Criteria Checklist",
    "- [x] All met",
    "",
    "## Slice Delivery Audit",
    "Done.",
    "",
    "## Cross-Slice Integration",
    "Clean.",
    "",
    "## Requirement Coverage",
    "Complete.",
    "",
    "## Verdict Rationale",
    "All criteria met.",
  ].join("\n");

  const parsed = parseValidationFile(md);

  assert.equal(parsed.verdict, "pass");
  assert.equal(parsed.remediationRound, 0);
  assert.equal(parsed.verificationClasses, undefined);
  assert.equal(parsed.remediationPlan, undefined);
});

// ─── handleVerdict — argument validation ────────────────────────────────

test("handleVerdict rejects missing verdict", async () => {
  const { ctx, calls } = makeMockCtx();
  await handleVerdict("", ctx, "/tmp/unused");
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /Usage: \/gsd verdict/);
  assert.equal(calls[0].kind, "warning");
});

test("handleVerdict rejects invalid verdict", async () => {
  const { ctx, calls } = makeMockCtx();
  await handleVerdict("yolo", ctx, "/tmp/unused");
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /Invalid verdict "yolo"/);
  assert.equal(calls[0].kind, "warning");
});

test("handleVerdict rejects needs-remediation without --rationale", async () => {
  const base = makeBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Test Milestone");
    seedSlice("M001", "S01", "complete");
    writeValidation(base, "M001", "pass");

    const { ctx, calls } = makeMockCtx();
    await handleVerdict("needs-remediation --milestone M001", ctx, base);

    assert.ok(
      calls.some((c) => /--rationale is required/.test(c.message)),
      `expected rationale-required warning, got: ${JSON.stringify(calls)}`,
    );
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});

test("handleVerdict rejects when milestone validation is missing", async () => {
  const base = makeBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Test Milestone");
    seedSlice("M001", "S01", "complete");
    mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });

    const { ctx, calls } = makeMockCtx();
    await handleVerdict("pass --milestone M001", ctx, base);

    assert.ok(
      calls.some((c) => /No milestone validation found/.test(c.message)),
      `expected missing-validation warning, got: ${JSON.stringify(calls)}`,
    );
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});

// ─── handleVerdict — pass override flow ─────────────────────────────────

test("handleVerdict pass override flips verdict and preserves sections", async () => {
  const base = makeBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Test Milestone");
    seedSlice("M001", "S01", "complete");
    const validationPath = writeValidation(base, "M001", "needs-attention");

    const { ctx, calls } = makeMockCtx();
    await handleVerdict("pass --milestone M001", ctx, base);

    const rewritten = readFileSync(validationPath, "utf-8");
    assert.match(rewritten, /^verdict: pass$/m, "verdict should flip to pass");
    assert.match(rewritten, /Criterion A met/, "success criteria preserved");
    assert.match(rewritten, /S01 \| delivered/, "slice audit preserved");
    assert.match(rewritten, /Manually overridden via \/gsd verdict/, "default rationale applied");

    assert.ok(
      calls.some((c) => c.kind === "success" && /needs-attention.*->.*pass/.test(c.message)),
      `expected success notification, got: ${JSON.stringify(calls)}`,
    );
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});

test("handleVerdict pass override works when validation only exists in DB", async () => {
  const base = makeBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Test Milestone");
    seedSlice("M001", "S01", "complete");

    const dbOnlyValidation = [
      "---",
      "verdict: needs-attention",
      "remediation_round: 1",
      "---",
      "",
      "# Milestone Validation: M001",
      "",
      "## Success Criteria Checklist",
      "- [x] Criterion A met",
      "",
      "## Slice Delivery Audit",
      "| Slice | Result |",
      "| --- | --- |",
      "| S01 | delivered |",
      "",
      "## Cross-Slice Integration",
      "Clean.",
      "",
      "## Requirement Coverage",
      "Covered.",
      "",
      "## Verdict Rationale",
      "Manual attention was requested.",
      "",
    ].join("\n");

    insertAssessment({
      path: "/external/worktree/.gsd/milestones/M001/M001-VALIDATION.md",
      milestoneId: "M001",
      status: "needs-attention",
      scope: "milestone-validation",
      fullContent: dbOnlyValidation,
    });

    const { ctx, calls } = makeMockCtx();
    await handleVerdict('pass --milestone M001 --rationale "reviewed and accepted"', ctx, base);

    const validationPath = join(base, ".gsd", "milestones", "M001", "M001-VALIDATION.md");
    const rewritten = readFileSync(validationPath, "utf-8");
    assert.match(rewritten, /^verdict: pass$/m, "DB-backed validation should be rewritten as pass");
    assert.match(rewritten, /reviewed and accepted/, "explicit rationale should be persisted");

    assert.ok(
      calls.some((c) => c.kind === "success" && /needs-attention.*->.*pass/.test(c.message)),
      `expected success notification, got: ${JSON.stringify(calls)}`,
    );
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});

test("handleVerdict needs-remediation override with --rationale rewrites verdict", async () => {
  const base = makeBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Test Milestone");
    seedSlice("M001", "S01", "complete");
    const validationPath = writeValidation(base, "M001", "pass");

    const { ctx, calls } = makeMockCtx();
    await handleVerdict(
      'needs-remediation --milestone M001 --rationale "found missing slice"',
      ctx,
      base,
    );

    const rewritten = readFileSync(validationPath, "utf-8");
    assert.match(rewritten, /^verdict: needs-remediation$/m);
    assert.match(rewritten, /found missing slice/);

    assert.ok(
      calls.some((c) => /gsd_reassess_roadmap/.test(c.message)),
      "needs-remediation override should suggest gsd_reassess_roadmap follow-up",
    );
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});

test("handleVerdict resolves active milestone when --milestone omitted", async () => {
  const base = makeBase();
  try {
    openTestDb(base);
    seedMilestone("M042", "Active Milestone");
    seedSlice("M042", "S01", "complete");
    const validationPath = writeValidation(base, "M042", "needs-attention");

    const { ctx, calls } = makeMockCtx();
    invalidateStateCache();
    await handleVerdict("pass", ctx, base);

    const rewritten = readFileSync(validationPath, "utf-8");
    assert.match(rewritten, /^verdict: pass$/m);
    assert.ok(
      calls.some((c) => c.kind === "success" && /M042/.test(c.message)),
      `expected success notification naming M042, got: ${JSON.stringify(calls)}`,
    );
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});

// ─── Pause messages reference /gsd verdict ─────────────────────────────

test("auto-dispatch needs-attention pause message references /gsd verdict", async () => {
  const { DISPATCH_RULES } = await import("../auto-dispatch.ts");
  const rule = DISPATCH_RULES.find((r) => r.name === "completing-milestone → complete-milestone");
  assert.ok(rule, "completing-milestone rule should exist");

  const base = mkdtempSync(join(tmpdir(), "gsd-verdict-paused-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  try {
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-VALIDATION.md"),
      "---\nverdict: needs-attention\nremediation_round: 0\n---\n\n# Validation\nNeeds work.\n",
    );

    const result = await rule!.match({
      mid: "M001",
      midTitle: "Test",
      basePath: base,
      state: { phase: "completing-milestone" } as any,
      prefs: {} as any,
      session: undefined,
    } as any);

    assert.ok(result !== null);
    assert.equal(result!.action, "stop");
    if (result!.action === "stop") {
      assert.match(result!.reason, /\/gsd verdict/);
    }
  } finally {
    cleanup(base);
  }
});

test("state.ts needs-remediation blocker messages reference /gsd verdict", async () => {
  // We don't need to invoke deriveState — just assert the substring is in the
  // source. The blocker strings are constructed inline and shipped to the user
  // verbatim, so a static check is sufficient and avoids fragile DB setup.
  const stateSource = readFileSync(
    new URL("../state.ts", import.meta.url).pathname,
    "utf-8",
  );
  const occurrences = stateSource.match(/`\/gsd verdict /g) ?? [];
  assert.ok(
    occurrences.length >= 2,
    `expected at least 2 references to /gsd verdict in state.ts blockers, found ${occurrences.length}`,
  );
});
