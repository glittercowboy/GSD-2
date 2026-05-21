import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── Imports ──────────────────────────────────────────────────────────
const workspaceIndex = await import(
  "../../resources/extensions/gsd/workspace-index.ts"
);
const filesRoute = await import("../../../web/app/api/files/route.ts");

// Re-import status helpers from the web-side module
const workspaceStatus = await import("../../../web/lib/workspace-status.ts");
const commandSurface = await import("../../../web/lib/command-surface-contract.ts");
const {
  GSDWorkspaceStore,
  getLiveAutoDashboard,
  getLiveResumableSessions,
  getLiveWorkspaceIndex,
} = await import("../../../web/lib/gsd-workspace-store.tsx");
const { executeWorkflowActionInPowerMode } = await import("../../../web/lib/workflow-action-execution.ts");

// ─── Helpers ──────────────────────────────────────────────────────────
function makeGsdFixture(): { root: string; gsdDir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "gsd-state-surfaces-"));
  const gsdDir = join(root, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  return {
    root,
    gsdDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

// ─── Group 1: Workspace index — risk/depends/demo fields ─────────────
test("indexWorkspace extracts risk, depends, and demo from roadmap", async (t) => {
  const { root, gsdDir, cleanup } = makeGsdFixture();

  t.after(() => { cleanup(); });

  const milestoneDir = join(gsdDir, "milestones", "M001");
  const sliceDir = join(milestoneDir, "slices", "S01");
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Test Milestone",
      "",
      "## Slices",
      "- [ ] **S01: Feature slice** `risk:high` `depends:[S00]`",
      "  > After this: users can see the dashboard",
    ].join("\n"),
  );

  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    [
      "# S01: Feature slice",
      "",
      "**Goal:** Build the feature",
      "**Demo:** Dashboard renders",
      "",
      "## Tasks",
      "- [ ] **T01: Build thing** `est:30m`",
      "  Do the work.",
    ].join("\n"),
  );

  writeFileSync(join(tasksDir, "T01-PLAN.md"), "# T01: Build thing\n\n## Steps\n- do it\n");

  const index = await workspaceIndex.indexWorkspace(root);

  assert.equal(index.milestones.length, 1);
  assert.equal(index.milestones[0].id, "M001");

  const slice = index.milestones[0].slices[0];
  assert.equal(slice.id, "S01");
  assert.equal(slice.risk, "high");
  assert.deepEqual(slice.depends, ["S00"]);
  assert.equal(slice.demo, "users can see the dashboard");
  assert.equal(slice.done, false);
  assert.equal(slice.tasks.length, 1);
  assert.equal(slice.tasks[0].id, "T01");
  assert.equal(slice.tasks[0].done, false);
});

test("indexWorkspace handles slices without risk/depends/demo", async (t) => {
  const { root, gsdDir, cleanup } = makeGsdFixture();

  t.after(() => { cleanup(); });

  const milestoneDir = join(gsdDir, "milestones", "M001");
  const sliceDir = join(milestoneDir, "slices", "S01");
  mkdirSync(join(sliceDir, "tasks"), { recursive: true });

  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    "# M001: Minimal\n\n## Slices\n- [x] **S01: Done slice**\n",
  );

  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    "# S01: Done slice\n\n**Goal:** Done\n\n## Tasks\n",
  );

  const index = await workspaceIndex.indexWorkspace(root);

  const slice = index.milestones[0].slices[0];
  // Parser defaults risk to "low" when not specified, demo to "" when no blockquote
  assert.equal(slice.risk, "low");
  assert.deepEqual(slice.depends, []);
  assert.equal(slice.demo, "");
  assert.equal(slice.done, true);
});

