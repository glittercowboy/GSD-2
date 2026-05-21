/**
 * GSD-2 — Shared MCP connection management.
 *
 * File Purpose: Reads, writes, and tests user-configured MCP server entries
 * for runtime tools, TUI commands, and app settings surfaces.
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { buildHttpTransportOpts, type McpHttpAuthConfig } from "./auth.js";
import { gsdHome } from "../gsd/gsd-home.js";

export type ManagedMcpTransport = "stdio" | "http" | "unsupported";
export type ManagedMcpSourceKind = "project-shared" | "project-local" | "global";

export interface ManagedMcpConfigSource {
	path: string;
	kind: ManagedMcpSourceKind;
	label: string;
}

export interface ManagedMcpServerConfig {
	name: string;
	transport: ManagedMcpTransport;
	sourcePath: string;
	sourceKind: ManagedMcpSourceKind;
	disabled: boolean;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	cwd?: string;
	headers?: Record<string, string>;
	oauth?: McpHttpAuthConfig["oauth"];
	envWarnings: string[];
}

export interface ManagedMcpServerInput {
	name: string;
	transport: Exclude<ManagedMcpTransport, "unsupported">;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	cwd?: string;
	headers?: Record<string, string>;
	oauth?: McpHttpAuthConfig["oauth"];
	disabled?: boolean;
	importedFrom?: {
		name?: string;
		sourcePath?: string;
		sourceTool?: string;
	};
}

export interface ManagedMcpStatus {
	servers: ManagedMcpServerConfig[];
	duplicates: Array<{
		name: string;
		keptSourcePath: string;
		shadowedSourcePath: string;
	}>;
	warnings: string[];
	localConfigPath: string;
}

export interface ManagedMcpConnectionTestResult {
	ok: boolean;
	server: string;
	transport: ManagedMcpTransport;
	toolCount: number;
	tools: string[];
	warnings: string[];
	error?: string;
}

interface RawMcpConfigFile {
	mcpServers?: Record<string, Record<string, unknown>>;
	servers?: Record<string, Record<string, unknown>>;
	[key: string]: unknown;
}

const CHILD_ENV_ALLOWLIST = new Set([
	"PATH",
	"Path",
	"HOME",
	"USER",
	"USERNAME",
	"USERPROFILE",
	"SHELL",
	"TMPDIR",
	"TEMP",
	"TMP",
	"SystemRoot",
	"WINDIR",
	"APPDATA",
	"LOCALAPPDATA",
	"XDG_CONFIG_HOME",
	"XDG_CACHE_HOME",
]);

let cachedStatus: ManagedMcpStatus | null = null;
let cachedStatusKey = "";

export function clearMcpConfigCache(): void {
	cachedStatus = null;
	cachedStatusKey = "";
}

export function getProjectLocalMcpConfigPath(projectDir = process.cwd()): string {
	return join(projectDir, ".gsd", "mcp.json");
}

export function getMcpConfigSources(
	projectDir = process.cwd(),
	gsdHomeDir = gsdHome(),
): ManagedMcpConfigSource[] {
	return [
		{ path: join(projectDir, ".mcp.json"), kind: "project-shared", label: "Project shared" },
		{ path: getProjectLocalMcpConfigPath(projectDir), kind: "project-local", label: "Project local" },
		{ path: join(gsdHomeDir, "mcp.json"), kind: "global", label: "Global" },
	];
}

export function readMcpManagementStatus(options: {
	projectDir?: string;
	gsdHomeDir?: string;
	refresh?: boolean;
	includeDisabled?: boolean;
} = {}): ManagedMcpStatus {
	const projectDir = options.projectDir ?? process.cwd();
	const gsdHomeDir = options.gsdHomeDir ?? gsdHome();
	const cacheKey = JSON.stringify({ projectDir, gsdHomeDir, includeDisabled: !!options.includeDisabled });
	if (!options.refresh && cachedStatus && cachedStatusKey === cacheKey) {
		return cachedStatus;
	}

	const seen = new Map<string, ManagedMcpServerConfig>();
	const servers: ManagedMcpServerConfig[] = [];
	const duplicates: ManagedMcpStatus["duplicates"] = [];
	const warnings: string[] = [];

	for (const source of getMcpConfigSources(projectDir, gsdHomeDir)) {
		const loaded = readRawConfigFile(source.path);
		if (!loaded.exists) continue;
		if (loaded.error) {
			warnings.push(`${source.path}: ${loaded.error}`);
			continue;
		}
		const mcpServers = loaded.data?.mcpServers ?? loaded.data?.servers;
		if (!mcpServers || typeof mcpServers !== "object") continue;

		for (const [name, rawConfig] of Object.entries(mcpServers)) {
			if (!rawConfig || typeof rawConfig !== "object") continue;
			const normalized = normalizeRawServerConfig(name, rawConfig, source);
			const existing = seen.get(name);
			if (existing) {
				duplicates.push({
					name,
					keptSourcePath: existing.sourcePath,
					shadowedSourcePath: source.path,
				});
				continue;
			}
			seen.set(name, normalized);
			if (!normalized.disabled || options.includeDisabled) {
				servers.push(normalized);
			}
		}
	}

	const status = {
		servers,
		duplicates,
		warnings,
		localConfigPath: getProjectLocalMcpConfigPath(projectDir),
	};
	cachedStatus = status;
	cachedStatusKey = cacheKey;
	return status;
}

export function readMcpServerConfigs(options: {
	projectDir?: string;
	gsdHomeDir?: string;
	refresh?: boolean;
	includeDisabled?: boolean;
} = {}): ManagedMcpServerConfig[] {
	return readMcpManagementStatus(options).servers;
}

export function getMcpServerConfig(
	name: string,
	options: { projectDir?: string; gsdHomeDir?: string; includeDisabled?: boolean } = {},
): ManagedMcpServerConfig | undefined {
	const trimmed = name.trim();
	return readMcpServerConfigs(options).find((server) =>
		server.name === trimmed ||
		server.name.toLowerCase() === trimmed.toLowerCase(),
	);
}

export function buildMcpChildEnv(configEnv: Record<string, string> | undefined): Record<string, string> {
	const childEnv: Record<string, string> = {};
	for (const key of CHILD_ENV_ALLOWLIST) {
		const value = process.env[key];
		if (typeof value === "string") childEnv[key] = value;
	}
	return {
		...childEnv,
		...(configEnv ? resolveMcpEnv(configEnv) : {}),
	};
}

export function resolveMcpEnv(env: Record<string, string>): Record<string, string> {
	const resolved: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		resolved[key] = typeof value === "string" ? resolveMcpString(value) : value;
	}
	return resolved;
}

export function resolveMcpString(value: string): string {
	return value.replace(
		/\$\{([^}]+)\}/g,
		(_match, varName) => process.env[varName] ?? "",
	);
}

export function upsertProjectLocalMcpServer(
	input: ManagedMcpServerInput,
	options: { projectDir?: string; previousName?: string } = {},
): ManagedMcpServerConfig {
	const projectDir = options.projectDir ?? process.cwd();
	const nextName = input.name.trim();
	if (!nextName) throw new Error("MCP server name is required.");

	const previousName = options.previousName?.trim();
	const existing = getMcpServerConfig(nextName, { projectDir, includeDisabled: true });
	if (existing && previousName !== nextName) {
		throw new Error(`MCP server "${nextName}" already exists in ${existing.sourcePath}. Rename the server before saving.`);
	}

	const configPath = getProjectLocalMcpConfigPath(projectDir);
	const file = readEditableConfigFile(configPath);
	if (previousName && previousName !== nextName) {
		delete file.mcpServers[previousName];
	}
	file.mcpServers[nextName] = serializeServerInput({ ...input, name: nextName });
	writeEditableConfigFile(configPath, file);
	clearMcpConfigCache();

	const saved = getMcpServerConfig(nextName, { projectDir, includeDisabled: true });
	if (!saved) throw new Error(`MCP server "${nextName}" was saved but could not be reloaded.`);
	return saved;
}

export function setProjectLocalMcpServerDisabled(
	name: string,
	disabled: boolean,
	options: { projectDir?: string } = {},
): ManagedMcpServerConfig {
	const projectDir = options.projectDir ?? process.cwd();
	const configPath = getProjectLocalMcpConfigPath(projectDir);
	const file = readEditableConfigFile(configPath);
	const current = file.mcpServers[name];
	if (!current) throw new Error(`MCP server "${name}" is not managed in ${configPath}. Import it before editing local state.`);
	current.disabled = disabled;
	writeEditableConfigFile(configPath, file);
	clearMcpConfigCache();
	const saved = getMcpServerConfig(name, { projectDir, includeDisabled: true });
	if (!saved) throw new Error(`MCP server "${name}" was updated but could not be reloaded.`);
	return saved;
}

export function deleteProjectLocalMcpServer(
	name: string,
	options: { projectDir?: string } = {},
): void {
	const projectDir = options.projectDir ?? process.cwd();
	const configPath = getProjectLocalMcpConfigPath(projectDir);
	const file = readEditableConfigFile(configPath);
	if (!file.mcpServers[name]) throw new Error(`MCP server "${name}" is not managed in ${configPath}.`);
	delete file.mcpServers[name];
	writeEditableConfigFile(configPath, file);
	clearMcpConfigCache();
}

export async function testMcpServerConnection(
	nameOrConfig: string | ManagedMcpServerConfig,
	options: {
		projectDir?: string;
		signal?: AbortSignal;
		timeoutMs?: number;
	} = {},
): Promise<ManagedMcpConnectionTestResult> {
	const config = typeof nameOrConfig === "string"
		? getMcpServerConfig(nameOrConfig, { projectDir: options.projectDir, includeDisabled: true })
		: nameOrConfig;
	if (!config) {
		return {
			ok: false,
			server: typeof nameOrConfig === "string" ? nameOrConfig : "",
			transport: "unsupported",
			toolCount: 0,
			tools: [],
			warnings: [],
			error: "Unknown MCP server.",
		};
	}
	if (config.disabled) {
		return {
			ok: false,
			server: config.name,
			transport: config.transport,
			toolCount: 0,
			tools: [],
			warnings: config.envWarnings,
			error: "MCP server is disabled.",
		};
	}
	if (config.transport === "unsupported") {
		return {
			ok: false,
			server: config.name,
			transport: config.transport,
			toolCount: 0,
			tools: [],
			warnings: config.envWarnings,
			error: "MCP server transport is unsupported.",
		};
	}
	if (config.envWarnings.length > 0) {
		return {
			ok: false,
			server: config.name,
			transport: config.transport,
			toolCount: 0,
			tools: [],
			warnings: config.envWarnings,
			error: "MCP server config references unset environment variables.",
		};
	}

	const client = new Client({ name: "gsd", version: "1.0.0" });
	let transport: StdioClientTransport | StreamableHTTPClientTransport | undefined;
	const timeout = options.timeoutMs ?? 30_000;
	try {
		if (config.transport === "stdio") {
			transport = new StdioClientTransport({
				command: config.command ?? "",
				args: config.args,
				env: buildMcpChildEnv(config.env),
				cwd: config.cwd,
				stderr: "pipe",
			});
		} else {
			const resolvedUrl = resolveMcpString(config.url ?? "");
			transport = new StreamableHTTPClientTransport(
				new URL(resolvedUrl),
				buildHttpTransportOpts({ headers: config.headers, oauth: config.oauth }),
			);
		}

		await client.connect(transport, { signal: options.signal, timeout });
		const result = await client.listTools(undefined, { signal: options.signal, timeout });
		const tools = (result.tools ?? []).map((tool) => tool.name);
		return {
			ok: true,
			server: config.name,
			transport: config.transport,
			toolCount: tools.length,
			tools,
			warnings: [],
		};
	} catch (error) {
		return {
			ok: false,
			server: config.name,
			transport: config.transport,
			toolCount: 0,
			tools: [],
			warnings: config.envWarnings,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		if (transport) {
			try {
				await transport.close();
			} catch {
				// Best-effort cleanup after test connection.
			}
		}
		try {
			await client.close();
		} catch {
			// Best-effort cleanup after test connection.
		}
	}
}

function readRawConfigFile(path: string): {
	exists: boolean;
	data?: RawMcpConfigFile;
	error?: string;
} {
	if (!existsSync(path)) return { exists: false };
	try {
		return { exists: true, data: JSON.parse(readFileSync(path, "utf-8")) as RawMcpConfigFile };
	} catch (error) {
		return { exists: true, error: error instanceof Error ? error.message : String(error) };
	}
}

function readEditableConfigFile(path: string): RawMcpConfigFile & { mcpServers: Record<string, Record<string, unknown>> } {
	const loaded = readRawConfigFile(path);
	if (loaded.error) throw new Error(`Unable to read MCP config ${path}: ${loaded.error}`);
	const data = loaded.data ?? {};
	const mcpServers = data.mcpServers && typeof data.mcpServers === "object" ? data.mcpServers : {};
	return { ...data, mcpServers };
}

function writeEditableConfigFile(path: string, data: RawMcpConfigFile): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function normalizeRawServerConfig(
	name: string,
	config: Record<string, unknown>,
	source: ManagedMcpConfigSource,
): ManagedMcpServerConfig {
	const transport = detectTransport(config);
	const env = isRecordOfStrings(config.env) ? config.env : undefined;
	const headers = isRecordOfStrings(config.headers) ? config.headers : undefined;
	const url = typeof config.url === "string" ? config.url : undefined;
	const command = typeof config.command === "string" ? config.command : undefined;
	return {
		name,
		transport,
		sourcePath: source.path,
		sourceKind: source.kind,
		disabled: config.disabled === true,
		...(command ? { command } : {}),
		args: Array.isArray(config.args) ? config.args.filter((arg): arg is string => typeof arg === "string") : undefined,
		env,
		...(url ? { url } : {}),
		cwd: typeof config.cwd === "string" ? config.cwd : undefined,
		headers,
		oauth: config.oauth && typeof config.oauth === "object" ? config.oauth as McpHttpAuthConfig["oauth"] : undefined,
		envWarnings: collectEnvWarnings([
			["url", url],
			...Object.entries(env ?? {}).map(([key, value]) => [`env.${key}`, value] as [string, string | undefined]),
			...Object.entries(headers ?? {}).map(([key, value]) => [`headers.${key}`, value] as [string, string | undefined]),
		]),
	};
}

function detectTransport(config: Record<string, unknown>): ManagedMcpTransport {
	const type = typeof config.type === "string" ? config.type.toLowerCase() : undefined;
	if (type && type !== "stdio" && type !== "http") return "unsupported";
	if (typeof config.command === "string") return "stdio";
	if (typeof config.url === "string" && type !== "stdio") return "http";
	return "unsupported";
}

function serializeServerInput(input: ManagedMcpServerInput): Record<string, unknown> {
	if (input.transport === "stdio") {
		if (!input.command?.trim()) throw new Error("Stdio MCP servers require a command.");
		return stripUndefined({
			type: "stdio",
			command: input.command.trim(),
			args: input.args,
			env: input.env,
			cwd: input.cwd,
			disabled: input.disabled === true ? true : undefined,
			_gsdImportedFrom: input.importedFrom,
		});
	}
	if (!input.url?.trim()) throw new Error("HTTP MCP servers require a URL.");
	return stripUndefined({
		type: "http",
		url: input.url.trim(),
		headers: input.headers,
		oauth: input.oauth,
		disabled: input.disabled === true ? true : undefined,
		_gsdImportedFrom: input.importedFrom,
	});
}

function collectEnvWarnings(values: Array<[string, string | undefined]>): string[] {
	const warnings: string[] = [];
	for (const [label, value] of values) {
		if (!value) continue;
		for (const match of value.matchAll(/\$\{([^}]+)\}/g)) {
			const varName = match[1];
			if (varName && process.env[varName] === undefined) {
				warnings.push(`${label} references unset environment variable ${varName}.`);
			}
		}
	}
	return warnings;
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.values(value).every((entry) => typeof entry === "string");
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
