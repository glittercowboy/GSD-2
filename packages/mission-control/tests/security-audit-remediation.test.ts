/**
 * Regression tests for the 4 audit findings fixed in Plan 20.2.6-01.
 *
 * FS-9  — kill-port.ts regex typo (/s+/ → /\s+/)
 * FE-5  — CodeExplorer.tsx: sanitizeHtml wrapper, not DOMPurify directly
 * FE-6  — InlineReadPanel.tsx: sanitizeHtml wrapper, not DOMPurify directly
 * API-6 — empty/missing Host header must be rejected with 400
 * API-4 — POST /api/trust with non-.gsd dir must be rejected with 400
 *
 * Source-inspection tests (FS-9, FE-5/FE-6) run without a live server.
 * HTTP tests (API-6, API-4) share one server instance via beforeAll/afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestServer, makeRequest } from "./security-test-helpers";

const ROOT = resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// FS-9 — kill-port.ts whitespace regex (source-text inspection)
// ---------------------------------------------------------------------------

describe("FS-9 — kill-port.ts whitespace regex", () => {
  it("uses /\\s+/ regex, not /s+/", () => {
    const src = readFileSync(resolve(ROOT, "src/server/kill-port.ts"), "utf-8");
    // Must contain the correct \s+ regex
    expect(src).toContain("split(/\\s+/)");
    // Must NOT contain the buggy /s+/ literal
    expect(src).not.toMatch(/split\(\/s\+\/\)/);
  });
});

// ---------------------------------------------------------------------------
// FE-5/FE-6 — sanitizeHtml wrapper usage (source-text inspection)
// ---------------------------------------------------------------------------

describe("FE-5/FE-6 — sanitizeHtml wrapper usage", () => {
  it("CodeExplorer.tsx imports sanitizeHtml, not DOMPurify", () => {
    const src = readFileSync(
      resolve(ROOT, "src/components/code-explorer/CodeExplorer.tsx"),
      "utf-8"
    );
    expect(src).toContain('from "../../lib/sanitize-html"');
    expect(src).toContain("sanitizeHtml(");
    expect(src).not.toContain('import DOMPurify from "dompurify"');
    expect(src).not.toContain("DOMPurify.sanitize(");
  });

  it("InlineReadPanel.tsx imports sanitizeHtml, not DOMPurify", () => {
    const src = readFileSync(
      resolve(ROOT, "src/components/milestone/InlineReadPanel.tsx"),
      "utf-8"
    );
    expect(src).toContain('from "../../lib/sanitize-html"');
    expect(src).toContain("sanitizeHtml(");
    expect(src).not.toContain('import DOMPurify from "dompurify"');
    expect(src).not.toContain("DOMPurify.sanitize(");
  });
});

// ---------------------------------------------------------------------------
// Live HTTP server — shared instance for API-6 and API-4
// ---------------------------------------------------------------------------

let server: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  server = await startTestServer();
}, 20_000);
afterAll(async () => {
  await server.stop();
});

// ---------------------------------------------------------------------------
// API-6 — empty Host header bypass
// ---------------------------------------------------------------------------
// The fix changed `if (host && !ALLOWED_HOSTS.has(host))` to
// `if (!host || !ALLOWED_HOSTS.has(host))`.
//
// Source inspection confirms the guard: a null/empty host is now rejected.
// Live test confirms the guard fires for a non-empty invalid host.
//
// Note: Bun's HTTP layer returns 500 for literally empty Host: "" before
// reaching the server handler, so null-host is verified via source inspection.

describe("API-6 — empty Host header bypass", () => {
  it("server.ts guard uses !host || !ALLOWED_HOSTS (source-text inspection)", () => {
    const src = readFileSync(resolve(ROOT, "src/server.ts"), "utf-8");
    // Must use the null-safe guard: !host || !ALLOWED_HOSTS
    expect(src).toContain("!host || !ALLOWED_HOSTS.has(host)");
    // Must NOT use the old fail-open guard: host && !ALLOWED_HOSTS
    expect(src).not.toContain("host && !ALLOWED_HOSTS.has(host)");
  });

  it("rejects request with invalid Host header with 400 (live HTTP test)", async () => {
    // Sending Host: "evil.com" confirms the ALLOWED_HOSTS guard fires and
    // returns 400 — same code path as a missing/empty host.
    const url = new URL("/api/fs/list", server.baseUrl);
    const res = await fetch(url.toString(), {
      headers: { Host: "evil.com" },
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBe("Invalid Host header");
  });
});

// ---------------------------------------------------------------------------
// API-4 — POST /api/trust path validation (live HTTP test)
// ---------------------------------------------------------------------------

describe("API-4 — POST /api/trust path validation", () => {
  it("rejects dir without .gsd suffix with 400", async () => {
    const res = await makeRequest(server.baseUrl, "/api/trust", {
      method: "POST",
      token: server.token,
      body: JSON.stringify({ dir: "/tmp/evil" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toBe("dir must be a .gsd directory path");
  });

  it("rejects dir with .. traversal and no .gsd suffix with 400", async () => {
    const res = await makeRequest(server.baseUrl, "/api/trust", {
      method: "POST",
      token: server.token,
      body: JSON.stringify({ dir: "/tmp/../etc" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts dir ending with /.gsd", async () => {
    // Use a temp dir that ends with .gsd — writeTrustFlag will mkdir -p
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "trust-test-"));
    const gsdDir = path.join(tmpBase, ".gsd");
    try {
      const res = await makeRequest(server.baseUrl, "/api/trust", {
        method: "POST",
        token: server.token,
        body: JSON.stringify({ dir: gsdDir }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { ok?: boolean };
      expect(body.ok).toBe(true);
    } finally {
      await fs.rm(tmpBase, { recursive: true, force: true });
    }
  });
});
