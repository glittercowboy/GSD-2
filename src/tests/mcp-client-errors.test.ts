import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/resources/extensions/mcp-client/index.ts"), "utf8");

test("mcp client captures sourcePath for configured servers", () => {
  assert.ok(source.includes("sourcePath: configPath"));
});

test("mcp client surfaces missing stdio command path", () => {
  assert.ok(source.includes("missing command path"));
});

test("mcp client surfaces missing stdio script path", () => {
  assert.ok(source.includes("missing script path"));
});

test("mcp client upgrades timeout errors with handshake guidance", () => {
  assert.ok(source.includes("did not complete the MCP handshake within 30s"));
});

test("mcp client upgrades connection closed errors with startup output guidance", () => {
  assert.ok(source.includes("The server process exited before responding to MCP requests."));
  assert.ok(source.includes("Startup output:"));
});
