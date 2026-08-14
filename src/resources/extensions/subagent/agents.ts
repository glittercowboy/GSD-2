/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@gsd/pi-coding-agent";

const PROJECT_AGENT_DIR_CANDIDATES = [".gsd", ".pi"] as const;

export type AgentScope = "user" | "project" | "both";

/** CLI thinking levels accepted by the embedded OpenCode-compatible runtime. */
export type AgentThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const AGENT_THINKING_LEVELS = new Set<AgentThinkingLevel>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	/** Normalized from either the OpenCode `variant` or native `thinking` frontmatter. */
	thinking?: AgentThinkingLevel;
	conflictsWith?: string[];
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

interface AgentFrontmatter extends Record<string, unknown> {
	name?: string;
	description?: string;
	tools?: string | string[];
	model?: string;
	/** OpenCode-compatible name for the requested thinking/reasoning level. */
	variant?: string;
	/** Native CLI name for the requested thinking/reasoning level. */
	thinking?: string;
	conflicts_with?: string;
}

export function parseConflictsWith(value: string | undefined): string[] | undefined {
	if (typeof value !== "string") return undefined;
	const conflicts = value.split(",").map((s) => s.trim()).filter(Boolean);
	return conflicts.length > 0 ? conflicts : undefined;
}

function parseAgentTools(value: string | string[] | undefined): string[] | undefined {
	if (typeof value === "string") {
		const tools = value
			.split(",")
			.map((tool) => tool.trim())
			.filter(Boolean);
		return tools.length > 0 ? tools : undefined;
	}

	if (Array.isArray(value)) {
		const tools = value
			.flatMap((tool) => typeof tool === "string" ? tool.split(",") : [])
			.map((tool) => tool.trim())
			.filter(Boolean);
		return tools.length > 0 ? tools : undefined;
	}

	return undefined;
}

function parseAgentThinkingLevel(variant: unknown, thinking: unknown): AgentThinkingLevel | undefined {
	// `thinking` is the native spelling. `variant` is accepted for materialized
	// OpenCode agent definitions, so either form produces the same child CLI flag.
	const candidate = typeof thinking === "string" ? thinking : typeof variant === "string" ? variant : undefined;
	return candidate && AGENT_THINKING_LEVELS.has(candidate as AgentThinkingLevel)
		? candidate as AgentThinkingLevel
		: undefined;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);

		if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") {
			continue;
		}

		const tools = parseAgentTools(frontmatter.tools);
		const conflictsWith = parseConflictsWith(frontmatter.conflicts_with);
		const thinking = parseAgentThinkingLevel(frontmatter.variant, frontmatter.thinking);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			thinking,
			conflictsWith,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		// Prefer the documented project-local location while preserving support
		// for older workarounds that placed agents under .pi/agents.
		for (const configDir of PROJECT_AGENT_DIR_CANDIDATES) {
			const candidate = path.join(currentDir, configDir, "agents");
			if (isDirectory(candidate)) return candidate;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = new Map<string, AgentConfig>();

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
