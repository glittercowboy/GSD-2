import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  openDatabase,
} from "../gsd-db.ts";
import type { GSDState, Phase } from "../types.ts";
import {
  ensurePlanV2Graph,
  hasFinalizedMilestoneContext,
  isEmptyPlanV2GraphResult,
  isMissingFinalizedContextResult,
} from "../uok/plan-v2.ts";
import {
  _needsPlanV2GateForTest,
  _runPlanV2GateForTest,
} from "../guided-flow.ts";
import { shouldRunPlanV2Gate } from "../auto/phases.ts";
import { resolveUokFlags } from "../uok/flags.ts";

const MILESTONE_ID = "M001";
const SLICE_ID = "S01";
const TASK_ID = "T01";
const tempDirs = new Set<string>();

function createBasePath(): string {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-uok-planv2-"));
  mkdirSync(join(basePath, ".gsd", "milestones", MILESTONE_ID), { recursive: true });
  tempDirs.add(basePath);
  return basePath;
}

function writeMilestoneFile(basePath: string, suffix: string, content: string): void {
  const milestoneDir = join(basePath, ".gsd", "milestones", MILESTONE_ID);
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(join(milestoneDir, `${MILESTONE_ID}-${suffix}.md`), `${content}\n`, "utf-8");
}

function writeSliceFile(basePath: string, suffix: string, content: string): void {
  const sliceDir = join(basePath, ".gsd", "milestones", MILESTONE_ID, "slices", SLICE_ID);
  mkdirSync(sliceDir, { recursive: true });
  writeFileSync(join(sliceDir, `${SLICE_ID}-${suffix}.md`), `${content}\n`, "utf-8");
}

function seedGraphRows(): void {
  insertMilestone({ id: MILESTONE_ID, title: "Milestone", status: "active" });
  insertSlice({
    id: SLICE_ID,
    milestoneId: MILESTONE_ID,
    title: "Slice",
    status: "in_progress",
    sequence: 1,
  });
  insertTask({
    id: TASK_ID,
    milestoneId: MILESTONE_ID,
    sliceId: SLICE_ID,
    title: "Task",
    status: "pending",
    keyFiles: ["src/task.ts"],
    sequence: 1,
  });
}

