// Project/App: GSD-2
// File Purpose: Behavior tests for auto-mode project-root environment cleanup.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cleanupAfterLoopExit,
  _captureProjectRootEnvForTest,
  _restoreProjectRootEnvForTest,
} from "../auto.ts";
import { autoSession } from "../auto-runtime-state.ts";

test.afterEach(() => {
  _restoreProjectRootEnvForTest();
});

test("auto-mode project-root env capture sets GSD_PROJECT_ROOT and restores an existing value", () => {
  process.env.GSD_PROJECT_ROOT = "/before";

  _captureProjectRootEnvForTest("/project");
  assert.equal(process.env.GSD_PROJECT_ROOT, "/project");

  _restoreProjectRootEnvForTest();
  assert.equal(process.env.GSD_PROJECT_ROOT, "/before");
  delete process.env.GSD_PROJECT_ROOT;
});

test("auto-mode project-root env restore deletes GSD_PROJECT_ROOT when it was initially absent", () => {
  delete process.env.GSD_PROJECT_ROOT;

  _captureProjectRootEnvForTest("/project");
  assert.equal(process.env.GSD_PROJECT_ROOT, "/project");

  _restoreProjectRootEnvForTest();
  assert.equal(process.env.GSD_PROJECT_ROOT, undefined);
});

test("cleanupAfterLoopExit restores captured GSD_PROJECT_ROOT", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-project-root-env-"));
  const previousCwd = process.cwd();
  const previousProjectRoot = process.env.GSD_PROJECT_ROOT;

  autoSession.reset();
  autoSession.active = true;
  autoSession.basePath = join(base, ".gsd", "worktrees", "M001");
  autoSession.originalBasePath = base;
  autoSession.projectRootEnvCaptured = true;
  autoSession.hadProjectRootEnv = true;
  autoSession.previousProjectRootEnv = "/previous/project";
  process.env.GSD_PROJECT_ROOT = base;

  try {
    await cleanupAfterLoopExit({
      ui: {
        setStatus: () => {},
        setWidget: () => {},
        notify: () => {},
      },
    } as any);

    assert.equal(process.env.GSD_PROJECT_ROOT, "/previous/project");
    assert.equal(autoSession.projectRootEnvCaptured, false);
    assert.equal(autoSession.previousProjectRootEnv, null);
  } finally {
    autoSession.reset();
    process.chdir(previousCwd);
    if (previousProjectRoot === undefined) delete process.env.GSD_PROJECT_ROOT;
    else process.env.GSD_PROJECT_ROOT = previousProjectRoot;
    rmSync(base, { recursive: true, force: true });
  }
});
