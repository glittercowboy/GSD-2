// GSD-2 + Visual Brief command tests

import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "@gsd/pi-coding-agent";
import {
	createVisualBriefArtifactPolicy,
	formatArtifactPolicy,
	getVisualBriefOutputDir,
} from "../artifact-policy.ts";
import {
	getVisualBriefModeProfile,
	VISUAL_BRIEF_PAGE_RULES,
} from "../page-contract.ts";
import {
	buildVisualBriefPrompt,
	getVisualBriefCompletions,
	parseVisualBriefArgs,
	VISUAL_BRIEF_MODES,
	VISUAL_BRIEF_USAGE,
} from "../prompts.ts";

test("keeps Visual Brief command surface under /gsd brief", () => {
	const manifest = readManifest(fileURLToPath(new URL("..", import.meta.url)));

	assert.equal(manifest?.id, "visual-brief");
	assert.equal(manifest?.provides?.commands, undefined);
	assert.match(VISUAL_BRIEF_USAGE, /^Usage: \/gsd brief/);
});

test("parses explicit modes and slide output", () => {
	const request = parseVisualBriefArgs("plan --slides browser tools verification flow");

	assert.deepEqual(request, {
		mode: "plan",
		subject: "browser tools verification flow",
		slides: true,
		rawArgs: "plan --slides browser tools verification flow",
	});
});

test("defaults freeform input to diagram mode", () => {
	const request = parseVisualBriefArgs("authentication sequence");

	assert.equal(request?.mode, "diagram");
	assert.equal(request?.subject, "authentication sequence");
	assert.equal(request?.slides, false);
});

test("parses supported aliases without registering command aliases", () => {
	const review = parseVisualBriefArgs("review release branch changes");
	const deck = parseVisualBriefArgs("deck launch recap");

	assert.equal(review?.mode, "diff");
	assert.equal(review?.subject, "release branch changes");
	assert.equal(deck?.mode, "slides");
	assert.equal(deck?.slides, true);
});

test("rejects flag-only input as usage", () => {
	assert.equal(parseVisualBriefArgs("--slides"), null);
});

test("uses current changes as the diff subject when none is provided", () => {
	const request = parseVisualBriefArgs("diff");

	assert.equal(request?.mode, "diff");
	assert.equal(request?.subject, "the current staged and unstaged repository changes");
});

test("builds a provider-neutral prompt with output instructions", () => {
	const request = parseVisualBriefArgs("table release readiness matrix");
	assert.ok(request, "request should parse");

	const prompt = buildVisualBriefPrompt(request, { outputDir: "/tmp/gsd-diagrams" });

	assert.match(prompt, /Mode: table/);
	assert.match(prompt, /Subject: release readiness matrix/);
	assert.match(prompt, /Output directory: \/tmp\/gsd-diagrams/);
	assert.match(prompt, /Do not include provider-specific claims/);
	assert.match(prompt, /Use semantic HTML tables/);
	assert.match(prompt, /Use a descriptive kebab-case filename/);
	assert.match(prompt, /one self-contained responsive HTML file/);
	assert.match(prompt, /macOS: open/);
	assert.match(prompt, /absolute file path/);
	assert.ok(prompt.indexOf("Gather evidence before writing the page") < prompt.indexOf("Write the HTML file"));
});

