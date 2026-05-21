import test from "node:test";
import assert from "node:assert/strict";

import { shouldWriteGitFiles } from "../init-wizard.ts";
import { shouldSkipGitBootstrapAfterInit } from "../guided-flow.ts";

test("init wizard does not write git files when git setup is skipped", () => {
	assert.equal(shouldWriteGitFiles(false), false);
	assert.equal(shouldWriteGitFiles(true), true);
});

test("guided flow skips git bootstrap after the init wizard skip-git choice", () => {
	assert.equal(shouldSkipGitBootstrapAfterInit({ gitEnabled: false }), true);
	assert.equal(shouldSkipGitBootstrapAfterInit({ gitEnabled: true }), false);
	assert.equal(shouldSkipGitBootstrapAfterInit({}), false);
});
