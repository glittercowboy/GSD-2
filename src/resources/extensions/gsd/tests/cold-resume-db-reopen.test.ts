/**
 * cold-resume-db-reopen.test.ts — Regression test for #2940.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { refreshResumeResourcesAndDb } from "../auto.ts";

test("resume refreshes managed resources and opens DB before state rebuild", async () => {
  const calls: string[] = [];

  await refreshResumeResourcesAndDb("/tmp/project", {
    env: {
      GSD_CODING_AGENT_DIR: "/tmp/agent",
      GSD_PKG_ROOT: "/tmp/pkg",
    } as NodeJS.ProcessEnv,
    importModule: async (specifier: string) => {
      calls.push(`import:${specifier}`);
      if (specifier.endsWith("/dist/resource-loader.js")) {
        return {
          initResources: (agentDir: string) => calls.push(`initResources:${agentDir}`),
        };
      }
      if (specifier === "./prompt-loader.js") {
        return {
          primeCache: () => calls.push("primeCache"),
        };
      }
      throw new Error(`unexpected import: ${specifier}`);
    },
    openProjectDb: async (basePath: string) => {
      calls.push(`openDb:${basePath}`);
    },
  });

  assert.deepEqual(calls, [
    "import:file:///tmp/pkg/dist/resource-loader.js",
    "initResources:/tmp/agent",
    "import:./prompt-loader.js",
    "primeCache",
    "openDb:/tmp/project",
  ]);
});
