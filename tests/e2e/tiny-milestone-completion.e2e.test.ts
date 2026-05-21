// Project/App: GSD-2
// File Purpose: E2E gate for headless tiny milestone completion through auto-mode.

import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	artifactsFor,
	createTmpProject,
	gsdSync,
	parseJsonEvents,
	writeTranscript,
} from "./_shared/index.ts";

function binaryAvailable(): { ok: boolean; reason?: string } {
	const bin = process.env.GSD_SMOKE_BINARY;
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; build with `npm run build:core` and re-export." };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

function commitFixture(dir: string): void {
	execFileSync("git", ["add", "package.json", "src/answer.js", "test/answer.test.js"], { cwd: dir, stdio: "pipe" });
	execFileSync("git", ["commit", "-m", "test: seed tiny fixture"], { cwd: dir, stdio: "pipe" });
}

function scalar(db: DatabaseSync, sql: string, params: Record<string, string>): string | null {
	const row = db.prepare(sql).get(params) as { value?: string | null } | undefined;
	return row?.value ?? null;
}

function buildTranscript(): string {
	return writeTranscript([
		{
			turn: 1,
			expect: { modelId: "gsd-fake-model", lastUserText: "Headless Milestone Creation" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "project",
					name: "gsd_summary_save",
					input: {
						artifact_type: "PROJECT",
						content: [
							"# Project",
							"",
							"## Project Shape",
							"**Complexity:** simple",
							"",
							"## Milestone Sequence",
							"- [ ] M001: Tiny Source Verification - Update one source constant and prove it locally.",
							"",
						].join("\n"),
					},
				}],
			},
		},
		{
			turn: 2,
			expect: { hasToolResultFor: "gsd_summary_save" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "requirement",
					name: "gsd_requirement_save",
					input: {
						class: "core-capability",
						description: "The source module returns the requested ready value.",
						why: "The milestone needs one observable source behavior change.",
						source: "spec",
						status: "active",
						primary_owner: "S01",
						supporting_slices: "",
						validation: "The verification command exits 0.",
						notes: "Tiny milestone e2e gate fixture.",
					},
				}],
			},
		},
		{
			turn: 3,
			expect: { hasToolResultFor: "gsd_requirement_save" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "requirements",
					name: "gsd_summary_save",
					input: {
						artifact_type: "REQUIREMENTS",
						content: "# Requirements\n",
					},
				}],
			},
		},
		{
			turn: 4,
			expect: { hasToolResultFor: "gsd_summary_save" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "depth-check",
					name: "ask_user_questions",
					input: {
						questions: [{
							id: "depth_verification_M001_confirm",
							header: "Depth Check",
							question: "Proceed with this headless milestone plan?",
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
					},
				}],
			},
		},
		{
			turn: 5,
			expect: { hasToolResultFor: "ask_user_questions" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "context",
					name: "gsd_summary_save",
					input: {
						milestone_id: "M001",
						artifact_type: "CONTEXT",
						content: [
							"# M001: Tiny Source Verification",
							"",
							"## Goal",
							"Update `src/answer.js` so the exported function returns `ready`.",
							"",
							"## Done",
							"- Source behavior changes from `pending` to `ready`.",
							"- The local verification command exits 0.",
							"",
							"## Assumptions",
							"- This is intentionally a trivial single file change.",
							"- No external systems are involved.",
							"",
						].join("\n"),
					},
				}],
			},
		},
		{
			turn: 6,
			expect: { hasToolResultFor: "gsd_summary_save" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "roadmap",
					name: "gsd_plan_milestone",
					input: {
						milestoneId: "M001",
						title: "Tiny Source Verification",
						vision: "Trivial single file change to return ready from src/answer.js.",
						status: "active",
						slices: [{
							sliceId: "S01",
							title: "Update answer constant",
							risk: "low",
							depends: [],
							demo: "Calling answer() returns ready.",
							goal: "Change the exported answer value and verify it locally.",
							successCriteria: "answer() returns ready.",
							proofLevel: "Command exits 0.",
							integrationClosure: "Single local module only.",
							observabilityImpact: "None.",
						}],
						successCriteria: ["answer() returns ready."],
						keyRisks: [{
							risk: "The workflow may not close the milestone after a real source edit.",
							whyItMatters: "This is the regression class under test.",
						}],
						proofStrategy: [{
							riskOrUnknown: "Workflow completion after source edit",
							retireIn: "S01",
							whatWillBeProven: "The command exits 0 after the source edit.",
						}],
						verificationContract: "Local command exits 0.",
						verificationIntegration: "N/A",
						verificationOperational: "N/A",
						verificationUat: "N/A",
						definitionOfDone: [
							"`src/answer.js` is changed.",
							"The verification command exits 0.",
							"Milestone, slice, and task are complete in the database.",
						],
						requirementCoverage: "R001 is owned by S01.",
						boundaryMapMarkdown: "| Boundary | Decision |\n| --- | --- |\n| Source | `src/answer.js` only |\n",
					},
				}],
			},
		},
		{
			turn: 7,
			expect: { hasToolResultFor: "gsd_plan_milestone" },
			emit: { kind: "text", text: "Milestone M001 ready." },
		},
		{
			turn: 8,
			emit: {
				kind: "tool_use",
				calls: [{
					id: "research-slice",
					name: "gsd_summary_save",
					input: {
						milestone_id: "M001",
						slice_id: "S01",
						artifact_type: "RESEARCH",
						content: [
							"# S01 - Research",
							"",
							"## Summary",
							"The slice is intentionally tiny. The fixture contains one source file and one node:test file.",
							"",
							"## Recommendation",
							"Change `src/answer.js` and verify with `node --test test/answer.test.js`.",
							"",
							"## Implementation Landscape",
							"- `src/answer.js` - source behavior under test.",
							"- `test/answer.test.js` - verification command target.",
							"",
						].join("\n"),
					},
				}],
			},
		},
		{
			turn: 9,
			expect: { hasToolResultFor: "gsd_summary_save" },
			emit: { kind: "text", text: "Slice S01 researched." },
		},
		{
			turn: 10,
			emit: {
				kind: "tool_use",
				calls: [{
					id: "plan-slice",
					name: "gsd_plan_slice",
					input: {
						milestoneId: "M001",
						sliceId: "S01",
						goal: "Change the answer module and verify it.",
						successCriteria: "answer() returns ready.",
						proofLevel: "Run the node:test command.",
						integrationClosure: "Single local module only.",
						observabilityImpact: "None.",
						tasks: [{
							taskId: "T01",
							title: "Update answer module",
							description: "Change `src/answer.js` so `answer()` returns `ready`, then run the verification command.",
							estimate: "5m",
							files: ["src/answer.js"],
							verify: "node --test test/answer.test.js",
							inputs: ["src/answer.js", "test/answer.test.js"],
							expectedOutput: ["src/answer.js"],
							observabilityImpact: "None.",
						}],
					},
				}],
			},
		},
		{
			turn: 11,
			expect: { hasToolResultFor: "gsd_plan_slice" },
			emit: { kind: "text", text: "Slice S01 planned." },
		},
		{
			turn: 12,
			emit: {
				kind: "tool_use",
				calls: [{
					id: "write-source",
					name: "write",
					input: {
						path: "src/answer.js",
						content: "export function answer() {\n\treturn \"ready\";\n}\n",
					},
				}],
			},
		},
		{
			turn: 13,
			expect: { hasToolResultFor: "write" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "verify-source",
					name: "bash",
					input: {
						command: "node --test test/answer.test.js",
						timeout: 30,
					},
				}],
			},
		},
		{
			turn: 14,
			expect: { hasToolResultFor: "bash" },
			emit: {
				kind: "tool_use",
				calls: [{
					id: "complete-task",
					name: "gsd_task_complete",
					input: {
						taskId: "T01",
						sliceId: "S01",
						milestoneId: "M001",
						oneLiner: "Updated answer() to return ready.",
						narrative: "Changed the answer module and verified the behavior with the planned command.",
						verification: "`node --test test/answer.test.js` exited 0.",
						deviations: "None.",
						knownIssues: "None.",
						keyFiles: ["src/answer.js"],
						keyDecisions: ["Keep the fixture to one source file so the workflow signal is isolated."],
						blockerDiscovered: false,
						verificationEvidence: [{
							command: "node --test test/answer.test.js",
							exitCode: 0,
							verdict: "pass",
							durationMs: 100,
						}],
					},
				}],
			},
		},
		{
			turn: 15,
			expect: { hasToolResultFor: "gsd_task_complete" },
			emit: { kind: "text", text: "Task T01 complete." },
		},
		{
			turn: 16,
			emit: {
				kind: "tool_use",
				calls: [{
					id: "complete-slice",
					name: "gsd_slice_complete",
					input: {
						sliceId: "S01",
						milestoneId: "M001",
						sliceTitle: "Update answer constant",
						oneLiner: "The answer module now returns ready.",
						narrative: "The only planned task changed the source module and verified the behavior.",
						verification: "`node --test test/answer.test.js` exited 0.",
						uatContent: "# UAT\n\nPASS: answer() returns ready.\n",
						deviations: "None.",
						knownLimitations: "None.",
						followUps: "None.",
						keyFiles: ["src/answer.js"],
						keyDecisions: ["Keep the milestone fixture intentionally tiny."],
						filesModified: [{ path: "src/answer.js", description: "answer() now returns ready." }],
					},
				}],
			},
		},
		{
			turn: 17,
			expect: { hasToolResultFor: "gsd_slice_complete" },
			emit: { kind: "text", text: "Slice S01 complete." },
		},
		{
			turn: 18,
			emit: {
				kind: "tool_use",
				calls: [{
					id: "validate-milestone",
					name: "gsd_validate_milestone",
					input: {
						milestoneId: "M001",
						verdict: "pass",
						remediationRound: 0,
						successCriteriaChecklist: "- PASS: answer() returns ready. Evidence: S01 summary and task verification.",
						sliceDeliveryAudit: "| Slice | Status | Evidence |\n| --- | --- | --- |\n| S01 | PASS | S01 summary and task summary are present. |",
						crossSliceIntegration: "Single-slice milestone; no cross-slice boundary exists.",
						requirementCoverage: "R001 is covered by S01/T01 and verified by `node --test test/answer.test.js`.",
						verificationClasses: "| Class | Planned Check | Evidence | Verdict |\n| --- | --- | --- | --- |\n| Contract | Local command exits 0. | `node --test test/answer.test.js` exited 0 in T01. | PASS |",
						verdictRationale: "All planned source, task, slice, requirement, and contract evidence passed.",
					},
				}],
			},
		},
		{
			turn: 19,
			expect: { hasToolResultFor: "gsd_validate_milestone" },
			emit: { kind: "text", text: "Milestone M001 validation complete - verdict: pass." },
		},
		{
			turn: 20,
			emit: {
				kind: "tool_use",
				calls: [{
					id: "complete-milestone",
					name: "gsd_complete_milestone",
					input: {
						milestoneId: "M001",
						title: "Tiny Source Verification",
						oneLiner: "Updated one source module and verified it locally.",
						narrative: "The milestone planned one slice, changed `src/answer.js`, ran the planned verification command, completed the task and slice, and then closed the milestone.",
						verificationPassed: true,
						successCriteriaResults: "- PASS: answer() returns ready.",
						definitionOfDoneResults: "- PASS: source changed.\n- PASS: verification command exited 0.",
						requirementOutcomes: "R001 satisfied by S01/T01.",
						keyDecisions: ["Use a tiny isolated fixture for the milestone completion gate."],
						keyFiles: ["src/answer.js"],
						lessonsLearned: ["The e2e gate exercises the real workflow process."],
						followUps: "None.",
						deviations: "None.",
					},
				}],
			},
		},
		{
			turn: 21,
			expect: { hasToolResultFor: "gsd_complete_milestone" },
			emit: { kind: "text", text: "Milestone M001 complete." },
		},
	]);
}

