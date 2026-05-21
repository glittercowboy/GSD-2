// GSD-2 + Subagent durable run-store tests.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	SubagentRunStore,
	createInitialRunRecord,
	createSubagentTrackingName,
	deriveRunStatus,
} from "../run-store.js";

describe("SubagentRunStore", () => {
	let dir: string | undefined;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it("persists launch and successful completion evidence", () => {
		dir = mkdtempSync(join(tmpdir(), "gsd-subagent-runs-"));
		const store = new SubagentRunStore(dir);
		store.create(createInitialRunRecord({
			runId: "run-1",
			mode: "single",
			contextMode: "fresh",
			cwd: "/repo",
			children: [{ agent: "scout", trackingName: "clear-beacon", task: "inspect" }],
			now: "2026-01-01T00:00:00.000Z",
		}));

		store.update("run-1", (record) => ({
			...record,
			status: "succeeded",
			completedAt: "2026-01-01T00:00:01.000Z",
			children: [{
				...record.children[0],
				status: "succeeded",
				exitCode: 0,
				output: "done",
			}],
		}));

		const loaded = store.get("run-1");
		assert.equal(loaded?.status, "succeeded");
		assert.equal(loaded?.children[0]?.trackingName, "clear-beacon");
		assert.equal(loaded?.children[0]?.output, "done");
		assert.equal(store.list()[0]?.runId, "run-1");
	});

	it("generates unique tracking names for child agents", () => {
		const names = new Set<string>();
		for (let i = 0; i < 24; i++) {
			const name = createSubagentTrackingName(names);
			assert.match(name, /^[a-z]+-[a-z]+$|^agent-\d+$/);
			assert.equal(names.has(name), false);
			names.add(name);
		}
	});

	it("persists failed and interrupted child evidence", () => {
		dir = mkdtempSync(join(tmpdir(), "gsd-subagent-runs-"));
		const store = new SubagentRunStore(dir);
		store.create(createInitialRunRecord({
			runId: "run-2",
			mode: "parallel",
			contextMode: "fork",
			cwd: "/repo",
			children: [
				{ agent: "tester", task: "verify" },
				{ agent: "reviewer", task: "review" },
			],
		}));

		store.update("run-2", (record) => ({
			...record,
			status: "interrupted",
			children: [
				{
					...record.children[0],
					status: "failed",
					exitCode: 1,
					errorMessage: "verification failed",
				},
				{
					...record.children[1],
					status: "interrupted",
					exitCode: 1,
					stopReason: "aborted",
				},
			],
			failure: { type: "interrupted", message: "run aborted" },
		}));

		const loaded = store.get("run-2");
		assert.equal(loaded?.status, "interrupted");
		assert.equal(loaded?.children[0]?.errorMessage, "verification failed");
		assert.equal(loaded?.children[1]?.stopReason, "aborted");
		assert.equal(loaded?.failure?.type, "interrupted");
	});

	it("derives failed and interrupted status from child artifacts", () => {
		assert.equal(deriveRunStatus([{ index: 0, agent: "a", task: "t", status: "failed" }]), "failed");
		assert.equal(deriveRunStatus([{ index: 0, agent: "a", task: "t", status: "interrupted" }]), "interrupted");
		assert.equal(deriveRunStatus([{ index: 0, agent: "a", task: "t", status: "succeeded" }]), "succeeded");
	});
});