// ─── Group 2: Shared status helpers ──────────────────────────────────
test("getMilestoneStatus returns correct statuses", () => {
  const { getMilestoneStatus } = workspaceStatus;

  // All slices done → done
  const doneMilestone = {
    id: "M001",
    title: "Done",
    slices: [
      { id: "S01", title: "S01", done: true, tasks: [] },
      { id: "S02", title: "S02", done: true, tasks: [] },
    ],
  };
  assert.equal(getMilestoneStatus(doneMilestone, {}), "done");

  // Active milestone with some done slices → in-progress
  const activeMilestone = {
    id: "M001",
    title: "Active",
    slices: [
      { id: "S01", title: "S01", done: true, tasks: [] },
      { id: "S02", title: "S02", done: false, tasks: [] },
    ],
  };
  assert.equal(getMilestoneStatus(activeMilestone, { milestoneId: "M001" }), "in-progress");

  // Not active, no done slices → pending
  const pendingMilestone = {
    id: "M002",
    title: "Pending",
    slices: [
      { id: "S01", title: "S01", done: false, tasks: [] },
    ],
  };
  assert.equal(getMilestoneStatus(pendingMilestone, { milestoneId: "M001" }), "pending");
});

test("getSliceStatus returns correct statuses", () => {
  const { getSliceStatus } = workspaceStatus;

  // Done slice
  assert.equal(
    getSliceStatus("M001", { id: "S01", title: "S01", done: true, tasks: [] }, { milestoneId: "M001", sliceId: "S01" }),
    "done",
  );

  // Active slice
  assert.equal(
    getSliceStatus("M001", { id: "S01", title: "S01", done: false, tasks: [] }, { milestoneId: "M001", sliceId: "S01" }),
    "in-progress",
  );

  // Pending slice (different milestone active)
  assert.equal(
    getSliceStatus("M002", { id: "S01", title: "S01", done: false, tasks: [] }, { milestoneId: "M001", sliceId: "S01" }),
    "pending",
  );
});

test("getTaskStatus returns correct statuses", () => {
  const { getTaskStatus } = workspaceStatus;
  const active = { milestoneId: "M001", sliceId: "S01", taskId: "T01" };

  // Done task
  assert.equal(
    getTaskStatus("M001", "S01", { id: "T01", title: "T01", done: true }, active),
    "done",
  );

  // Active task
  assert.equal(
    getTaskStatus("M001", "S01", { id: "T01", title: "T01", done: false }, active),
    "in-progress",
  );

  // Pending task (different task active)
  assert.equal(
    getTaskStatus("M001", "S01", { id: "T02", title: "T02", done: false }, active),
    "pending",
  );
});

// ─── Group 3: Files API — tree listing ───────────────────────────────
test("files API returns tree listing of .gsd/ directory", async (t) => {
  const { root, gsdDir, cleanup } = makeGsdFixture();
  const origEnv = process.env.GSD_WEB_PROJECT_CWD;

  t.after(() => {
    process.env.GSD_WEB_PROJECT_CWD = origEnv;
    cleanup();
  });

  process.env.GSD_WEB_PROJECT_CWD = root;

  // Create some files
  writeFileSync(join(gsdDir, "STATE.md"), "# State\nactive");
  writeFileSync(join(gsdDir, "PROJECT.md"), "# Project");
  const msDir = join(gsdDir, "milestones", "M001");
  mkdirSync(msDir, { recursive: true });
  writeFileSync(join(msDir, "M001-ROADMAP.md"), "# Roadmap");

  const request = new Request("http://localhost:3000/api/files");
  const response = await filesRoute.GET(request);
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.ok(Array.isArray(data.tree));
  assert.ok(data.tree.length > 0);

  // Should have files at root level
  const names = data.tree.map((n: { name: string }) => n.name);
  assert.ok(names.includes("STATE.md"), `Expected STATE.md in tree, got: ${names}`);
  assert.ok(names.includes("PROJECT.md"), `Expected PROJECT.md in tree, got: ${names}`);
  assert.ok(names.includes("milestones"), `Expected milestones in tree, got: ${names}`);

  // milestones should be a directory with children
  const milestones = data.tree.find((n: { name: string }) => n.name === "milestones");
  assert.equal(milestones.type, "directory");
  assert.ok(Array.isArray(milestones.children));
  assert.ok(milestones.children.length > 0);
});