function buildState(phase: Phase): GSDState {
  return {
    phase,
    activeMilestone: { id: MILESTONE_ID, title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    recentDecisions: [],
    blockers: [],
    nextAction: "dispatch",
    registry: [],
  };
}

test.beforeEach(() => {
  closeDatabase();
  const opened = openDatabase(":memory:");
  assert.equal(opened, true);
});

test.afterEach(() => {
  closeDatabase();
  for (const path of tempDirs) {
    rmSync(path, { recursive: true, force: true });
  }
  tempDirs.clear();
});

test("guided flow keeps plan-v2 fail-closed handling for non-recoverable failures", () => {
  const basePath = createBasePath();
  writeMilestoneFile(basePath, "CONTEXT", "Finalized context.");
  insertMilestone({ id: MILESTONE_ID, title: "Milestone", status: "active" });
  insertSlice({
    id: SLICE_ID,
    milestoneId: MILESTONE_ID,
    title: "Slice",
    status: "pending",
    sequence: 1,
  });

  const notifications: string[] = [];
  const decision = _runPlanV2GateForTest(
    { ui: { notify: (message: string) => notifications.push(message) } } as any,
    basePath,
    buildState("executing"),
  );

  assert.equal(decision, "block");
  assert.match(notifications[0] ?? "", /Plan gate failed-closed/);
});

test("guided flow routes recoverable missing finalized context to discuss-milestone", () => {
  const basePath = createBasePath();
  seedGraphRows();
  writeMilestoneFile(basePath, "CONTEXT-DRAFT", "Draft context only.");

  const decision = _runPlanV2GateForTest(
    { ui: { notify: () => undefined } } as any,
    basePath,
    buildState("executing"),
  );

  assert.equal(decision, "recover-missing-context");
});

test("guided and auto plan-v2 phase gates agree on execution phases", () => {
  assert.equal(_needsPlanV2GateForTest(buildState("planning")), false);
  assert.equal(_needsPlanV2GateForTest(buildState("executing")), true);
  assert.equal(shouldRunPlanV2Gate("planning"), false);
  assert.equal(shouldRunPlanV2Gate("executing"), true);
});

test("auto pre-dispatch uses resolved plan-v2 defaults", () => {
  assert.equal(resolveUokFlags(undefined).planV2, true);
  assert.equal(resolveUokFlags({ uok: { plan_v2: { enabled: false } } } as any).planV2, false);
});

test("plan-v2 gate fails closed for execution phase when finalized context is missing", () => {
  const basePath = createBasePath();
  seedGraphRows();

  writeMilestoneFile(basePath, "CONTEXT-DRAFT", "Draft context only.");

  const compiled = ensurePlanV2Graph(basePath, buildState("executing"));
  assert.equal(compiled.ok, false);
  assert.match(compiled.reason ?? "", /CONTEXT\.md/i);
  assert.equal(isMissingFinalizedContextResult(compiled), true);
});

test("plan-v2 gate accepts finalized context from project-root fallback", () => {
  const projectRoot = createBasePath();
  const worktreeBase = createBasePath();
  seedGraphRows();

  writeMilestoneFile(projectRoot, "CONTEXT", "Finalized context in project root.");
  writeMilestoneFile(worktreeBase, "CONTEXT-DRAFT", "Draft context in worktree.");

  const prevProjectRoot = process.env.GSD_PROJECT_ROOT;
  process.env.GSD_PROJECT_ROOT = projectRoot;
  try {
    const compiled = ensurePlanV2Graph(worktreeBase, buildState("executing"));
    assert.equal(compiled.ok, true);
    assert.equal(compiled.finalizedContextIncluded, true);
    assert.equal(hasFinalizedMilestoneContext(worktreeBase, MILESTONE_ID), true);
  } finally {
    if (prevProjectRoot === undefined) {
      delete process.env.GSD_PROJECT_ROOT;
    } else {
      process.env.GSD_PROJECT_ROOT = prevProjectRoot;
    }
  }
});

test("plan-v2 compiler writes pipeline metadata for clarify/research/draft stages", () => {
  const basePath = createBasePath();
  seedGraphRows();

  writeMilestoneFile(basePath, "CONTEXT", "Finalized context.");
  writeMilestoneFile(basePath, "CONTEXT-DRAFT", "Draft context retained.");
  writeMilestoneFile(basePath, "RESEARCH", "Milestone research synthesis.");
  writeSliceFile(basePath, "RESEARCH", "Slice research detail.");

  const compiled = ensurePlanV2Graph(basePath, buildState("executing"));
  assert.equal(compiled.ok, true);
  assert.equal(compiled.clarifyRoundLimit, 3);
  assert.equal(compiled.researchSynthesized, true);
  assert.equal(compiled.draftContextIncluded, true);
  assert.equal(compiled.finalizedContextIncluded, true);

  const graphPath = compiled.graphPath ?? "";
  const graphRaw = readFileSync(graphPath, "utf-8");
  const graph = JSON.parse(graphRaw) as {
    pipeline?: Record<string, unknown>;
    nodes?: unknown[];
  };

  assert.equal(graph.pipeline?.["clarifyRoundLimit"], 3);
  assert.equal(graph.pipeline?.["researchSynthesized"], true);
  assert.equal(graph.pipeline?.["draftContextIncluded"], true);
  assert.equal(graph.pipeline?.["finalizedContextIncluded"], true);
  assert.equal(Array.isArray(graph.nodes), true);
});

test("plan-v2 graph may compile during planning even without finalized context", () => {
  const basePath = createBasePath();
  seedGraphRows();

  writeMilestoneFile(basePath, "CONTEXT-DRAFT", "Planning draft context.");
  const compiled = ensurePlanV2Graph(basePath, buildState("planning"));
  assert.equal(compiled.ok, true);
});

test("plan-v2 ensure rejects empty executable graph", () => {
  const basePath = createBasePath();
  writeMilestoneFile(basePath, "CONTEXT", "Finalized context.");

  insertMilestone({ id: MILESTONE_ID, title: "Milestone", status: "active" });
  insertSlice({
    id: SLICE_ID,
    milestoneId: MILESTONE_ID,
    title: "Slice",
    status: "pending",
    sequence: 1,
  });

  const compiled = ensurePlanV2Graph(basePath, buildState("executing"));
  assert.equal(compiled.ok, false);
  assert.match(compiled.reason ?? "", /compiled graph is empty/i);
  assert.equal(isEmptyPlanV2GraphResult(compiled), true);
});

test("plan-v2 allows empty graph for milestone terminal phases", () => {
  const basePath = createBasePath();
  writeMilestoneFile(basePath, "CONTEXT", "Finalized context.");

  insertMilestone({ id: MILESTONE_ID, title: "Milestone", status: "active" });
  insertSlice({
    id: SLICE_ID,
    milestoneId: MILESTONE_ID,
    title: "Slice",
    status: "complete",
    sequence: 1,
  });

  const validating = ensurePlanV2Graph(basePath, buildState("validating-milestone"));
  assert.equal(validating.ok, true);
  assert.equal(validating.nodeCount, 0);

  const completing = ensurePlanV2Graph(basePath, buildState("completing-milestone"));
  assert.equal(completing.ok, true);
  assert.equal(completing.nodeCount, 0);
});