describe("tiny milestone completion e2e (fake LLM)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("headless new-milestone --auto completes a verified source change", { skip: skipReason ?? false, timeout: 180_000 }, (t) => {
		const project = createTmpProject({
			git: true,
			files: {
				"package.json": JSON.stringify({ type: "module", scripts: { test: "node --test test/answer.test.js" } }, null, 2) + "\n",
				"src/answer.js": "export function answer() {\n\treturn \"pending\";\n}\n",
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

		const transcript = buildTranscript();
		const result = gsdSync(
			[
				"headless",
				"--output-format",
				"stream-json",
				"--model",
				"gsd-fake-model",
				"--timeout",
				"120000",
				"--max-restarts",
				"0",
				"--answers",
				answersPath,
				"new-milestone",
				"--context-text",
				"Make answer() return ready in src/answer.js and verify with node:test.",
				"--auto",
			],
			{
				cwd: project.dir,
				timeoutMs: 150_000,
				env: {
					GSD_FAKE_LLM_TRANSCRIPT: transcript,
				},
			},
		);

		const artifacts = artifactsFor("tiny-milestone-completion");
		artifacts.write("stdout.jsonl", result.stdout);
		artifacts.write("stderr.log", result.stderr);

		assert.equal(
			result.code,
			0,
			`expected exit 0, got code=${result.code} signal=${result.signal} timedOut=${result.timedOut}. stderr artifact: ${artifacts.dir}`,
		);
		assert.ok(!result.timedOut, "headless milestone run must not time out");

		const events = parseJsonEvents(result.stdoutClean);
		const notifyMessages = events
			.filter((event) => event.type === "extension_ui_request" && event.method === "notify")
			.map((event) => String(event.message ?? ""));
		const badOperatorSignals = notifyMessages.filter((message) =>
			/blocked:|failed|cannot complete|cannot validate|stopped with an issue/i.test(message),
		);
		assert.deepEqual(badOperatorSignals, [], `unexpected blocked/error operator signals: ${badOperatorSignals.join("\n")}`);
		assert.ok(
			notifyMessages.some((message) => /auto-mode stopped/i.test(message) && /milestone m001 complete|all milestones complete/i.test(message)),
			`expected terminal auto-mode completion notification, got:\n${notifyMessages.join("\n")}`,
		);

		assert.doesNotThrow(
			() => execFileSync("node", ["--test", "test/answer.test.js"], { cwd: project.dir, stdio: "pipe" }),
			"fixture verification command must pass after milestone completion",
		);
		assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "M001-SUMMARY.md")), "milestone summary artifact is present");
		assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md")), "slice summary artifact is present");
		assert.ok(existsSync(join(project.dir, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md")), "task summary artifact is present");

		const db = new DatabaseSync(join(project.dir, ".gsd", "gsd.db"));
		t.after(() => db.close());
		assert.equal(
			scalar(db, "SELECT status AS value FROM milestones WHERE id = :id", { id: "M001" }),
			"complete",
		);
		assert.equal(
			scalar(db, "SELECT status AS value FROM slices WHERE milestone_id = :mid AND id = :sid", { mid: "M001", sid: "S01" }),
			"complete",
		);
		assert.equal(
			scalar(db, "SELECT status AS value FROM tasks WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid", {
				mid: "M001",
				sid: "S01",
				tid: "T01",
			}),
			"complete",
		);
	});
});
