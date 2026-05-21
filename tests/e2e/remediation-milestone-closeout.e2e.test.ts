// Project/App: GSD-2
// File Purpose: E2E gate for headless milestone remediation and final closeout.

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
	execFileSync("git", ["commit", "-m", "test: seed remediation fixture"], { cwd: dir, stdio: "pipe" });
}

function scalar(db: DatabaseSync, sql: string, params: Record<string, string>): string | null {
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

function slicePlanInput(sliceId: "S01" | "S02", file: string, verify: string, expected: string): Record<string, unknown> {
	return {
		milestoneId: "M001",
		sliceId,
		goal: `Update ${file} and verify the behavior.`,
		successCriteria: expected,
		proofLevel: `Run ${verify}.`,
		integrationClosure: sliceId === "S02" ? "Full fixture command passes after remediation." : "Focused source behavior only.",
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

function completeTaskInput(sliceId: "S01" | "S02", file: string, verify: string, oneLiner: string): Record<string, unknown> {
	return {
		taskId: "T01",
		sliceId,
		milestoneId: "M001",
		oneLiner,
		narrative: `Changed ${file} and verified it with ${verify}.`,
		verification: `${verify} exited 0.`,
		deviations: "None.",
		knownIssues: "None.",
		keyFiles: [file],
		keyDecisions: ["Keep remediation as an explicit slice so validation gaps do not disappear into prose."],
		blockerDiscovered: false,
		verificationEvidence: [{
			command: verify,
			exitCode: 0,
			verdict: "pass",
			durationMs: 100,
		}],
	};
}

function completeSliceInput(sliceId: "S01" | "S02", title: string, file: string, verify: string, oneLiner: string): Record<string, unknown> {
	return {
		sliceId,
		milestoneId: "M001",
		sliceTitle: title,
		oneLiner,
		narrative: `The planned task changed ${file} and verified it with ${verify}.`,
		verification: `${verify} exited 0.`,
		uatContent: `# UAT\n\nPASS: ${oneLiner}\n`,
		deviations: "None.",
		knownLimitations: "None.",
		followUps: "None.",
		keyFiles: [file],
		keyDecisions: ["The workflow records remediation as normal milestone work before closeout."],
		filesModified: [{ path: file, description: oneLiner }],
	};
}

function buildTranscript(): string {
	const turns: TranscriptTurn[] = [];

	pushTool(turns, "gsd_summary_save", {
		artifact_type: "PROJECT",
		content: [
			"# Project",
			"",
			"## Project Shape",
			"**Complexity:** simple",
			"",
			"## Milestone Sequence",
			"- [ ] M001: Remediation Closeout - Complete initial work, remediate a validation gap, then close cleanly.",
			"",
		].join("\n"),
	}, "project", { modelId: "gsd-fake-model", lastUserText: "Headless Milestone Creation" });
	pushTool(turns, "gsd_requirement_save", {
		class: "core-capability",
		description: "The answer module returns the requested ready value.",
		why: "The initial slice needs one observable source behavior change.",
		source: "spec",
		status: "active",
		primary_owner: "S01",
		supporting_slices: "",
		validation: "The focused answer verification command exits 0.",
		notes: "Remediation closeout e2e fixture.",
	}, "answer-requirement", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "gsd_requirement_save", {
		class: "core-capability",
		description: "The status module returns the requested done value before milestone closeout.",
		why: "Milestone validation must be able to add and complete remediation work.",
		source: "spec",
		status: "active",
		primary_owner: "remediation",
		supporting_slices: "S02",
		validation: "The full fixture test command exits 0.",
		notes: "Intentionally left uncovered by the initial roadmap.",
	}, "status-requirement", { hasToolResultFor: "gsd_requirement_save" });
	pushTool(turns, "gsd_summary_save", {
		artifact_type: "REQUIREMENTS",
		content: "# Requirements\n",
	}, "requirements", { hasToolResultFor: "gsd_requirement_save" });
	pushTool(turns, "ask_user_questions", {
		questions: [{
			id: "depth_verification_M001_confirm",
			header: "Depth Check",
			question: "Proceed with this headless milestone remediation plan?",
			options: [
				{
					label: "Yes, you got it (Recommended)",
					description: "Write the milestone context from the current understanding.",
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
			"# M001: Remediation Closeout",
			"",
			"## Goal",
			"Update one source module, let milestone validation find the missing status behavior, add a remediation slice, then close only after remediation passes.",
			"",
			"## Done",
			"- S01 changes `src/answer.js` and verifies the focused test.",
			"- Initial milestone validation records `needs-remediation` because `src/status.js` is still pending.",
			"- Roadmap reassessment adds S02 as remediation work.",
			"- S02 changes `src/status.js`, the full fixture test suite passes, and final validation passes.",
			"",
		].join("\n"),
	}, "context", { hasToolResultFor: "ask_user_questions" });
	pushTool(turns, "gsd_plan_milestone", {
		milestoneId: "M001",
		title: "Remediation Closeout",
		vision: "A validation gap is remediated through a real added slice before milestone completion.",
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
		successCriteria: [
			"answer() returns ready.",
			"status() returns done before milestone completion.",
			"The milestone closes only after remediation validation passes.",
		],
		keyRisks: [{
			risk: "A needs-remediation verdict may leave auto-mode blocked instead of adding executable remediation work.",
			whyItMatters: "This is the regression class under test.",
		}],
		proofStrategy: [{
			riskOrUnknown: "Remediation after milestone validation",
			retireIn: "S02",
			whatWillBeProven: "The stale validation is invalidated, remediation runs as a slice, and final closeout passes.",
		}],
		verificationContract: "Focused and full node:test commands exit 0.",
		verificationIntegration: "The full fixture command verifies both source modules together.",
		verificationOperational: "Headless process exits 0 without blocked or error notifications.",
		verificationUat: "Slice UAT summaries record pass verdicts.",
		definitionOfDone: [
			"`src/answer.js` is changed.",
			"`src/status.js` is changed by a remediation slice.",
			"Final milestone validation passes before completion.",
		],
		requirementCoverage: "R001 is owned by S01. R002 will be covered by remediation slice S02.",
		boundaryMapMarkdown: "| Boundary | Decision |\n| --- | --- |\n| Validation -> remediation | A needs-remediation verdict must add S02 before closeout. |\n",
	}, "roadmap", { hasToolResultFor: "gsd_summary_save" });
	pushText(turns, "Milestone M001 ready.", { hasToolResultFor: "gsd_plan_milestone" });

	pushTool(turns, "gsd_summary_save", {
		milestone_id: "M001",
		slice_id: "S01",
		artifact_type: "RESEARCH",
		content: "# S01 - Research\n\nUse `src/answer.js` and verify with `node --test test/answer.test.js`.\n",
	}, "s01-research");
	pushText(turns, "Slice S01 researched.", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "gsd_plan_slice", slicePlanInput("S01", "src/answer.js", "node --test test/answer.test.js", "answer() returns ready."), "s01-plan");
	pushText(turns, "Slice S01 planned.", { hasToolResultFor: "gsd_plan_slice" });
	pushTool(turns, "write", {
		path: "src/answer.js",
		content: "export function answer() {\n\treturn \"ready\";\n}\n",
	}, "write-answer");
	pushTool(turns, "bash", {
		command: "node --test test/answer.test.js",
		timeout: 30,
	}, "verify-answer", { hasToolResultFor: "write" });
	pushTool(turns, "gsd_task_complete", completeTaskInput("S01", "src/answer.js", "node --test test/answer.test.js", "Updated answer() to return ready."), "s01-task", { hasToolResultFor: "bash" });
	pushText(turns, "S01/T01 complete.", { hasToolResultFor: "gsd_task_complete" });
	pushTool(turns, "gsd_slice_complete", completeSliceInput("S01", "Update answer module", "src/answer.js", "node --test test/answer.test.js", "answer() now returns ready."), "s01-complete");
	pushText(turns, "Slice S01 complete.", { hasToolResultFor: "gsd_slice_complete" });

	pushTool(turns, "gsd_validate_milestone", {
		milestoneId: "M001",
		verdict: "needs-remediation",
		remediationRound: 0,
		successCriteriaChecklist: "- PASS: answer() returns ready.\n- FAIL: status() still returns pending.",
		sliceDeliveryAudit: "| Slice | Status | Evidence |\n| --- | --- | --- |\n| S01 | PASS | S01 summary and focused verification are present. |",
		crossSliceIntegration: "The full fixture cannot pass yet because the status module has not been remediated.",
		requirementCoverage: "R001 is covered by S01/T01. R002 is uncovered and requires remediation.",
		verificationClasses: "| Class | Planned Check | Evidence | Verdict |\n| --- | --- | --- | --- |\n| Contract | Focused and full node:test commands exit 0. | Focused command passed; full command is blocked by missing status behavior. | FAIL |\n| Integration | Both modules are verified together. | Not yet possible until status() returns done. | FAIL |\n| Operational | Headless process exits cleanly. | Still in progress. | PASS |\n| UAT | Slice UAT summaries pass. | S01 UAT passed. | PASS |",
		verdictRationale: "The initial slice passed, but milestone success requires status() to return done before closeout.",
		remediationPlan: "Add S02 to update src/status.js and run npm test.",
	}, "validate-remediation");
	pushTool(turns, "gsd_reassess_roadmap", {
		milestoneId: "M001",
		completedSliceId: "S01",
		verdict: "roadmap-adjusted",
		assessment: "Validation found missing status behavior. Add S02 as remediation before milestone completion.",
		sliceChanges: {
			modified: [],
			added: [{
				sliceId: "S02",
				title: "Remediate status module",
				risk: "medium",
				depends: ["S01"],
				demo: "The full fixture test suite passes.",
			}],
			removed: [],
		},
	}, "add-remediation-slice", { hasToolResultFor: "gsd_validate_milestone" });
	pushText(turns, "Remediation slice S02 added.", { hasToolResultFor: "gsd_reassess_roadmap" });

	pushTool(turns, "gsd_summary_save", {
		milestone_id: "M001",
		slice_id: "S02",
		artifact_type: "RESEARCH",
		content: "# S02 - Research\n\nUse `src/status.js` and verify both modules with `npm test`.\n",
	}, "s02-research");
	pushText(turns, "Slice S02 researched.", { hasToolResultFor: "gsd_summary_save" });
	pushTool(turns, "gsd_plan_slice", slicePlanInput("S02", "src/status.js", "npm test", "status() returns done."), "s02-plan");
	pushText(turns, "Slice S02 planned.", { hasToolResultFor: "gsd_plan_slice" });
	pushTool(turns, "write", {
		path: "src/status.js",
		content: "export function status() {\n\treturn \"done\";\n}\n",
	}, "write-status");
	pushTool(turns, "bash", {
		command: "npm test",
		timeout: 30,
	}, "verify-status", { hasToolResultFor: "write" });
	pushTool(turns, "gsd_task_complete", completeTaskInput("S02", "src/status.js", "npm test", "Updated status() to return done."), "s02-task", { hasToolResultFor: "bash" });
	pushText(turns, "S02/T01 complete.", { hasToolResultFor: "gsd_task_complete" });
	pushTool(turns, "gsd_slice_complete", completeSliceInput("S02", "Remediate status module", "src/status.js", "npm test", "status() now returns done."), "s02-complete");
	pushText(turns, "Slice S02 complete.", { hasToolResultFor: "gsd_slice_complete" });

	pushTool(turns, "gsd_validate_milestone", {
		milestoneId: "M001",
		verdict: "pass",
		remediationRound: 1,
		successCriteriaChecklist: "- PASS: answer() returns ready.\n- PASS: status() returns done.\n- PASS: milestone closes only after remediation validation passes.",
		sliceDeliveryAudit: "| Slice | Status | Evidence |\n| --- | --- | --- |\n| S01 | PASS | S01 summary and focused verification are present. |\n| S02 | PASS | S02 summary and full fixture verification are present. |",
		crossSliceIntegration: "The S02 `npm test` command verifies both modules together after remediation.",
		requirementCoverage: "R001 is covered by S01/T01. R002 is covered by S02/T01.",
		verificationClasses: "| Class | Planned Check | Evidence | Verdict |\n| --- | --- | --- | --- |\n| Contract | Focused and full node:test commands exit 0. | `node --test test/answer.test.js` and `npm test` exited 0. | PASS |\n| Integration | Both modules are verified together. | S02 `npm test` exercised both tests after remediation. | PASS |\n| Operational | Headless process exits cleanly. | No blocked/error operator notification was emitted. | PASS |\n| UAT | Slice UAT summaries pass. | S01 and S02 closeout UAT content recorded PASS. | PASS |",
		verdictRationale: "The remediation slice covered the previously missing status behavior and the full fixture test now passes.",
	}, "validate-pass");
	pushText(turns, "Milestone M001 validation complete - verdict: pass.", { hasToolResultFor: "gsd_validate_milestone" });
	pushTool(turns, "gsd_complete_milestone", {
		milestoneId: "M001",
		title: "Remediation Closeout",
		oneLiner: "Completed initial work, added remediation from validation, and verified the full fixture.",
		narrative: "The milestone completed S01, recorded a needs-remediation validation, reassessed the roadmap to add S02, completed S02, passed final validation, and then closed.",
		verificationPassed: true,
		successCriteriaResults: "- PASS: answer() returns ready.\n- PASS: status() returns done.\n- PASS: final validation passed before completion.",
		definitionOfDoneResults: "- PASS: both source modules changed.\n- PASS: remediation slice completed.\n- PASS: final milestone validation passed before completion.",
		requirementOutcomes: "R001 satisfied by S01/T01. R002 satisfied by remediation slice S02/T01.",
		keyDecisions: ["Use roadmap reassessment to convert validation gaps into executable remediation slices."],
		keyFiles: ["src/answer.js", "src/status.js"],
		lessonsLearned: ["A needs-remediation verdict must not become a terminal dead end when remediation work is added."],
		followUps: "None.",
		deviations: "The roadmap intentionally started with S01 only so validation could add S02.",
	}, "complete-milestone");
	pushText(turns, "Milestone M001 complete.", { hasToolResultFor: "gsd_complete_milestone" });

	return writeTranscript(turns);
}

describe("remediation milestone closeout e2e (fake LLM)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("headless new-milestone --auto remediates validation gaps before completion", { skip: skipReason ?? false, timeout: 240_000 }, (t) => {
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
			},
		}, null, 2) + "\n");

		const result = gsdSync(
			[
				"headless",
				"--output-format",
				"stream-json",
				"--model",
				"gsd-fake-model",
				"--timeout",
				"180000",
				"--max-restarts",
				"0",
				"--answers",
				answersPath,
				"new-milestone",
				"--context-text",
				"Make answer() return ready, remediate status() to return done if validation finds the gap, and verify with node:test.",
				"--auto",
			],
			{
				cwd: project.dir,
				timeoutMs: 210_000,
				env: {
					GSD_FAKE_LLM_TRANSCRIPT: buildTranscript(),
				},
			},
		);

		const artifacts = artifactsFor("remediation-milestone-closeout");
		artifacts.write("stdout.jsonl", result.stdout);
		artifacts.write("stderr.log", result.stderr);

		assert.equal(
			result.code,
			0,
			`expected exit 0, got code=${result.code} signal=${result.signal} timedOut=${result.timedOut}. stderr artifact: ${artifacts.dir}`,
		);
		assert.ok(!result.timedOut, "headless remediation run must not time out");

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

		assert.deepEqual(badOperatorSignals, [], `unexpected blocked/error operator signals: ${badOperatorSignals.join("\n")}`);
		assert.deepEqual(toolErrors, [], `unexpected tool errors:\n${toolErrors.join("\n")}`);
		assert.ok(toolNames.includes("gsd_reassess_roadmap"), "remediation must add a roadmap slice through gsd_reassess_roadmap");
		assert.equal(toolNames.filter((toolName) => toolName === "gsd_validate_milestone").length, 2, "validation must run before and after remediation");
		assert.ok(
			notifyMessages.some((message) => /auto-mode stopped/i.test(message) && /milestone m001 complete|all milestones complete/i.test(message)),
			`expected terminal auto-mode completion notification, got:\n${notifyMessages.join("\n")}`,
		);
		assert.doesNotThrow(
			() => execFileSync("npm", ["test"], { cwd: project.dir, stdio: "pipe" }),
			"full fixture verification command must pass after remediation completion",
		);

		assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "M001-VALIDATION.md")), "final milestone validation artifact is present");
		assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "M001-SUMMARY.md")), "milestone summary artifact is present");
		assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "slices", "S01", "S01-ASSESSMENT.md")), "roadmap reassessment artifact is present");
		for (const sliceId of ["S01", "S02"]) {
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "slices", sliceId, `${sliceId}-SUMMARY.md`)), `${sliceId} summary artifact is present`);
			assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "slices", sliceId, "tasks", "T01-SUMMARY.md")), `${sliceId}/T01 summary artifact is present`);
		}

		const db = new DatabaseSync(join(project.dir, ".gsd", "gsd.db"));
		t.after(() => db.close());
		assert.equal(scalar(db, "SELECT status AS value FROM milestones WHERE id = :id", { id: "M001" }), "complete");
		assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM slices WHERE milestone_id = :mid AND status = 'complete'", { mid: "M001" }), "2");
		assert.equal(scalar(db, "SELECT COUNT(*) AS value FROM tasks WHERE milestone_id = :mid AND status = 'complete'", { mid: "M001" }), "2");
		assert.equal(scalar(db, "SELECT status AS value FROM assessments WHERE milestone_id = :mid AND scope = 'milestone-validation'", { mid: "M001" }), "pass");
		assert.equal(scalar(db, "SELECT status AS value FROM assessments WHERE milestone_id = :mid AND scope = 'roadmap'", { mid: "M001" }), "roadmap-adjusted");
		assert.equal(
			scalar(
				db,
				"SELECT COUNT(*) AS value FROM quality_gates WHERE milestone_id = :mid AND scope = 'milestone' AND task_id = '' AND verdict = 'flag'",
				{ mid: "M001" },
			),
			"0",
		);
		assert.equal(
			scalar(
				db,
				"SELECT COUNT(*) AS value FROM quality_gates WHERE milestone_id = :mid AND scope = 'milestone' AND task_id = '' AND status = 'complete' AND verdict = 'pass'",
				{ mid: "M001" },
			),
			"4",
		);
	});
});
