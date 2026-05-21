// GSD-2 — Web MCP management contract tests.
// File Purpose: Verifies the app-facing MCP service uses the shared manager.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectMcpManagementData,
  mutateMcpManagement,
} from "../../web/mcp-management-service.ts";

test("web MCP management service lists, saves, disables, and deletes local servers", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "web-mcp-project-"));
  const gsdHomeDir = mkdtempSync(join(tmpdir(), "web-mcp-home-"));
  const previousGsdHome = process.env.GSD_HOME;
  try {
    process.env.GSD_HOME = gsdHomeDir;
    mkdirSync(join(projectDir, ".gsd"), { recursive: true });
    writeFileSync(
      join(projectDir, ".mcp.json"),
      JSON.stringify({ mcpServers: { shared: { command: "node", args: ["shared.js"] } } }),
      "utf-8",
    );

    const listed = await collectMcpManagementData(projectDir);
    assert.ok(listed.servers.some((server) => server.name === "shared"));

    const saved = await mutateMcpManagement({
      action: "save",
      server: { name: "local", transport: "stdio", command: "node", args: ["local.js"] },
    }, projectDir);
    assert.equal(saved.status, "ok");
    if (saved.status === "ok") {
      assert.ok(saved.data.servers.some((server) => server.name === "local" && server.sourceKind === "project-local"));
    }

    const disabled = await mutateMcpManagement({ action: "disable", name: "local" }, projectDir);
    assert.equal(disabled.status, "ok");
    if (disabled.status === "ok") {
      assert.equal(disabled.data.servers.find((server) => server.name === "local")?.disabled, true);
    }

    const deleted = await mutateMcpManagement({ action: "delete", name: "local" }, projectDir);
    assert.equal(deleted.status, "ok");
    if (deleted.status === "ok") {
      assert.equal(deleted.data.servers.some((server) => server.name === "local"), false);
    }
  } finally {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(gsdHomeDir, { recursive: true, force: true });
  }
});
