// GSD-2 + packages/pi-tui/src/__tests__/tui.test.ts - Regression coverage for the TUI renderer and container lifecycle.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import { Container, CURSOR_MARKER, pruneDebugRenderLogs, TUI } from "../tui.js";
import type { Component } from "../tui.js";
import type { Terminal } from "../terminal.js";

function makeTerminal(writes?: string[], rows = 24): Terminal {
	return {
		isTTY: true,
		columns: 80,
		rows,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		drainInput: async () => {},
		write(data: string) {
			writes?.push(data);
		},
		moveBy() {},
		hideCursor() {},
		showCursor() {},
		clearLine() {},
		clearFromCursor() {},
		clearScreen() {},
		setTitle() {},
	};
}

// TUI clearOnShrink debounce — tests removed in #4794 (ref #4784).
//
// The previous tests mutated private fields (`_shrinkDebounceActive`,
// `maxLinesRendered`) and then asserted the values they just wrote —
// pure tautologies that never exercised the real debounce path in
// `renderNow()` (tui.ts:734-754). A regression that narrowed the
// condition, reversed the flag flip, or dropped the "keep
// maxLinesRendered" rule would have passed all of them.
//
// A proper test would (a) render a component that produces N lines to
// establish `maxLinesRendered`, (b) swap in a component that produces
// N-k lines to trigger the shrink branch, and (c) observe terminal
// writes to confirm the debounce defers/commits the full redraw on the
// expected render call.
//
// That test setup requires exposing enough of the render path (or
// extracting the debounce decision into a pure helper) — deferred to a
// separate refactor PR rather than shipping a tautology. See #4794.

