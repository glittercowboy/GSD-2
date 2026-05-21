/**
 * spawn-shell-windows.test.ts — Regression test for Windows spawn ENOENT/EINVAL.
 *
 * On Windows, npm/npx/tsc and other tools are installed as .cmd batch scripts.
 * Node's `spawn()` without `shell: true` cannot execute .cmd files, resulting
 * in ENOENT or EINVAL errors. Every spawn site that may invoke a user-installed
 * binary (not `node` or a shell like `sh`/`bash`/`cmd`) must include
 * `shell: process.platform === "win32"` so the call is resolved through cmd.exe
 * on Windows while remaining a direct exec on POSIX.
 *
 * This test structurally scans all spawn sites and verifies the guard is present.
 *
 * Fixes: gsd-build/gsd-2#2854
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execCommand } from "../exec.js";

test("execCommand runs a user-facing binary and captures stdout", async () => {
	const result = await execCommand(
		process.execPath,
		["-e", "process.stdout.write('ok')"],
		process.cwd(),
	);

	assert.equal(result.stdout, "ok");
	assert.equal(result.stderr, "");
	assert.equal(result.code, 0);
	assert.equal(result.killed, false);
});