// ─── Group 4: Files API — file content ───────────────────────────────
test("files API returns file content for valid path", async (t) => {
  const { root, gsdDir, cleanup } = makeGsdFixture();
  const origEnv = process.env.GSD_WEB_PROJECT_CWD;

  t.after(() => {
    process.env.GSD_WEB_PROJECT_CWD = origEnv;
    cleanup();
  });

  process.env.GSD_WEB_PROJECT_CWD = root;

  const fileContent = "# State\n\nCurrent milestone: M001";
  writeFileSync(join(gsdDir, "STATE.md"), fileContent);

  const request = new Request("http://localhost:3000/api/files?path=STATE.md");
  const response = await filesRoute.GET(request);
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.content, fileContent);
});

test("files API returns content for nested files", async (t) => {
  const { root, gsdDir, cleanup } = makeGsdFixture();
  const origEnv = process.env.GSD_WEB_PROJECT_CWD;

  t.after(() => {
    process.env.GSD_WEB_PROJECT_CWD = origEnv;
    cleanup();
  });

  process.env.GSD_WEB_PROJECT_CWD = root;

  const msDir = join(gsdDir, "milestones", "M001");
  mkdirSync(msDir, { recursive: true });
  writeFileSync(join(msDir, "M001-ROADMAP.md"), "# Roadmap content");

  const request = new Request(
    "http://localhost:3000/api/files?path=milestones/M001/M001-ROADMAP.md",
  );
  const response = await filesRoute.GET(request);
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.content, "# Roadmap content");
});

// ─── Group 5: Files API — security: path traversal rejection ─────────
test("files API rejects path traversal with ../", async (t) => {
  const { root, cleanup } = makeGsdFixture();
  const origEnv = process.env.GSD_WEB_PROJECT_CWD;

  t.after(() => {
    process.env.GSD_WEB_PROJECT_CWD = origEnv;
    cleanup();
  });

  process.env.GSD_WEB_PROJECT_CWD = root;

  const request = new Request(
    "http://localhost:3000/api/files?path=../etc/passwd",
  );
  const response = await filesRoute.GET(request);
  assert.equal(response.status, 400);

  const data = await response.json();
  assert.ok(data.error, "Expected error message in response");
});

test("files API rejects absolute paths", async (t) => {
  const { root, cleanup } = makeGsdFixture();
  const origEnv = process.env.GSD_WEB_PROJECT_CWD;

  t.after(() => {
    process.env.GSD_WEB_PROJECT_CWD = origEnv;
    cleanup();
  });

  process.env.GSD_WEB_PROJECT_CWD = root;

  const request = new Request(
    "http://localhost:3000/api/files?path=/etc/passwd",
  );
  const response = await filesRoute.GET(request);
  assert.equal(response.status, 400);

  const data = await response.json();
  assert.ok(data.error);
});

test("files API returns 404 for missing files", async (t) => {
  const { root, cleanup } = makeGsdFixture();
  const origEnv = process.env.GSD_WEB_PROJECT_CWD;

  t.after(() => {
    process.env.GSD_WEB_PROJECT_CWD = origEnv;
    cleanup();
  });

  process.env.GSD_WEB_PROJECT_CWD = root;

  const request = new Request(
    "http://localhost:3000/api/files?path=nonexistent.md",
  );
  const response = await filesRoute.GET(request);
  assert.equal(response.status, 404);

  const data = await response.json();
  assert.ok(data.error);
});

test("files API returns empty tree when .gsd/ does not exist", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gsd-state-surfaces-empty-"));
  const origEnv = process.env.GSD_WEB_PROJECT_CWD;

  t.after(() => {
    process.env.GSD_WEB_PROJECT_CWD = origEnv;
    rmSync(root, { recursive: true, force: true });
  });

  process.env.GSD_WEB_PROJECT_CWD = root;

  const request = new Request("http://localhost:3000/api/files");
  const response = await filesRoute.GET(request);
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.deepEqual(data.tree, []);
});

// ─── Group 6: Store-backed browser state surfaces ───────────────────