describe("TUI", () => {
	it("updates an editor line from the real hardware cursor row", () => {
		const writes: string[] = [];
		const terminal = makeTerminal(writes);
		let value = "input";
		const tui = new TUI(terminal);
		tui.addChild({
			render: () => ["top", `${value}${CURSOR_MARKER}`, "  GSD  No project loaded - run /gsd to start"],
			invalidate() {},
		});
		const anyTui = tui as any;

		anyTui.doRender();
		const writeCountAfterFirstRender = writes.length;

		value = "input x";
		anyTui.doRender();

		const renderWrite = writes[writeCountAfterFirstRender];
		const withoutSyncWrapper = renderWrite.replace(/^\x1b\[\?2026h/, "");
		assert.ok(withoutSyncWrapper.startsWith("\r"), "editor diff should start at the current cursor row");
		assert.ok(!withoutSyncWrapper.startsWith("\x1b[1A\r"), "editor diff must not move above the cursor row");
	});

	it("redraws to erase a dismissed overlay even when base output is unchanged", () => {
		// Regression: doRender() short-circuits when component output is
		// byte-identical to the previous frame. If the previous frame drew an
		// overlay, an identical next frame with no overlay must still redraw —
		// otherwise the dismissed overlay is never erased from the screen.
		const writes: string[] = [];
		const tui = new TUI(makeTerminal(writes));
		tui.addChild({ render: () => ["base line one", "base line two"], invalidate() {} });
		const anyTui = tui as any;

		anyTui.doRender();
		const overlay = tui.showOverlay({ render: () => ["OVERLAY"], invalidate() {} });
		anyTui.doRender();
		const writesBeforeHide = writes.length;

		overlay.hide();
		anyTui.doRender();

		assert.ok(
			writes.length > writesBeforeHide,
			"dismissing an overlay must trigger a redraw to erase it, even when the base component output is byte-identical",
		);
	});

	it("redraws on terminal resize even when component output is unchanged", () => {
		// Image protocol lines are intentionally skipped by applyLineResets(),
		// so they preserve the container's cached array reference. A stable
		// reference must not skip frame-state work like terminal resize handling.
		const writes: string[] = [];
		const terminal = makeTerminal(writes);
		const tui = new TUI(terminal);
		tui.addChild({ render: () => ["\x1b_Gimage-payload\x1b\\"], invalidate() {} });
		const anyTui = tui as any;

		anyTui.doRender();
		const writesBeforeResize = writes.length;

		Object.defineProperty(terminal, "columns", { configurable: true, value: 100 });
		anyTui.doRender();

		const resizeWrites = writes.slice(writesBeforeResize).join("");
		assert.ok(
			resizeWrites.includes("\x1b[2J"),
			"resize must force a full redraw even when the component render array is cached",
		);
	});

	it("omits synchronized-output wrappers when PI_DISABLE_SYNC_OUTPUT is enabled", () => {
		const previous = process.env.PI_DISABLE_SYNC_OUTPUT;
		process.env.PI_DISABLE_SYNC_OUTPUT = "1";
		try {
			const writes: string[] = [];
			const tui = new TUI(makeTerminal(writes));
			tui.addChild({
				render: () => ["content"],
				invalidate() {},
			});

			(tui as any).doRender();

			const rendered = writes.join("");
			assert.ok(rendered.includes("content"), "render should still write component output");
			assert.ok(
				!rendered.includes("\x1b[?2026h") && !rendered.includes("\x1b[?2026l"),
				"PI_DISABLE_SYNC_OUTPUT=1 must suppress synchronized-output escape sequences",
			);
		} finally {
			if (previous === undefined) {
				delete process.env.PI_DISABLE_SYNC_OUTPUT;
			} else {
				process.env.PI_DISABLE_SYNC_OUTPUT = previous;
			}
		}
	});

	it("does not full-clear when a tall buffer shrinks (flicker regression #6130)", () => {
		// Tall-buffer-shrink path: both prev and new exceed viewport height. The fix
		// falls through to differential render instead of emitting \x1b[2J, which used
		// to cause the bottom panel to flash on every shrink.
		const writes: string[] = [];
		const terminal = makeTerminal(writes, 10);
		const tui = new TUI(terminal);
		let lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
		tui.addChild({
			render: () => lines,
			invalidate() {},
		});
		const anyTui = tui as any;

		anyTui.doRender();
		const writeCountAfterFirstRender = writes.length;

		// Shrink: still taller than viewport, but smaller than before.
		lines = Array.from({ length: 15 }, (_, i) => `line-${i}`);
		anyTui.doRender();

		const shrinkWrites = writes.slice(writeCountAfterFirstRender).join("");
		assert.ok(
			!shrinkWrites.includes("\x1b[2J"),
			"tall buffer shrink must not emit \\x1b[2J — that causes the bottom panel to flash",
		);
	});

	it("does not full-clear when firstChanged is above the viewport (flicker regression #6130)", () => {
		// firstChanged-above-viewport path: a line above the current viewport changes.
		// The fix clamps firstChanged to the viewport top and repaints in place instead
		// of emitting \x1b[2J + full repaint, which used to cause a bottom-panel flash.
		const writes: string[] = [];
		const terminal = makeTerminal(writes, 10);
		const tui = new TUI(terminal);
		let lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
		tui.addChild({
			render: () => lines,
			invalidate() {},
		});
		const anyTui = tui as any;

		anyTui.doRender();
		const writeCountAfterFirstRender = writes.length;

		// Change a line above the viewport (viewportTop = 20 - 10 = 10, so line 0 is above).
		lines = lines.slice();
		lines[0] = "changed-above-viewport";
		anyTui.doRender();

		const clampWrites = writes.slice(writeCountAfterFirstRender).join("");
		assert.ok(
			!clampWrites.includes("\x1b[2J"),
			"firstChanged-above-viewport must not emit \\x1b[2J — that causes the bottom panel to flash",
		);
	});

	it("does not swallow a bare Escape keypress while waiting for the cell-size response", () => {
		const tui = new TUI(makeTerminal());
		const received: string[] = [];

		tui.setFocus({
			render: () => [],
			handleInput: (data: string) => {
				received.push(data);
			},
			invalidate() {},
		});

		const anyTui = tui as any;
		anyTui.cellSizeQueryPending = true;
		anyTui.inputBuffer = "";

		anyTui.handleInput("\x1b");

		assert.deepEqual(received, ["\x1b"]);
		assert.equal(anyTui.cellSizeQueryPending, false);
		assert.equal(anyTui.inputBuffer, "");
	});

	it("keeps only the newest TUI debug render logs", () => {
		const debugDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tui-debug-"));
		try {
			for (let i = 0; i < 5; i++) {
				const filePath = path.join(debugDir, `render-${i}-debug.log`);
				fs.writeFileSync(filePath, `debug ${i}`);
				const time = new Date(1_700_000_000_000 + i * 1000);
				fs.utimesSync(filePath, time, time);
			}
			fs.writeFileSync(path.join(debugDir, "keep-me.log"), "unrelated");

			pruneDebugRenderLogs(debugDir, 3);

			const remaining = fs.readdirSync(debugDir).sort();
			assert.deepEqual(remaining, [
				"keep-me.log",
				"render-2-debug.log",
				"render-3-debug.log",
				"render-4-debug.log",
			]);
		} finally {
			fs.rmSync(debugDir, { recursive: true, force: true });
		}
	});
});

describe("Container", () => {
	function makeDisposableChild(counter: { disposed: number }): Component & { dispose(): void } {
		return {
			render: () => [],
			invalidate() {},
			dispose() {
				counter.disposed++;
			},
		};
	}

	it("detachChildren() removes children without disposing them", () => {
		const c = new Container();
		const counter = { disposed: 0 };
		c.addChild(makeDisposableChild(counter));
		c.addChild(makeDisposableChild(counter));

		c.detachChildren();

		assert.equal(c.children.length, 0);
		assert.equal(counter.disposed, 0);
	});

	it("clear() still disposes children (regression guard for detach/dispose split)", () => {
		const c = new Container();
		const counter = { disposed: 0 };
		c.addChild(makeDisposableChild(counter));
		c.addChild(makeDisposableChild(counter));

		c.clear();

		assert.equal(c.children.length, 0);
		assert.equal(counter.disposed, 2);
	});

	it("invalidate() clears the cached render reference even when child output is unchanged", () => {
		const c = new Container();
		let invalidateCount = 0;
		c.addChild({
			render: () => ["same"],
			invalidate() {
				invalidateCount++;
			},
		});

		const first = c.render(80);
		const stable = c.render(80);
		assert.equal(stable, first, "unchanged output should reuse the cached render reference before invalidation");

		c.invalidate();
		const afterInvalidate = c.render(80);

		assert.equal(invalidateCount, 1);
		assert.notEqual(afterInvalidate, first, "invalidate must force a fresh render reference for the TUI frame pipeline");
		assert.deepEqual(afterInvalidate, ["same"]);
	});

	it("warns in PI_TUI_DEBUG when a child render line exceeds the requested width", () => {
		const previousDebug = process.env.PI_TUI_DEBUG;
		const previousWarn = console.warn;
		const warnings: string[] = [];
		class WideComponent implements Component {
			render(): string[] {
				return ["too wide"];
			}

			invalidate(): void {}
		}

		process.env.PI_TUI_DEBUG = "1";
		console.warn = (message?: unknown) => {
			warnings.push(String(message));
		};
		try {
			const c = new Container();
			c.addChild(new WideComponent());

			assert.deepEqual(c.render(3), ["too wide"]);
			assert.deepEqual(warnings, [
				"[pi-tui] WideComponent.render() line 1 exceeds width 3 (visible width 8)",
			]);
		} finally {
			console.warn = previousWarn;
			if (previousDebug === undefined) {
				delete process.env.PI_TUI_DEBUG;
			} else {
				process.env.PI_TUI_DEBUG = previousDebug;
			}
		}
	});

	it("does not warn about render width overflow outside PI_TUI_DEBUG", () => {
		const previousDebug = process.env.PI_TUI_DEBUG;
		const previousWarn = console.warn;
		const warnings: string[] = [];

		delete process.env.PI_TUI_DEBUG;
		console.warn = (message?: unknown) => {
			warnings.push(String(message));
		};
		try {
			const c = new Container();
			c.addChild({
				render: () => ["too wide"],
				invalidate() {},
			});

			assert.deepEqual(c.render(3), ["too wide"]);
			assert.deepEqual(warnings, []);
		} finally {
			console.warn = previousWarn;
			if (previousDebug === undefined) {
				delete process.env.PI_TUI_DEBUG;
			} else {
				process.env.PI_TUI_DEBUG = previousDebug;
			}
		}
	});
});
