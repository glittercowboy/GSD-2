// GSD-2 + Durable subagent run status, tracking names, and result artifact store.

import * as fs from "node:fs";
import * as path from "node:path";
import { randomInt } from "node:crypto";
import { getAgentDir } from "@gsd/pi-coding-agent";

export type SubagentRunMode = "single" | "parallel" | "chain";
export type SubagentRunStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted";

export interface SubagentChildArtifact {
	index: number;
	agent: string;
	trackingName?: string;
	task: string;
	status: SubagentRunStatus;
	exitCode?: number;
	cwd?: string;
	sessionFile?: string;
	startedAt?: string;
	completedAt?: string;
	output?: string;
	stderr?: string;
	errorMessage?: string;
	stopReason?: string;
	model?: string;
	usage?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens: number;
		turns: number;
	};
	merge?: {
		success: boolean;
		appliedPatches: string[];
		failedPatches: string[];
		error?: string;
	};
}

export interface SubagentRunRecord {
	schemaVersion: 1;
	runId: string;
	mode: SubagentRunMode;
	contextMode: "fresh" | "fork";
	status: SubagentRunStatus;
	cwd: string;
	startedAt: string;
	updatedAt: string;
	completedAt?: string;
	children: SubagentChildArtifact[];
	failure?: {
		type: "child-failed" | "merge-failed" | "interrupted" | "launch-failed";
		message: string;
	};
}

export function defaultSubagentRunStoreDir(): string {
	return path.join(getAgentDir(), "subagent-runs");
}

const TRACKING_ADJECTIVES = [
	"amber",
	"bright",
	"calm",
	"clear",
	"crisp",
	"daring",
	"keen",
	"lucky",
	"quiet",
	"steady",
	"swift",
	"vivid",
] as const;

const TRACKING_NOUNS = [
	"anchor",
	"atlas",
	"beacon",
	"canvas",
	"compass",
	"forge",
	"harbor",
	"lantern",
	"ledger",
	"mesa",
	"quartz",
	"ridge",
	"signal",
	"summit",
	"vector",
	"vista",
] as const;

export function createSubagentTrackingName(existingNames: ReadonlySet<string> = new Set()): string {
	const maxCombinations = TRACKING_ADJECTIVES.length * TRACKING_NOUNS.length;
	for (let attempt = 0; attempt < maxCombinations * 2; attempt++) {
		const adjective = TRACKING_ADJECTIVES[randomInt(TRACKING_ADJECTIVES.length)];
		const noun = TRACKING_NOUNS[randomInt(TRACKING_NOUNS.length)];
		const name = `${adjective}-${noun}`;
		if (!existingNames.has(name)) return name;
	}

	let suffix = existingNames.size + 1;
	while (existingNames.has(`agent-${suffix}`)) suffix++;
	return `agent-${suffix}`;
}

export class SubagentRunStore {
	private readonly baseDir: string;

	constructor(baseDir: string = defaultSubagentRunStoreDir()) {
		this.baseDir = baseDir;
	}

	getBaseDir(): string {
		return this.baseDir;
	}

	create(record: SubagentRunRecord): SubagentRunRecord {
		this.write(record);
		return record;
	}

	get(runId: string): SubagentRunRecord | null {
		const filePath = this.pathFor(runId);
		if (!fs.existsSync(filePath)) return null;
		try {
			const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<SubagentRunRecord>;
			if (
				!parsed ||
				typeof parsed !== "object" ||
				typeof parsed.runId !== "string" ||
				typeof parsed.updatedAt !== "string" ||
				!Array.isArray(parsed.children)
			) {
				return null;
			}
			return parsed as SubagentRunRecord;
		} catch {
			return null;
		}
	}

	update(runId: string, updater: (record: SubagentRunRecord) => SubagentRunRecord): SubagentRunRecord {
		const current = this.get(runId);
		if (!current) throw new Error(`Subagent run not found: ${runId}`);
		const next = updater({
			...current,
			children: current.children.map((child) => ({ ...child })),
		});
		next.updatedAt = new Date().toISOString();
		this.write(next);
		return next;
	}

	list(): SubagentRunRecord[] {
		if (!fs.existsSync(this.baseDir)) return [];
		return fs.readdirSync(this.baseDir)
			.filter((name) => name.endsWith(".json"))
			.map((name) => this.get(path.basename(name, ".json")))
			.filter((record): record is SubagentRunRecord => record !== null)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	private pathFor(runId: string): string {
		const safeRunId = runId.replace(/[^a-zA-Z0-9._-]/g, "_");
		return path.join(this.baseDir, `${safeRunId}.json`);
	}

	private write(record: SubagentRunRecord): void {
		fs.mkdirSync(this.baseDir, { recursive: true });
		const filePath = this.pathFor(record.runId);
		const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
		fs.writeFileSync(tmpPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
		fs.renameSync(tmpPath, filePath);
	}
}

export function createInitialRunRecord(input: {
	runId: string;
	mode: SubagentRunMode;
	contextMode: "fresh" | "fork";
	cwd: string;
	children: Array<{ agent: string; trackingName?: string; task: string; cwd?: string }>;
	now?: string;
}): SubagentRunRecord {
	const now = input.now ?? new Date().toISOString();
	return {
		schemaVersion: 1,
		runId: input.runId,
		mode: input.mode,
		contextMode: input.contextMode,
		status: "running",
		cwd: input.cwd,
		startedAt: now,
		updatedAt: now,
		children: input.children.map((child, index) => ({
			index,
			agent: child.agent,
			trackingName: child.trackingName,
			task: child.task,
			cwd: child.cwd,
			status: "queued",
		})),
	};
}

export function deriveRunStatus(children: readonly SubagentChildArtifact[]): SubagentRunStatus {
	if (children.some((child) => child.status === "interrupted")) return "interrupted";
	if (children.some((child) => child.status === "failed")) return "failed";
	if (children.length > 0 && children.every((child) => child.status === "succeeded")) return "succeeded";
	return "running";
}
