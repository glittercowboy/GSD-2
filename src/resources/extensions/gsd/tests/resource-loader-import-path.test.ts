// GSD2 — Regression test for deployed resource-loader resolution behavior

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { refreshResumeResourcesAndDb } from "../auto.ts";

describe("resource-loader import path", () => {
  test("refreshResumeResourcesAndDb resolves resource-loader from GSD_PKG_ROOT", async () => {
    const pkgRoot = "/tmp/gsd-pkg-root";
    const agentDir = "/tmp/gsd-agent";
    const basePath = "/tmp/project-root";
    const imports: string[] = [];
    const initializedDirs: string[] = [];
    const openedProjectRoots: string[] = [];
    let primed = false;

    await refreshResumeResourcesAndDb(basePath, {
      env: {
        GSD_PKG_ROOT: pkgRoot,
        GSD_CODING_AGENT_DIR: agentDir,
      } as NodeJS.ProcessEnv,
      importModule: async (specifier: string) => {
        imports.push(specifier);
        if (specifier.endsWith("resource-loader.js")) {
          return {
            initResources: (dir: string) => initializedDirs.push(dir),
          };
        }
        if (specifier === "./prompt-loader.js") {
          return {
            primeCache: () => {
              primed = true;
            },
          };
        }
        throw new Error(`Unexpected import ${specifier}`);
      },
      openProjectDb: async (projectRoot: string) => {
        openedProjectRoots.push(projectRoot);
      },
    });

    assert.equal(imports[0], pathToFileURL(join(pkgRoot, "dist", "resource-loader.js")).href);
    assert.deepEqual(initializedDirs, [agentDir]);
    assert.equal(primed, true);
    assert.deepEqual(openedProjectRoots, [basePath]);
  });
});
