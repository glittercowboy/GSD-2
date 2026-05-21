import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";

import { ProcessTerminal } from "../terminal.js";

function replaceProcessProperty(
	t: TestContext,
	target: object,
	key: string,
	value: unknown
): void {
	const descriptor = Object.getOwnPropertyDescriptor(target, key);
	Object.defineProperty(target, key, {
		configurable: true,
		writable: true,
		value,
	});
	t.after(() => {
		if (descriptor) {
			Object.defineProperty(target, key, descriptor);
			return;
		}
		delete (target as Record<string, unknown>)[key];
	});
}

describe("ProcessTerminal", () => {
	it("restores terminal state when the process exits without an explicit stop", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });

		const writes: string[] = [];
		const rawModes: boolean[] = [];
		const resizeHandlers = new Set<(...args: unknown[]) => void>();
		const stdinHandlers = new Set<(data: string) => void>();
		let resumed = false;
		let paused = false;
		let encoding = "";
		let sigwinchSent = false;

		replaceProcessProperty(t, process.stdout, "isTTY", true);
		replaceProcessProperty(t, process.stdout, "write", (data: string) => {
			writes.push(data);
			return true;
		});
		replaceProcessProperty(t, process.stdout, "on", (event: string, handler: (...args: unknown[]) => void) => {
			if (event === "resize") resizeHandlers.add(handler);
			return process.stdout;
		});
		replaceProcessProperty(
			t,
			process.stdout,
			"removeListener",
			(event: string, handler: (...args: unknown[]) => void) => {
				if (event === "resize") resizeHandlers.delete(handler);
				return process.stdout;
			}
		);

		replaceProcessProperty(t, process.stdin, "isRaw", false);
		replaceProcessProperty(t, process.stdin, "setRawMode", (enabled: boolean) => {
			rawModes.push(enabled);
			return process.stdin;
		});
		replaceProcessProperty(t, process.stdin, "setEncoding", (nextEncoding: BufferEncoding) => {
			encoding = nextEncoding;
			return process.stdin;
		});
		replaceProcessProperty(t, process.stdin, "resume", () => {
			resumed = true;
			return process.stdin;
		});
		replaceProcessProperty(t, process.stdin, "pause", () => {
			paused = true;
			return process.stdin;
		});
		replaceProcessProperty(t, process.stdin, "on", (event: string, handler: (data: string) => void) => {
			if (event === "data") stdinHandlers.add(handler);
			return process.stdin;
		});
		replaceProcessProperty(t, process.stdin, "removeListener", (event: string, handler: (data: string) => void) => {
			if (event === "data") stdinHandlers.delete(handler);
			return process.stdin;
		});
		replaceProcessProperty(t, process, "kill", (pid: number, signal?: NodeJS.Signals | number) => {
			assert.equal(pid, process.pid);
			assert.equal(signal, "SIGWINCH");
			sigwinchSent = true;
			return true;
		});

		const terminal = new ProcessTerminal();
		const exitListenersBeforeStart = process.listeners("exit");

		terminal.start(() => {}, () => {});

		const processExitHandler = process
			.listeners("exit")
			.find((listener) => !exitListenersBeforeStart.includes(listener));
		assert.ok(processExitHandler);
		assert.deepEqual(rawModes, [true]);
		assert.equal(encoding, "utf8");
		assert.equal(resumed, true);
		assert.equal(sigwinchSent, process.platform !== "win32");
		assert.equal(resizeHandlers.size, 1);
		assert.equal(stdinHandlers.size, 1);
		assert.deepEqual(writes, ["\x1b[?2004h", "\x1b[?u"]);

		processExitHandler(0);

		assert.deepEqual(rawModes, [true, false]);
		assert.equal(paused, true);
		assert.equal(resizeHandlers.size, 0);
		assert.equal(stdinHandlers.size, 0);
		assert.equal(process.listeners("exit").includes(processExitHandler), false);
		assert.deepEqual(writes, ["\x1b[?2004h", "\x1b[?u", "\x1b[?2004l"]);

		terminal.stop();

		assert.deepEqual(writes, ["\x1b[?2004h", "\x1b[?u", "\x1b[?2004l"]);
	});
});
