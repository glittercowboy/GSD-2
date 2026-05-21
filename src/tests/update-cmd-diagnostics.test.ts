/**
 * Regression test for #3445: gsd update must print both current and latest
 * versions for diagnostics, and bypass npm cache.
 * Regression test for #4145: gsd update must use bun when installed via Bun.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { runUpdate } from "../update-cmd.ts";
import { handleUpdate } from "../resources/extensions/gsd/commands-handlers.ts";

test("update-cmd prints latest version before comparison (#3445)", async () => {
  const originalFetch = globalThis.fetch;
  const originalVersion = process.env.GSD_VERSION;
  const originalStdoutWrite = process.stdout.write;
  const writes: string[] = [];

  try {
    process.env.GSD_VERSION = "1.2.3";
    globalThis.fetch = async () => Response.json({ version: "1.2.3" });
    (process.stdout as any).write = (chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    };

    await runUpdate();
  } finally {
    globalThis.fetch = originalFetch;
    (process.stdout as any).write = originalStdoutWrite;
    if (originalVersion === undefined) {
      delete process.env.GSD_VERSION;
    } else {
      process.env.GSD_VERSION = originalVersion;
    }
  }

  const output = writes.join("");
  const latestPrintIdx = output.indexOf("Latest version:");
  const comparisonIdx = output.indexOf("Already up to date.");
  assert.ok(latestPrintIdx !== -1, "Must print latest version");
  assert.ok(latestPrintIdx < comparisonIdx, "Must print latest BEFORE comparison result");
});

test("update-check exports resolveInstallCommand (#4145)", async () => {
  const { resolveInstallCommand } = await import("../update-check.js");
  assert.equal(typeof resolveInstallCommand, "function", "resolveInstallCommand must be exported from update-check");
});

test("resolveInstallCommand returns bun command when running under Bun (#4145)", async () => {
  const { resolveInstallCommand } = await import("../update-check.js");
  const orig = (process.versions as Record<string, string | undefined>).bun;
  try {
    (process.versions as Record<string, string | undefined>).bun = "1.0.0";
    assert.equal(resolveInstallCommand("gsd-pi@latest"), "bun add -g gsd-pi@latest");
  } finally {
    if (orig === undefined) {
      delete (process.versions as Record<string, string | undefined>).bun;
    } else {
      (process.versions as Record<string, string | undefined>).bun = orig;
    }
  }
});

test("resolveInstallCommand returns npm command when not running under Bun (#4145)", async () => {
  const { resolveInstallCommand } = await import("../update-check.js");
  const orig = (process.versions as Record<string, string | undefined>).bun;
  try {
    delete (process.versions as Record<string, string | undefined>).bun;
    assert.equal(resolveInstallCommand("gsd-pi@latest"), "npm install -g gsd-pi@latest");
  } finally {
    if (orig !== undefined) {
      (process.versions as Record<string, string | undefined>).bun = orig;
    }
  }
});

test("/gsd update handler fetches latest version through the registry endpoint (#3806)", async () => {
  const originalFetch = globalThis.fetch;
  const originalVersion = process.env.GSD_VERSION;
  const fetchUrls: string[] = [];
  const notifications: Array<{ message: string; level: string }> = [];

  try {
    process.env.GSD_VERSION = "1.2.3";
    globalThis.fetch = async (input) => {
      fetchUrls.push(String(input));
      return Response.json({ version: "1.2.3" });
    };

    await handleUpdate({
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    } as any);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalVersion === undefined) {
      delete process.env.GSD_VERSION;
    } else {
      process.env.GSD_VERSION = originalVersion;
    }
  }

  assert.deepEqual(fetchUrls, ["https://registry.npmjs.org/gsd-pi/latest"]);
  assert.ok(notifications.some((notification) => notification.message.includes("Already up to date")));
});

test("isBunInstall detects bun install via argv[1] even when process.versions.bun is undefined (#4145)", async () => {
  const { isBunInstall } = await import("../update-check.js");
  const orig = (process.versions as Record<string, string | undefined>).bun;
  const origArgv1 = process.argv[1];
  const origBunInstall = process.env.BUN_INSTALL;
  try {
    // Simulate running under Node (not Bun) — matches the real-world shim case
    // where the bun-installed symlink's target has #!/usr/bin/env node.
    delete (process.versions as Record<string, string | undefined>).bun;
    delete process.env.BUN_INSTALL;

    // argv[1] preserves the unresolved symlink path, not the realpath target.
    process.argv[1] = join(process.env.HOME ?? "/home/user", ".bun", "bin", "gsd");
    assert.equal(isBunInstall(), true, "should detect bun install from ~/.bun/bin/ argv[1]");

    // Custom BUN_INSTALL location
    process.env.BUN_INSTALL = "/opt/bun";
    process.argv[1] = "/opt/bun/bin/gsd";
    assert.equal(isBunInstall(), true, "should detect bun install from $BUN_INSTALL/bin/ argv[1]");

    // Non-bun path must NOT match
    delete process.env.BUN_INSTALL;
    process.argv[1] = "/usr/local/lib/node_modules/gsd-pi/dist/loader.js";
    assert.equal(isBunInstall(), false, "npm global install path should not match");

    // Prefix false-positive guard: /.bun/bin-other should not match /.bun/bin
    process.argv[1] = join(process.env.HOME ?? "/home/user", ".bun", "bin-other", "gsd");
    assert.equal(isBunInstall(), false, "sibling dir with bin prefix should not match");
  } finally {
    if (orig === undefined) {
      delete (process.versions as Record<string, string | undefined>).bun;
    } else {
      (process.versions as Record<string, string | undefined>).bun = orig;
    }
    process.argv[1] = origArgv1;
    if (origBunInstall === undefined) {
      delete process.env.BUN_INSTALL;
    } else {
      process.env.BUN_INSTALL = origBunInstall;
    }
  }
});

test("isBunInstall returns true when running under Bun runtime (#4145)", async () => {
  const { isBunInstall } = await import("../update-check.js");
  const orig = (process.versions as Record<string, string | undefined>).bun;
  const origArgv1 = process.argv[1];
  try {
    (process.versions as Record<string, string | undefined>).bun = "1.0.0";
    // Even with a non-bun argv[1], runtime detection wins
    process.argv[1] = "/usr/local/lib/node_modules/gsd-pi/dist/loader.js";
    assert.equal(isBunInstall(), true);
  } finally {
    if (orig === undefined) {
      delete (process.versions as Record<string, string | undefined>).bun;
    } else {
      (process.versions as Record<string, string | undefined>).bun = orig;
    }
    process.argv[1] = origArgv1;
  }
});
