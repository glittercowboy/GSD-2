import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ActivityManager } from "../../packages/pi-coding-agent/src/core/activity-manager.ts";

describe("ActivityManager", () => {
	it("enforces non-empty owner", () => {
		const manager = new ActivityManager();
		assert.throws(() => manager.start({ owner: "", lane: "status" }), /owner/i);
	});

	it("status lane is stacked (LIFO visible activity)", () => {
		const manager = new ActivityManager();
		const outer = manager.start({ owner: "test.outer", lane: "status", message: "Outer" });
		const inner = manager.start({ owner: "test.inner", lane: "status", message: "Inner" });

		assert.equal(manager.getVisible("status")?.message, "Inner");
		inner.stop();
		assert.equal(manager.getVisible("status")?.message, "Outer");
		outer.stop();
		assert.equal(manager.getVisible("status"), undefined);
	});

	it("modal lane is exclusive", () => {
		const manager = new ActivityManager();
		const first = manager.start({ owner: "test.first", lane: "modal", message: "First" });
		const second = manager.start({ owner: "test.second", lane: "modal", message: "Second" });

		assert.equal(first.isActive(), false);
		assert.equal(second.isActive(), true);
		assert.equal(manager.getVisible("modal")?.message, "Second");
	});

	it("keyed lanes replace by key", () => {
		const manager = new ActivityManager();
		const first = manager.start({ owner: "test.inline.one", lane: "inline", key: "bash:1", message: "A" });
		const second = manager.start({ owner: "test.inline.two", lane: "inline", key: "bash:1", message: "B" });
		const third = manager.start({ owner: "test.inline.three", lane: "inline", key: "bash:2", message: "C" });

		assert.equal(first.isActive(), false);
		assert.equal(second.isActive(), true);
		assert.equal(third.isActive(), true);
		assert.deepEqual(
			manager.getLaneActivities("inline").map((activity) => activity.message),
			["B", "C"],
		);
	});

	it("clearByOwner stops only that owner's activities", () => {
		const manager = new ActivityManager();
		const one = manager.start({ owner: "owner.a", lane: "status", message: "A" });
		const two = manager.start({ owner: "owner.b", lane: "status", message: "B" });
		const three = manager.start({ owner: "owner.a", lane: "inline", key: "x", message: "C" });

		manager.clearByOwner("owner.a");
		assert.equal(one.isActive(), false);
		assert.equal(three.isActive(), false);
		assert.equal(two.isActive(), true);
		assert.equal(manager.getVisible("status")?.message, "B");
	});

	it("run() emits result and cleans up on error", async () => {
		const manager = new ActivityManager();
		const events: string[] = [];
		manager.subscribe((event) => events.push(event.type));

		await assert.rejects(
			manager.run(
				async () => {
					throw new Error("boom");
				},
				{ owner: "test.run.error", lane: "status", message: "Running..." },
			),
			{ message: "boom" },
		);

		assert.equal(manager.getVisible("status"), undefined);
		assert.deepEqual(events.filter((type) => type === "result" || type === "stop"), ["result", "stop"]);
	});

	it("provides deterministic spinner frames", () => {
		const manager = new ActivityManager();
		assert.equal(manager.getSpinnerFrame(0), "⠋");
		assert.equal(manager.getSpinnerFrame(1), "⠙");
		assert.equal(manager.getSpinnerFrame(9), "⠏");
		assert.equal(manager.getSpinnerFrame(10), "⠋");
		assert.equal(manager.getSpinnerFrame(-1), "⠋");
	});

	it("shared clock ticks and unsubscribes cleanly", async () => {
		const manager = new ActivityManager();
		const ticks: number[] = [];
		const unsubscribe = manager.subscribeClock(10, (tick) => {
			ticks.push(tick);
		});
		await new Promise((resolve) => setTimeout(resolve, 45));
		unsubscribe();
		const countAfterUnsubscribe = ticks.length;
		await new Promise((resolve) => setTimeout(resolve, 35));

		assert.ok(countAfterUnsubscribe >= 2, `expected >=2 ticks, got ${countAfterUnsubscribe}`);
		assert.equal(ticks.length, countAfterUnsubscribe, "tick count should stop increasing after unsubscribe");
	});
});
