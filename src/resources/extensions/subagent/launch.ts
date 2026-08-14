// GSD-2 + Subagent launch contract and child process safety helpers.

import * as fs from "node:fs";
import * as path from "node:path";
import { SessionManager } from "@gsd/pi-coding-agent";
import type { AgentConfig } from "./agents.js";

export const SUBAGENT_CHILD_ENV_VAR = "GSD_SUBAGENT_CHILD";
export const SUBAGENT_CHILD_ENV_VALUE = "1";
export const SUBAGENT_CURRENT_AGENT_ENV_VAR = "GSD_SUBAGENT_CURRENT_AGENT";
export const SUBAGENT_PARENT_AGENT_ENV_VAR = "GSD_SUBAGENT_PARENT_AGENT";
export const SUBAGENT_DELEGATION_DEPTH_ENV_VAR = "GSD_SUBAGENT_DELEGATION_DEPTH";

// These are intentionally string constants rather than an extension import: GSD
// remains usable without WXCode, while a governed child still receives the
// identity/depth that the execution-routing extension validates.
const WXCODE_CURRENT_AGENT_ENV_VAR = "WXCODE_EXECUTION_ROUTING_CURRENT_AGENT";
const WXCODE_DELEGATION_DEPTH_ENV_VAR = "WXCODE_EXECUTION_ROUTING_DEPTH";

export type SubagentContextMode = "fresh" | "fork";

export type SubagentSessionArgs =
	| { mode: "fresh" }
	| { mode: "fork"; sessionFile: string; sessionDir?: string };

export interface SubagentParentSessionManager {
	getSessionFile(): string | undefined;
	getLeafId(): string | null;
	getSessionDir(): string;
}

export interface SubagentLaunchInput {
	agent: AgentConfig;
	task: string;
	tmpPromptPath: string | null;
	modelOverride?: string;
	contextMode?: SubagentContextMode;
	parentSessionManager?: SubagentParentSessionManager;
	session?: SubagentSessionArgs;
	cwd?: string;
	defaultCwd: string;
}

export interface SubagentLaunchPlan {
	args: string[];
	env: NodeJS.ProcessEnv;
	cwd: string;
	session: SubagentSessionArgs;
}

export function isSubagentChildProcess(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[SUBAGENT_CHILD_ENV_VAR] === SUBAGENT_CHILD_ENV_VALUE;
}

function parseDelegationDepth(value: string | undefined): number {
	if (!value || !/^(0|[1-9]\d*)$/.test(value)) return 0;
	const depth = Number(value);
	return Number.isSafeInteger(depth) ? depth : 0;
}

export function buildSubagentProcessEnv(
	env: NodeJS.ProcessEnv = process.env,
	childAgentName?: string,
): NodeJS.ProcessEnv {
	const childEnv: NodeJS.ProcessEnv = {
		...env,
		[SUBAGENT_CHILD_ENV_VAR]: SUBAGENT_CHILD_ENV_VALUE,
	};
	if (!childAgentName) return childEnv;

	const parentAgent = env[SUBAGENT_CURRENT_AGENT_ENV_VAR] ?? env[WXCODE_CURRENT_AGENT_ENV_VAR];
	const parentDepth = parseDelegationDepth(
		env[SUBAGENT_DELEGATION_DEPTH_ENV_VAR] ?? env[WXCODE_DELEGATION_DEPTH_ENV_VAR],
	);
	const childDepth = String(parentDepth + 1);
	childEnv[SUBAGENT_CURRENT_AGENT_ENV_VAR] = childAgentName;
	childEnv[SUBAGENT_DELEGATION_DEPTH_ENV_VAR] = childDepth;
	if (parentAgent) childEnv[SUBAGENT_PARENT_AGENT_ENV_VAR] = parentAgent;

	if (env[WXCODE_CURRENT_AGENT_ENV_VAR] !== undefined || env[WXCODE_DELEGATION_DEPTH_ENV_VAR] !== undefined) {
		childEnv[WXCODE_CURRENT_AGENT_ENV_VAR] = childAgentName;
		childEnv[WXCODE_DELEGATION_DEPTH_ENV_VAR] = childDepth;
	}
	return childEnv;
}

export function buildShellEnvAssignments(env: NodeJS.ProcessEnv = process.env): string[] {
	const names = [
		SUBAGENT_CHILD_ENV_VAR,
		SUBAGENT_CURRENT_AGENT_ENV_VAR,
		SUBAGENT_PARENT_AGENT_ENV_VAR,
		SUBAGENT_DELEGATION_DEPTH_ENV_VAR,
		WXCODE_CURRENT_AGENT_ENV_VAR,
		WXCODE_DELEGATION_DEPTH_ENV_VAR,
	];
	return names.flatMap((name) => env[name] === undefined ? [] : [`${name}=${JSON.stringify(env[name])}`]);
}

export function buildSubagentProcessArgs(
	agent: AgentConfig,
	task: string,
	tmpPromptPath: string | null,
	modelOverride?: string,
	session: SubagentSessionArgs = { mode: "fresh" },
): string[] {
	const args: string[] = ["--mode", "json", "-p"];
	if (session.mode === "fork") {
		args.push("--session", session.sessionFile);
		if (session.sessionDir) args.push("--session-dir", session.sessionDir);
	} else {
		args.push("--no-session");
	}
	const effectiveModel = modelOverride ?? agent.model;
	if (effectiveModel) args.push("--model", effectiveModel);
	// Thinking is part of the named agent contract; a caller-supplied model
	// override must never erase the snapshot materialized reasoning policy.
	if (agent.thinking) args.push("--thinking", agent.thinking);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
	if (tmpPromptPath) args.push("--append-system-prompt", tmpPromptPath);
	args.push(`Task: ${task}`);
	return args;
}

export function resolveSubagentSessionArgs(
	contextMode: SubagentContextMode = "fresh",
	parentSessionManager?: SubagentParentSessionManager,
): SubagentSessionArgs {
	if (contextMode === "fresh") return { mode: "fresh" };

	if (!parentSessionManager) {
		throw new Error("Forked subagent context requires a parent session manager.");
	}

	const parentSessionFile = parentSessionManager.getSessionFile();
	if (!parentSessionFile) {
		throw new Error("Forked subagent context requires a persisted parent session file; current session is in-memory.");
	}
	if (!fs.existsSync(parentSessionFile)) {
		throw new Error(`Forked subagent context could not read parent session file: ${parentSessionFile}`);
	}

	const leafId = parentSessionManager.getLeafId();
	if (!leafId) {
		throw new Error("Forked subagent context requires a parent session leaf to branch from.");
	}

	const sessionDir = parentSessionManager.getSessionDir?.();
	const parentSession = SessionManager.open(parentSessionFile, sessionDir);
	const childSessionFile = parentSession.createBranchedSession(leafId);
	if (!childSessionFile) {
		throw new Error("Forked subagent context could not create a branched child session.");
	}

	return {
		mode: "fork",
		sessionFile: childSessionFile,
		...(sessionDir ? { sessionDir: path.resolve(sessionDir) } : {}),
	};
}

export function createSubagentLaunchPlan(input: SubagentLaunchInput): SubagentLaunchPlan {
	const session = input.session ?? resolveSubagentSessionArgs(input.contextMode ?? "fresh", input.parentSessionManager);
	return {
		args: buildSubagentProcessArgs(
			input.agent,
			input.task,
			input.tmpPromptPath,
			input.modelOverride,
			session,
		),
		env: buildSubagentProcessEnv(process.env, input.agent.name),
		cwd: input.cwd ?? input.defaultCwd,
		session,
	};
}
