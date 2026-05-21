// GSD2 — Regression test: auto-mode resume resolves resource-loader.js from deployed path (#3949)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { applyLoaderCliEntrypointEnv, resolveLoaderCliEntrypoint } from "../loader-entrypoint.ts";

const devCli = await import("../../scripts/dev-cli-helpers.mjs");

test("source dev CLI remains the child-process GSD_BIN_PATH", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gsd-loader-entrypoint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const invokedLoader = join(root, "src", "loader.ts");
  const devCliPath = join(root, "scripts", "dev-cli.js");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(devCliPath, "#!/usr/bin/env node\n");

  assert.equal(
    resolveLoaderCliEntrypoint({ gsdRoot: root, invokedBinPath: invokedLoader, existsSync }),
    resolve(devCliPath),
  );
});

test("explicit CLI path overrides the invoked source loader path", () => {
  const env = { GSD_CLI_PATH: "/custom/gsd" } as NodeJS.ProcessEnv;
  const resolved = applyLoaderCliEntrypointEnv(env, {
    gsdRoot: "/repo",
    invokedBinPath: "/repo/src/loader.ts",
    existsSync: () => true,
  });

  assert.equal(resolved, resolve("/custom/gsd"));
  assert.equal(env.GSD_BIN_PATH, resolve("/custom/gsd"));
  assert.equal(env.GSD_CLI_PATH, "/custom/gsd");
});

test("dev CLI wrapper passes itself as every child-process CLI entrypoint", () => {
  const env = devCli.buildDevCliChildEnv({ PATH: "/usr/bin" }, "/repo/scripts/dev-cli.js");
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.GSD_DEV_CLI_PATH, "/repo/scripts/dev-cli.js");
  assert.equal(env.GSD_CLI_PATH, "/repo/scripts/dev-cli.js");
  assert.equal(env.GSD_BIN_PATH, "/repo/scripts/dev-cli.js");

  assert.deepEqual(
    devCli.buildDevCliSpawnArgs({
      resolveTsPath: "/repo/src/resources/extensions/gsd/tests/resolve-ts.mjs",
      srcLoaderPath: "/repo/src/loader.ts",
      argv: ["--web"],
    }),
    [
      "--import",
      "/repo/src/resources/extensions/gsd/tests/resolve-ts.mjs",
      "--experimental-strip-types",
      "/repo/src/loader.ts",
      "--web",
    ],
  );
});

test("GSD_PKG_ROOT still resolves the deployed resource-loader location", () => {
  const pkgRoot = process.cwd();
  const resourceLoaderPath = join(pkgRoot, "dist", "resource-loader.js");
  assert.equal(resourceLoaderPath, join(pkgRoot, "dist", "resource-loader.js"));
});
