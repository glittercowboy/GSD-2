/**
 * GSD-2 — MCP manager tests.
 *
 * File Purpose: Behaviour coverage for shared MCP config management and
 * side-effect-free connection testing.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
	clearMcpConfigCache,
	deleteProjectLocalMcpServer,
	readMcpManagementStatus,
	readMcpServerConfigs,
	setProjectLocalMcpServerDisabled,
	testMcpServerConnection,
	upsertProjectLocalMcpServer,
	type ManagedMcpServerConfig,
} from "../manager.js";

function makeProject(): { projectDir: string; gsdHomeDir: string; cleanup: () => void } {
	const projectDir = mkdtempSync(join(tmpdir(), "gsd-mcp-manager-project-"));
	const gsdHomeDir = mkdtempSync(join(tmpdir(), "gsd-mcp-manager-home-"));
	mkdirSync(join(projectDir, ".gsd"), { recursive: true });
	return {
		projectDir,
		gsdHomeDir,
		cleanup: () => {
			rmSync(projectDir, { recursive: true, force: true });
			rmSync(gsdHomeDir, { recursive: true, force: true });
			clearMcpConfigCache();
		},
	};
}

test("MCP manager reads sources with precedence, disabled state, duplicates, and env warnings", () => {
	const previousToken = process.env.MISSING_MANAGER_TOKEN;
	delete process.env.MISSING_MANAGER_TOKEN;
	const { projectDir, gsdHomeDir, cleanup } = makeProject();
	try {
		writeFileSync(
			join(projectDir, ".mcp.json"),
			JSON.stringify({
				mcpServers: {
					shared: { command: "node", args: ["shared.js"] },
					warned: { url: "https://example.test/${MISSING_MANAGER_TOKEN}" },
				},
			}),
			"utf-8",
		);
		writeFileSync(
			join(projectDir, ".gsd", "mcp.json"),
			JSON.stringify({
				mcpServers: {
					local: { command: "node", disabled: true },
				},
			}),
			"utf-8",
		);
		writeFileSync(
			join(gsdHomeDir, "mcp.json"),
			JSON.stringify({
				mcpServers: {
					shared: { command: "node", args: ["global.js"] },
				},
			}),
			"utf-8",
		);

		const status = readMcpManagementStatus({ projectDir, gsdHomeDir, includeDisabled: true, refresh: true });
		assert.deepEqual(status.servers.map((server) => server.name), ["shared", "warned", "local"]);
		assert.equal(status.servers.find((server) => server.name === "local")?.disabled, true);
		assert.equal(status.duplicates[0]?.name, "shared");
		assert.match(status.servers.find((server) => server.name === "warned")?.envWarnings[0] ?? "", /MISSING_MANAGER_TOKEN/);

		const runtimeServers = readMcpServerConfigs({ projectDir, gsdHomeDir, refresh: true });
		assert.deepEqual(runtimeServers.map((server) => server.name), ["shared", "warned"]);
	} finally {
		if (previousToken === undefined) delete process.env.MISSING_MANAGER_TOKEN;
		else process.env.MISSING_MANAGER_TOKEN = previousToken;
		cleanup();
	}
});

test("MCP manager writes local config and blocks duplicate names unless renamed", () => {
	const { projectDir, cleanup } = makeProject();
	try {
		writeFileSync(
			join(projectDir, ".mcp.json"),
			JSON.stringify({ mcpServers: { existing: { command: "node" } } }),
			"utf-8",
		);

		assert.throws(
			() => upsertProjectLocalMcpServer({ name: "existing", transport: "stdio", command: "node" }, { projectDir }),
			/already exists/,
		);

		const saved = upsertProjectLocalMcpServer(
			{ name: "local-server", transport: "stdio", command: "node", args: ["server.js"], disabled: true },
			{ projectDir },
		);
		assert.equal(saved.sourceKind, "project-local");
		assert.equal(saved.disabled, true);

		const enabled = setProjectLocalMcpServerDisabled("local-server", false, { projectDir });
		assert.equal(enabled.disabled, false);

		deleteProjectLocalMcpServer("local-server", { projectDir });
		const raw = JSON.parse(readFileSync(join(projectDir, ".gsd", "mcp.json"), "utf-8")) as { mcpServers: Record<string, unknown> };
		assert.equal(raw.mcpServers["local-server"], undefined);
	} finally {
		cleanup();
	}
});

test("MCP connection test performs handshake and tools/list without invoking tools", async () => {
	const { projectDir, cleanup } = makeProject();
	try {
		const require = createRequire(import.meta.url);
		const mcpModuleUrl = pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/mcp.js")).href;
		const stdioModuleUrl = pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/stdio.js")).href;
		const calledPath = join(projectDir, "called-tool.txt");
		const serverPath = join(projectDir, "fake-mcp-server.mjs");
		writeFileSync(
			serverPath,
			[
				`const { McpServer } = await import(${JSON.stringify(mcpModuleUrl)});`,
				`const { StdioServerTransport } = await import(${JSON.stringify(stdioModuleUrl)});`,
				'import { writeFileSync } from "node:fs";',
				`const calledPath = ${JSON.stringify(calledPath)};`,
				'const server = new McpServer({ name: "fake", version: "1.0.0" }, { capabilities: { tools: {} } });',
				'server.tool("fake_tool", "Should not be invoked by test connection", {}, async () => {',
				'  writeFileSync(calledPath, "called", "utf-8");',
				'  return { content: [{ type: "text", text: "called" }] };',
				'});',
				'await server.connect(new StdioServerTransport());',
			].join("\n"),
			"utf-8",
		);

		const result = await testMcpServerConnection({
			name: "fake",
			transport: "stdio",
			sourcePath: join(projectDir, ".gsd", "mcp.json"),
			sourceKind: "project-local",
			disabled: false,
			command: process.execPath,
			args: [serverPath],
			envWarnings: [],
		} satisfies ManagedMcpServerConfig, { projectDir, timeoutMs: 10_000 });

		assert.equal(result.ok, true, result.error);
		assert.deepEqual(result.tools, ["fake_tool"]);
		assert.equal(existsSync(calledPath), false, "connection test must not invoke MCP tools");
	} finally {
		cleanup();
	}
});