test("workspace store keeps extension status, widgets, title overrides, and editor prefills stateful", () => {
  const store = new GSDWorkspaceStore("/tmp/project") as any;
  store.patchState({
    statusTexts: { health: "All systems ready" },
    widgetContents: { health: { lines: ["ok"], placement: "belowEditor" } },
    titleOverride: "Release hardening",
    editorTextBuffer: "/gsd status",
    activeToolExecution: {
      id: "tool-1",
      name: "Bash",
      args: { command: "npm test" },
      startedAt: Date.now(),
    },
  });

  assert.equal(store.consumeEditorTextBuffer(), "/gsd status");
  assert.equal(store.consumeEditorTextBuffer(), null);

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.statusTexts.health, "All systems ready");
  assert.deepEqual(snapshot.widgetContents.health.lines, ["ok"]);
  assert.equal(snapshot.widgetContents.health.placement, "belowEditor");
  assert.equal(snapshot.titleOverride, "Release hardening");
  assert.equal(snapshot.activeToolExecution.name, "Bash");
});

test("live browser selectors prefer targeted live refresh data over boot seed data", () => {
  const store = new GSDWorkspaceStore("/tmp/project") as any;
  const snapshot = store.getSnapshot();
  const workspace = {
    milestones: [{ id: "M001", title: "Live milestone", slices: [] }],
    active: { phase: "active", milestoneId: "M001" },
    scopes: [],
    validationIssues: [],
  };
  const auto = {
    active: true,
    paused: false,
    stepMode: false,
    startTime: 1,
    elapsed: 2,
    currentUnit: { type: "task", id: "T01", startedAt: 1 },
    completedUnits: [],
    basePath: "/tmp/project",
    totalCost: 0,
    totalTokens: 0,
  };
  const session = {
    id: "session-1",
    path: "/tmp/session.jsonl",
    name: "Session 1",
    isActive: true,
  };

  store.patchState({
    live: {
      ...snapshot.live,
      workspace,
      auto,
      resumableSessions: [session],
    },
  });

  const next = store.getSnapshot();
  assert.equal(getLiveWorkspaceIndex(next), workspace);
  assert.equal(getLiveAutoDashboard(next), auto);
  assert.deepEqual(getLiveResumableSessions(next), [session]);
});

test("git and recovery command surfaces expose explicit pending and result state", () => {
  const {
    applyCommandSurfaceActionResult,
    createInitialCommandSurfaceState,
    openCommandSurfaceState,
    setCommandSurfacePending,
  } = commandSurface;

  const gitSurface = openCommandSurfaceState(createInitialCommandSurfaceState(), {
    surface: "git",
    source: "sidebar",
  });
  assert.equal(gitSurface.section, "git");

  const pendingGit = setCommandSurfacePending(gitSurface, "load_git_summary");
  assert.equal(pendingGit.pendingAction, "load_git_summary");
  assert.equal(pendingGit.gitSummary.pending, true);

  const loadedGit = applyCommandSurfaceActionResult(pendingGit, {
    action: "load_git_summary",
    success: true,
    message: "",
    gitSummary: {
      pending: false,
      loaded: true,
      result: {
        kind: "not_repo",
        project: {
          scope: "current_project",
          cwd: "/tmp/project",
          repoRoot: null,
          repoRelativePath: null,
        },
        message: "not inside a Git repository",
      },
      error: null,
    },
  });
  assert.equal(loadedGit.gitSummary.loaded, true);
  assert.equal(loadedGit.gitSummary.result?.kind, "not_repo");

  const pendingRecovery = setCommandSurfacePending(loadedGit, "load_recovery_diagnostics");
  assert.equal(pendingRecovery.pendingAction, "load_recovery_diagnostics");
  assert.equal(pendingRecovery.recovery.pending, true);
});

test("workflow action executor dispatches through the command pipeline before navigating", async (t) => {
  const previousWindow = (globalThis as any).window;
  const previousLocalStorage = (globalThis as any).localStorage;
  let dispatched = false;
  let navigatedTo: unknown = null;

  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  (globalThis as any).window = {
    dispatchEvent(event: CustomEvent) {
      navigatedTo = event.detail;
      return true;
    },
  };

  t.after(() => {
    (globalThis as any).window = previousWindow;
    (globalThis as any).localStorage = previousLocalStorage;
  });

  executeWorkflowActionInPowerMode({
    dispatch: async () => {
      dispatched = true;
    },
  });
  await new Promise((resolve) => queueMicrotask(resolve));

  assert.equal(dispatched, true);
  assert.deepEqual(navigatedTo, { view: "power" });
});