test("generated prompts require the shared GSD HTML shell", () => {
	const request = parseVisualBriefArgs("diff");
	assert.ok(request, "diff request should parse");

	const prompt = buildVisualBriefPrompt(request, { outputDir: "/tmp/visual-brief" });

	assert.match(prompt, /## Required HTML shell/);
	assert.match(prompt, /<span class="logo">GSD<\/span>/);
	assert.match(prompt, /<span class="kind-chip">Diff Brief<\/span>/);
	assert.match(prompt, /{{MAIN_HTML}}/);
	assert.match(prompt, /{{GENERATED_AT}}/);
	assert.match(prompt, /Do not add new <style> blocks/);
});

test("returns first-argument completions for visual brief modes", () => {
	const completions = getVisualBriefCompletions("di");

	assert.ok(
		completions.some((completion) => completion.value === "diagram"),
		"diagram should be suggested for a matching prefix",
	);

	const allCompletions = getVisualBriefCompletions("");
	for (const mode of VISUAL_BRIEF_MODES) {
		assert.ok(
			allCompletions.some((completion) => completion.value === mode.mode),
			`${mode.mode} should be suggested without a prefix`,
		);
	}
});

test("generated prompts include page contract rules and sections for every mode", () => {
	for (const mode of VISUAL_BRIEF_MODES) {
		const request = parseVisualBriefArgs(`${mode.mode} scoped subject`);
		assert.ok(request, `${mode.mode} request should parse`);

		const prompt = buildVisualBriefPrompt(request, { outputDir: "/tmp/visual-brief" });
		const profile = getVisualBriefModeProfile(request.mode, request.slides);

		for (const rule of VISUAL_BRIEF_PAGE_RULES) {
			assert.match(prompt, new RegExp(escapeRegExp(rule)), `${mode.mode} prompt should include page rule: ${rule}`);
		}
		for (const step of profile.evidenceSteps) {
			assert.match(prompt, new RegExp(escapeRegExp(step)), `${mode.mode} prompt should include evidence step: ${step}`);
		}
		for (const section of profile.sections) {
			assert.match(prompt, new RegExp(escapeRegExp(section)), `${mode.mode} prompt should include section: ${section}`);
		}
		assert.doesNotMatch(prompt, /\/gsd visualize/);
	}
});

test("diff prompt requires change evidence and review sections", () => {
	const request = parseVisualBriefArgs("diff");
	assert.ok(request, "diff request should parse");
	const prompt = buildVisualBriefPrompt(request, { outputDir: "/tmp/visual-brief" });
	const profile = getVisualBriefModeProfile("diff", false);

	assert.ok(VISUAL_BRIEF_PAGE_RULES.includes("Include accessible headings, readable contrast, responsive tables, and no horizontal body overflow."));
	assert.ok(
		profile.sections.includes("Test coverage matrix"),
		"diff review should include test coverage matrix section",
	);
	assert.ok(
		profile.evidenceSteps.includes("Inspect git status plus staged and unstaged diffs."),
		"diff review should require inspecting repository changes before claims",
	);
	assert.match(prompt, /Inspect git status plus staged and unstaged diffs/);
	assert.match(prompt, /Change map by file and subsystem/);
	assert.match(prompt, /Risk heatmap/);
	assert.match(prompt, /Behavior changes and compatibility notes/);
	assert.match(prompt, /Test coverage matrix/);
	assert.match(prompt, /Actionable findings and open questions/);
	assert.match(prompt, /Separate confirmed findings from questions or residual risk/);
});

test("artifact policy formats output directory and opener guidance", () => {
	const policy = createVisualBriefArtifactPolicy("/tmp/visual-brief");
	const text = formatArtifactPolicy(policy);

	assert.match(text, /\/tmp\/visual-brief/);
	assert.match(text, /kebab-case filename/);
	assert.match(text, /self-contained responsive HTML file/);
	assert.match(text, /macOS: open/);
	assert.match(text, /Linux: xdg-open/);
	assert.match(text, /Windows: cmd \/c start/);
	assert.match(text, /absolute file path/);
});

test("artifact output directory is under the configured GSD agent directory", () => {
	assert.equal(getVisualBriefOutputDir("/tmp/gsd-agent-test"), join("/tmp/gsd-agent-test", "diagrams"));
});

test("prompt embeds the GSD version in the shell when provided", () => {
	const request = parseVisualBriefArgs("diff release branch changes");
	assert.ok(request, "request should parse");

	const prompt = buildVisualBriefPrompt(request, { outputDir: "/tmp/visual-brief", version: "9.9.9" });
	assert.match(prompt, /v9\.9\.9/);
});

test("prompt omits the version chip when version is missing or blank", () => {
	const request = parseVisualBriefArgs("diff release branch changes");
	assert.ok(request, "request should parse");

	const blank = buildVisualBriefPrompt(request, { outputDir: "/tmp/visual-brief", version: "   " });
	assert.doesNotMatch(blank, /class="version"/);

	const missing = buildVisualBriefPrompt(request, { outputDir: "/tmp/visual-brief" });
	assert.doesNotMatch(missing, /class="version"/);
});

test("getVisualBriefModeProfile throws on an unknown mode", () => {
	assert.throws(
		() => getVisualBriefModeProfile("not-a-real-mode" as unknown as Parameters<typeof getVisualBriefModeProfile>[0], false),
		/Unknown visual brief mode: not-a-real-mode/,
	);
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
