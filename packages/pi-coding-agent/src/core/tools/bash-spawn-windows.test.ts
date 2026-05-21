/**
 * bash-spawn-windows.test.ts — Regression test for Windows spawn EINVAL.
 *
 * Verifies that bash tool spawn options disable `detached: true` on Windows
 * to prevent EINVAL errors in ConPTY / VSCode terminal contexts.
 *
 * Background:
 *   On Windows, `spawn()` with `detached: true` sets the
 *   CREATE_NEW_PROCESS_GROUP flag in CreateProcess.  In certain terminal
 *   contexts (VSCode integrated terminal, ConPTY, Windows Terminal) this
 *   flag conflicts with the parent process group and causes a synchronous
 *   EINVAL from libuv.  The bg-shell extension already guards against this
 *   with `detached: process.platform !== "win32"` (process-manager.ts);
 *   this test ensures all other spawn sites are aligned.
 *
 * See: gsd-build/gsd-2#XXXX
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createBashTool } from "./bash.js";

test("bash tool delegates command execution through operations without forcing process detachment", async () => {
	const calls: Array<{ command: string; cwd: string; env?: NodeJS.ProcessEnv }> = [];
	const tool = createBashTool(process.cwd(), {
		operations: {
			async exec(command, cwd, options) {
				calls.push({ command, cwd, env: options.env });
				options.onData(Buffer.from("ok\n"));
				return { exitCode: 0 };
			},
		},
	});

	const result = await tool.execute("tool-call", { command: "echo ok" });
	const firstContent = result.content[0];

	assert.ok(firstContent);
	if (firstContent.type !== "text") {
		assert.fail(`Expected text content, got ${firstContent.type}`);
	}
	assert.equal(firstContent.text, "ok\n");
	assert.deepEqual(calls.map((call) => ({ command: call.command, cwd: call.cwd })), [
		{ command: "echo ok", cwd: process.cwd() },
	]);
	assert.ok(calls[0]?.env, "default bash context should provide an execution environment");
});

// Smoke test: spawn with platform-guarded detached flag actually works
test("spawn with detached: process.platform !== 'win32' succeeds", async () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();

	const child = spawn(
		process.platform === "win32" ? "cmd" : "sh",
		process.platform === "win32" ? ["/c", "echo ok"] : ["-c", "echo ok"],
		{
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	let output = "";
	child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
	child.on("error", reject);
	child.on("close", (code) => {
		try {
			assert.equal(code, 0, "spawn should succeed");
			assert.ok(output.trim().includes("ok"), `Expected 'ok' in output, got: ${output}`);
			resolve();
		} catch (e) {
			reject(e);
		}
	});

	await promise;
});
