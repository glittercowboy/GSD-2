import test from "node:test";
import assert from "node:assert/strict";
import { shouldCreateSlicePrForSyncEvent } from "../sync.ts";

test("slice plan sync records issues without creating a draft PR", () => {
	assert.equal(shouldCreateSlicePrForSyncEvent("plan-slice", { slice_prs: true }), false);
	assert.equal(shouldCreateSlicePrForSyncEvent("research-slice", { slice_prs: true }), false);
});

test("slice completion creates the PR only after slice work is complete", () => {
	assert.equal(shouldCreateSlicePrForSyncEvent("complete-slice", { slice_prs: true }), true);
	assert.equal(shouldCreateSlicePrForSyncEvent("complete-slice", {}), true);
	assert.equal(shouldCreateSlicePrForSyncEvent("complete-slice", { slice_prs: false }), false);
});
