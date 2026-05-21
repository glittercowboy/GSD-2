// Project/App: GSD-2
// File Purpose: E2E gate for headless multi-milestone sequencing through auto-mode.

import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";

import {
	artifactsFor,
	createTmpProject,
	gsdSync,
	parseJsonEvents,
	type TranscriptTurn,
	writeTranscript,
} from "./_shared/index.ts";

function binaryAvailable(): { ok: boolean; reason?: string } {
	const bin = process.env.GSD_SMOKE_BINARY;
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; build with `npm run build:core` and re-export." };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

function commitFixture(dir: string): void {
	execFileSync("git", ["add", "package.json", "src/answer.js", "src/status.js", "test/answer.test.js", "test/status.test.js"], { cwd: dir, stdio: "pipe" });
	execFileSync("git", ["commit", "-m", "test: seed multi-milestone fixture"], { cwd: dir, stdio: "pipe" });
}

function scalar(db: DatabaseSync, sql: string, params: Record<string, string> = {}): string | null {
	const row = db.prepare(sql).get(params) as { value?: string | number | null } | undefined;
	return row?.value == null ? null : String(row.value);
}

function pushTool(
	turns: TranscriptTurn[],
	name: string,
	input: Record<string, unknown>,
	id: string,
	expect?: TranscriptTurn["expect"],
): void {
	turns.push({
		turn: turns.length + 1,
		...(expect ? { expect } : {}),
		emit: { kind: "tool_use", calls: [{ id, name, input }] },
	});
}

function pushText(turns: TranscriptTurn[], text: string, expect?: TranscriptTurn["expect"]): void {
	turns.push({
		turn: turns.length + 1,
		...(expect ? { expect } : {}),
		emit: { kind: "text", text },
	});
}

function slicePlanInput(milestoneId: "M001" | "M002", file: string, verify: string, expected: string): Record<string, unknown> {
	return {
		milestoneId,
		sliceId: "S01",
		goal: `Update ${file} and verify the behavior.`,
		successCriteria: expected,
		proofLevel: `Run ${verify}.`,
		integrationClosure: milestoneId === "M002" ? "Full fixture command passes after both milestones." : "Focused source behavior only.",
		observabilityImpact: "None.",
		tasks: [{
			taskId: "T01",
			title: `Update ${file}`,
			description: `Change ${file} so ${expected}, then run ${verify}.`,
			estimate: "5m",
			files: [file],
			verify,
			inputs: [file, "test/answer.test.js", "test/status.test.js"],
			expectedOutput: [file],
			observabilityImpact: "None.",
		}],
	};
}

function completeTaskInput(
	milestoneId: "M001" | "M002",
	file: string,
	verify: string,
	oneLiner: string,
): Record<string, unknown> {
	return {
		taskId: "T01",
		sliceId: "S01",
		milestoneId,
		oneLiner,
		narrative: `Changed ${file} and verified it with ${verify}.`,
		verification: `${verify} exited 0.`,
		deviations: "None.",
		knownIssues: "None.",
		keyFiles: [file],
		keyDecisions: ["Keep each milestone to one source behavior so sequencing state is easy to audit."],
		blockerDiscovered: false,
		verificationEvidence: [{
			command: verify,
			exitCode: 0,
			verdict: "pass",
			durationMs: 100,
		}],
	};
}

function completeSliceInput(
	milestoneId: "M001" | "M002",
	title: string,
	file: string,
	verify: string,
	oneLiner: string,
): Record<string, unknown> {
	return {
		sliceId: "S01",
		milestoneId,
		sliceTitle: title,
		oneLiner,
		narrative: `The planned task changed ${file} and verified it with ${verify}.`,
		verification: `${verify} exited 0.`,
		uatContent: `# UAT\n\nPASS: ${oneLiner}\n`,
		deviations: "None.",
		knownLimitations: "None.",
		followUps: "None.",
		keyFiles: [file],
		keyDecisions: ["The sequence keeps milestone closure separate from downstream activation."],
		filesModified: [{ path: file, description: oneLiner }],
	};
}

function validationInput(
	milestoneId: "M001" | "M002",
	success: string,
	integration: string,
	requirements: string,
): Record<string, unknown> {
	return {
		milestoneId,
		verdict: "pass",
		remediationRound: 0,
		successCriteriaChecklist: success,
		sliceDeliveryAudit: "| Slice | Status | Evidence |\n| --- | --- | --- |\n| S01 | PASS | S01 summary and task verification are present. |",
		crossSliceIntegration: integration,
		requirementCoverage: requirements,
		verificationClasses: "| Class | Planned Check | Evidence | Verdict |\n| --- | --- | --- | --- |\n| Contract | node:test command exits 0. | Verification command exited 0. | PASS |\n| Integration | Fixture behavior composes with previous work. | Full command passed where applicable. | PASS |\n| Operational | Headless process exits cleanly. | No blocked/error operator notification was emitted. | PASS |\n| UAT | Slice UAT summaries pass. | S01 closeout UAT content recorded PASS. | PASS |",
		verdictRationale: "The planned source behavior, verification command, requirement coverage, and closeout artifacts passed.",
	};
}

function completionInput(
	milestoneId: "M001" | "M002",
	title: string,
	oneLiner: string,
	narrative: string,
	keyFile: string,
): Record<string, unknown> {
	return {
		milestoneId,
		title,
		oneLiner,
		narrative,
		verificationPassed: true,
		successCriteriaResults: "- PASS: planned source behavior is present.\n- PASS: validation passed before completion.",
		definitionOfDoneResults: "- PASS: source module changed.\n- PASS: slice and task completed.\n- PASS: milestone validation passed.",
		requirementOutcomes: `${milestoneId === "M001" ? "R001" : "R002"} satisfied by ${milestoneId}/S01/T01.`,
		keyDecisions: ["Let the dispatcher activate the next milestone only after the prior milestone is complete."],
		keyFiles: [keyFile],
		lessonsLearned: ["Milestone sequencing should be validated through real auto-mode dispatch boundaries."],
		followUps: "None.",
		deviations: "None.",
	};
}

function buildTranscript(): string {
	const turns: TranscriptTurn[] = [];

	pushTool(turns, "gsd_milestone_generate_id", {}, "generate-m001", { modelId: "gsd-fake-model", lastUserText: "Headless Milestone Creation" });
	pushTool(turns, "gsd_milestone_generate_id", {}, "generate-m002", { hasToolResultFor: "gsd_milestone_generate_id" });
	pushTool(turns, "gsd_summary_save", {
		artifact_type: "PROJECT",
		content: [
			"# Project",
			"",
			"## Project Shape",
			"**Complexity:** simple",
			"",
			"## Milestone Sequence",
			"- [ ] M001: Answer Ready - Update the answer module.",
			"- [ ] M002: Status Done - Update the status module after M001 closes.",
			"",
		].join("\n"),
	}, "project", { hasToolResultFor: "gsd_milestone_generate_id" });
	pushTool(turns, "gsd_requirement_save", {
		class: "core-capability",
		description: "The answer module returns the requested ready value.",
		why: "M001 needs one observable source behavior change.",
		source: "spec",
		status: "active",
		primary_owner: "M001/S01",
		supporting_slices: "",
		validation: "The focused answer verification command exits 0.",
		notes: "Multi-milestone e2e fixture.",
	}, "answer-requirement", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "gsd_requirement_save", {
		class: "core-capability",
		description: "The status module returns the requested done value after M001 completes.",
		why: "M002 proves the workflow activates downstream milestones after closeout.",
		source: "spec",
		status: "active",
		primary_owner: "M002/S01",
		supporting_slices: "",
		validation: "The full fixture test command exits 0.",
		notes: "Multi-milestone e2e fixture.",
	}, "status-requirement", { hasToolResultFor: "gsd_requirement_save" });
	pushTool(turns, "gsd_summary_save", {
		artifact_type: "REQUIREMENTS",
		content: "# Requirements\n",
	}, "requirements", { hasToolResultFor: "gsd_requirement_save" });
	pushTool(turns, "ask_user_questions", {
		questions: [{
			id: "depth_verification_M001_confirm",
			header: "Depth Check",
			question: "Proceed with this headless multi-milestone plan?",
			options: [
				{
					label: "Yes, you got it (Recommended)",
					description: "Write the milestone contexts from the current understanding.",
				},
				{
					label: "Not quite",
					description: "Stop for corrected scope before writing context.",
				},
			],
		}],
	}, "depth-check", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "gsd_summary_save", {
		milestone_id: "M001",
		artifact_type: "CONTEXT",
		content: [
			"# M001: Answer Ready",
			"",
			"## Goal",
			"Update `src/answer.js` so the exported function returns `ready`.",
			"",
			"## Done",
			"- `src/answer.js` returns `ready`.",
			"- `node --test test/answer.test.js` exits 0.",
			"- M001 validates and completes before M002 activates.",
			"",
		].join("\n"),
	}, "m001-context", { hasToolResultFor: "ask_user_questions" });
	pushTool(turns, "gsd_plan_milestone", {
		milestoneId: "M001",
		title: "Answer Ready",
		vision: "Trivial source behavior change to establish the first milestone.",
		status: "active",
		slices: [{
			sliceId: "S01",
			title: "Update answer module",
			risk: "low",
			depends: [],
			demo: "Calling answer() returns ready.",
			goal: "Change the answer module and verify it locally.",
			successCriteria: "answer() returns ready.",
			proofLevel: "Command exits 0.",
			integrationClosure: "Focused module behavior only.",
			observabilityImpact: "None.",
		}],
		successCriteria: ["answer() returns ready.", "M001 completes before M002 activates."],
		keyRisks: [{
			risk: "M002 could activate before M001 is durably complete.",
			whyItMatters: "Milestone sequencing depends on closeout state agreement.",
		}],
		proofStrategy: [{
			riskOrUnknown: "M001 closeout before M002 activation",
			retireIn: "S01",
			whatWillBeProven: "M001 completes after verification and validation.",
		}],
		verificationContract: "Focused node:test command exits 0.",
		verificationIntegration: "M002 verifies the full fixture after M001.",
		verificationOperational: "Headless process exits 0 without blocked or error notifications.",
		verificationUat: "Slice UAT summary records pass verdict.",
		definitionOfDone: ["`src/answer.js` is changed.", "M001 validation passes.", "M001 completion is durable."],
		requirementCoverage: "R001 is owned by M001/S01.",
		boundaryMapMarkdown: "| Boundary | Decision |\n| --- | --- |\n| M001 -> M002 | M002 depends on M001 completion. |\n",
	}, "m001-roadmap", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "ask_user_questions", {
		questions: [{
			id: "depth_verification_M002_confirm",
			header: "Depth Check",
			question: "Proceed with the queued M002 context?",
			options: [
				{
					label: "Yes, you got it (Recommended)",
					description: "Write the M002 context with M001 as its dependency.",
				},
				{
					label: "Not quite",
					description: "Stop for corrected M002 scope before writing context.",
				},
			],
		}],
	}, "m002-depth-check", { hasToolResultFor: "gsd_plan_milestone" });
	pushTool(turns, "gsd_summary_save", {
		milestone_id: "M002",
		artifact_type: "CONTEXT",
		content: [
			"---",
			"depends_on: [M001]",
			"---",
			"",
			"# M002: Status Done",
			"",
			"## Goal",
			"After M001 completes, update `src/status.js` so the exported function returns `done`.",
			"",
			"## Done",
			"- M001 is complete before M002 planning.",
			"- `src/status.js` returns `done`.",
			"- `npm test` exits 0 and proves both milestone source changes together.",
			"",
		].join("\n"),
	}, "m002-context", { hasToolResultFor: "ask_user_questions" });
	pushTool(turns, "write", {
		path: ".gsd/DISCUSSION-MANIFEST.json",
		content: JSON.stringify({
			primary: "M001",
			milestones: {
				M001: { gate: "discussed", context: "full" },
				M002: { gate: "discussed", context: "full" },
			},
			total: 2,
			gates_completed: 2,
		}, null, 2) + "\n",
	}, "discussion-manifest", { hasToolResultFor: "gsd_summary_save" });
	pushText(turns, "Milestone M001 ready.", { hasToolResultFor: "write" });

	pushTool(turns, "gsd_summary_save", {
		milestone_id: "M001",
		slice_id: "S01",
		artifact_type: "RESEARCH",
		content: "# S01 - Research\n\nUse `src/answer.js` and verify with `node --test test/answer.test.js`.\n",
	}, "m001-s01-research");
	pushText(turns, "M001/S01 researched.", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "gsd_plan_slice", slicePlanInput("M001", "src/answer.js", "node --test test/answer.test.js", "answer() returns ready."), "m001-s01-plan");
	pushText(turns, "M001/S01 planned.", { hasToolResultFor: "gsd_plan_slice" });
	pushTool(turns, "write", {
		path: "src/answer.js",
		content: "export function answer() {\n\treturn \"ready\";\n}\n",
	}, "write-answer");
	pushTool(turns, "bash", {
		command: "node --test test/answer.test.js",
		timeout: 30,
	}, "verify-answer", { hasToolResultFor: "write" });
	pushTool(turns, "gsd_task_complete", completeTaskInput("M001", "src/answer.js", "node --test test/answer.test.js", "Updated answer() to return ready."), "m001-task", { hasToolResultFor: "bash" });
	pushText(turns, "M001/S01/T01 complete.", { hasToolResultFor: "gsd_task_complete" });
	pushTool(turns, "gsd_slice_complete", completeSliceInput("M001", "Update answer module", "src/answer.js", "node --test test/answer.test.js", "answer() now returns ready."), "m001-slice");
	pushText(turns, "M001/S01 complete.", { hasToolResultFor: "gsd_slice_complete" });
	pushTool(turns, "gsd_validate_milestone", validationInput(
		"M001",
		"- PASS: answer() returns ready.\n- PASS: M001 completes before M002 activates.",
		"M001 is a focused source change; M002 performs the downstream full fixture verification.",
		"R001 is covered by M001/S01/T01.",
	), "m001-validation");
	pushText(turns, "Milestone M001 validation complete - verdict: pass.", { hasToolResultFor: "gsd_validate_milestone" });
	pushTool(turns, "gsd_complete_milestone", completionInput(
		"M001",
		"Answer Ready",
		"Updated answer() to return ready and validated M001.",
		"M001 completed its source change, focused verification, slice closeout, milestone validation, and milestone completion before M002 work began.",
		"src/answer.js",
	), "m001-complete");
	pushText(turns, "Milestone M001 complete.", { hasToolResultFor: "gsd_complete_milestone" });

	pushTool(turns, "gsd_summary_save", {
		milestone_id: "M002",
		artifact_type: "RESEARCH",
		content: "# M002 - Research\n\nM001 is complete. Use `src/status.js` and verify both modules with `npm test`.\n",
	}, "m002-research");
	pushText(turns, "Milestone M002 researched.", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "gsd_plan_milestone", {
		milestoneId: "M002",
		title: "Status Done",
		vision: "Second source behavior change that verifies both milestones together.",
		status: "active",
		dependsOn: ["M001"],
		slices: [{
			sliceId: "S01",
			title: "Update status module",
			risk: "low",
			depends: [],
			demo: "Calling status() returns done and the full fixture test suite passes.",
			goal: "Change the status module and verify the full fixture.",
			successCriteria: "status() returns done and answer() still returns ready.",
			proofLevel: "Full command exits 0.",
			integrationClosure: "Both milestone source changes are verified by one command.",
			observabilityImpact: "None.",
		}],
		successCriteria: ["status() returns done.", "answer() still returns ready.", "Both milestones complete."],
		keyRisks: [{
			risk: "The workflow may stop after M001 instead of activating M002.",
			whyItMatters: "Multi-milestone specs need sequential closeout without manual recovery.",
		}],
		proofStrategy: [{
			riskOrUnknown: "M002 activation after M001 completion",
			retireIn: "S01",
			whatWillBeProven: "M002 plans, executes, validates, and completes after M001.",
		}],
		verificationContract: "Full node:test command exits 0.",
		verificationIntegration: "The full fixture command verifies both source modules together.",
		verificationOperational: "Headless process exits 0 without blocked or error notifications.",
		verificationUat: "Slice UAT summary records pass verdict.",
		definitionOfDone: ["`src/status.js` is changed.", "`npm test` passes.", "M002 validation and completion are durable."],
		requirementCoverage: "R002 is owned by M002/S01. R001 remains covered by M001/S01.",
		boundaryMapMarkdown: "| Boundary | Decision |\n| --- | --- |\n| M001 -> M002 | `npm test` proves M001 behavior still holds while M002 changes status. |\n",
	}, "m002-roadmap");
	pushText(turns, "Milestone M002 planned.", { hasToolResultFor: "gsd_plan_milestone" });
	pushTool(turns, "gsd_plan_slice", slicePlanInput("M002", "src/status.js", "npm test", "status() returns done."), "m002-s01-plan");
	pushText(turns, "M002/S01 planned.", { hasToolResultFor: "gsd_plan_slice" });
	pushTool(turns, "write", {
		path: "src/status.js",
		content: "export function status() {\n\treturn \"done\";\n}\n",
	}, "write-status");
	pushTool(turns, "bash", {
		command: "npm test",
		timeout: 30,
	}, "verify-status", { hasToolResultFor: "write" });
	pushTool(turns, "gsd_task_complete", completeTaskInput("M002", "src/status.js", "npm test", "Updated status() to return done."), "m002-task", { hasToolResultFor: "bash" });
	pushText(turns, "M002/S01/T01 complete.", { hasToolResultFor: "gsd_task_complete" });
	pushTool(turns, "gsd_slice_complete", completeSliceInput("M002", "Update status module", "src/status.js", "npm test", "status() now returns done."), "m002-slice");
	pushText(turns, "M002/S01 complete.", { hasToolResultFor: "gsd_slice_complete" });
	pushTool(turns, "gsd_validate_milestone", validationInput(
		"M002",
		"- PASS: status() returns done.\n- PASS: answer() still returns ready.\n- PASS: both milestones complete.",
		"The M002 `npm test` command verifies both milestone source modules together.",
		"R002 is covered by M002/S01/T01; R001 remained covered by M001/S01/T01.",
	), "m002-validation");
	pushText(turns, "Milestone M002 validation complete - verdict: pass.", { hasToolResultFor: "gsd_validate_milestone" });
	pushTool(turns, "gsd_complete_milestone", completionInput(
		"M002",
		"Status Done",
		"Updated status() to return done and verified both milestones together.",
		"M002 activated after M001 completed, planned the status source change, verified the full fixture, validated the milestone, and completed the sequence.",
		"src/status.js",
	), "m002-complete");
	pushText(turns, "Milestone M002 complete.", { hasToolResultFor: "gsd_complete_milestone" });

	return writeTranscript(turns);
}

describe("multi-milestone sequence e2e (fake LLM)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("headless new-milestone --auto completes M001 then M002", { skip: skipReason ?? false, timeout: 300_000 }, (t) => {
		const project = createTmpProject({
			git: true,
			files: {
				"package.json": JSON.stringify({
					type: "module",
					scripts: { test: "node --test test/answer.test.js test/status.test.js" },
				}, null, 2) + "\n",
				"src/answer.js": "export function answer() {\n\treturn \"pending\";\n}\n",
				"src/status.js": "export function status() {\n\treturn \"pending\";\n}\n",
				"test/answer.test.js": [
					"import test from \"node:test\";",
					"import assert from \"node:assert/strict\";",
					"import { answer } from \"../src/answer.js\";",
					"",
					"test(\"answer returns ready\", () => {",
					"\tassert.equal(answer(), \"ready\");",
					"});",
					"",
				].join("\n"),
				"test/status.test.js": [
					"import test from \"node:test\";",
					"import assert from \"node:assert/strict\";",
					"import { status } from \"../src/status.js\";",
					"",
					"test(\"status returns done\", () => {",
					"\tassert.equal(status(), \"done\");",
					"});",
					"",
				].join("\n"),
			},
		});
		t.after(project.cleanup);
		commitFixture(project.dir);
		const answersPath = join(project.dir, "answers.json");
		writeFileSync(answersPath, JSON.stringify({
			questions: {
				depth_verification_M001_confirm: "Yes, you got it (Recommended)",
				depth_verification_M002_confirm: "Yes, you got it (Recommended)",
			},
		}, null, 2) + "\n");

		const result = gsdSync(
			[
				"headless",
				"--output-format",
				"stream-json",
				"--events",
				"extension_ui_request,tool_execution_end",
				"--model",
				"gsd-fake-model",
				"--timeout",
				"240000",
				"--max-restarts",
				"0",
				"--answers",
				answersPath,
				"new-milestone",
				"--context-text",
				"First make answer() return ready, then after that milestone completes make status() return done, and verify both with node:test.",
				"--auto",
			],
			{
				cwd: project.dir,
				timeoutMs: 270_000,
				env: {
					GSD_FAKE_LLM_TRANSCRIPT: buildTranscript(),
				},
			},
		);

		const artifacts = artifactsFor("multi-milestone-sequence");
		artifacts.write("stdout.jsonl", result.stdout);
		artifacts.write("stderr.log", result.stderr);

		assert.equal(
			result.code,
			0,
			`expected exit 0, got code=${result.code} signal=${result.signal} timedOut=${result.timedOut}. stderr artifact: ${artifacts.dir}`,
		);
		assert.ok(!result.timedOut, "headless multi-milestone run must not time out");

		const events = parseJsonEvents(result.stdoutClean);
		const notifyMessages = events
			.filter((event) => event.type === "extension_ui_request" && event.method === "notify")
			.map((event) => String(event.message ?? ""));
		const badOperatorSignals = notifyMessages.filter((message) =>
			/blocked:|failed|cannot complete|cannot validate|stopped with an issue/i.test(message),
		);
		const toolErrors = events
			.filter((event) => event.type === "tool_execution_end")
			.filter((event) => event.isError === true || (event.result as { isError?: boolean } | undefined)?.isError === true)
			.map((event) => `${String(event.toolName ?? "unknown")}: ${JSON.stringify(event.result ?? {})}`);
		const toolNames = events
			.filter((event) => event.type === "tool_execution_end")
			.map((event) => String(event.toolName ?? ""));
		const discussionManifestWrites = events.filter((event) =>
			event.type === "tool_execution_end" &&
			event.toolName === "write" &&
			event.toolCallId === "discussion-manifest",
		);

		assert.deepEqual(badOperatorSignals, [], `unexpected blocked/error operator signals: ${badOperatorSignals.join("\n")}`);
		assert.deepEqual(toolErrors, [], `unexpected tool errors:\n${toolErrors.join("\n")}`);
		assert.equal(toolNames.filter((toolName) => toolName === "gsd_milestone_generate_id").length, 2, "multi-milestone planning must generate two IDs");
		assert.equal(toolNames.filter((toolName) => toolName === "gsd_plan_milestone").length, 2, "both milestones must be planned through the workflow tool");
		assert.equal(toolNames.filter((toolName) => toolName === "gsd_validate_milestone").length, 2, "both milestones must validate before completion");
		assert.equal(toolNames.filter((toolName) => toolName === "gsd_complete_milestone").length, 2, "both milestones must complete");
		assert.equal(discussionManifestWrites.length, 1, "multi-milestone discussion manifest must be written before auto execution");
		assert.ok(
			notifyMessages.some((message) => /auto-mode stopped/i.test(message) && /all milestones complete|milestone m002 complete/i.test(message)),
			`expected terminal all-milestones completion notification, got:\n${notifyMessages.join("\n")}`,
		);
		assert.doesNotThrow(
			() => execFileSync("npm", ["test"], { cwd: project.dir, stdio: "pipe" }),
			"full fixture verification command must pass after both milestones complete",
		);

		for (const milestoneId of ["M001", "M002"]) {
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", milestoneId, `${milestoneId}-CONTEXT.md`)), `${milestoneId} context artifact is present`);
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", milestoneId, `${milestoneId}-ROADMAP.md`)), `${milestoneId} roadmap artifact is present`);
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", milestoneId, `${milestoneId}-VALIDATION.md`)), `${milestoneId} validation artifact is present`);
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", milestoneId, `${milestoneId}-SUMMARY.md`)), `${milestoneId} summary artifact is present`);
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", milestoneId, "slices", "S01", "S01-SUMMARY.md")), `${milestoneId}/S01 summary artifact is present`);
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", milestoneId, "slices", "S01", "tasks", "T01-SUMMARY.md")), `${milestoneId}/S01/T01 summary artifact is present`);
		}

		const db = new DatabaseSync(join(project.dir, ".gsd", "gsd.db"));
		t.after(() => db.close());
		assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM milestones WHERE status = 'complete'"), "2");
		assert.equal(scalar(db, "SELECT status AS value FROM milestones WHERE id = :id", { id: "M001" }), "complete");
		assert.equal(scalar(db, "SELECT status AS value FROM milestones WHERE id = :id", { id: "M002" }), "complete");
		assert.match(scalar(db, "SELECT depends_on AS value FROM milestones WHERE id = :id", { id: "M002" }) ?? "", /M001/);
		assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM slices WHERE status = 'complete'"), "2");
		assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM tasks WHERE status = 'complete'"), "2");
		assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM assessments WHERE scope = 'milestone-validation' AND status = 'pass'"), "2");
		assert.equal(
			scalar(
				db,
				"SELECT COUNT(*) AS value FROM quality_gates WHERE scope = 'milestone' AND task_id = '' AND status = 'complete' AND verdict = 'pass'",
			),
			"8",
		);
	});
});
