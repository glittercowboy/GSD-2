// GSD-2 pi-coding-agent system prompt file-safety regression tests.

import test from "node:test";
import assert from "node:assert/strict";

import { buildSystemPrompt } from "../core/system-prompt.js";

test("buildSystemPrompt: read and write tools require reading before overwrite", () => {
	const prompt = buildSystemPrompt({ selectedTools: ["read", "write"] });

	assert.match(prompt, /before editing or overwriting/i);
	assert.match(prompt, /Before write creates or replaces a file, verify the target path/i);
	assert.match(prompt, /if it exists, read it first/i);
	assert.match(prompt, /Use write only for new files or complete rewrites after verifying the target path/i);
});

test("buildSystemPrompt: write-only tool guidance does not reference unavailable read tool", () => {
	const prompt = buildSystemPrompt({ selectedTools: ["write"] });

	assert.doesNotMatch(prompt, /read it first/i);
	assert.match(prompt, /Use write only for new files or complete rewrites after verifying the target path/i);
});
