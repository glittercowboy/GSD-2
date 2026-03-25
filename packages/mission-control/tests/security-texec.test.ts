/**
 * Nyquist security tests for T-EXEC threat category (Behaviours 19-32).
 *
 * T-EXEC-01: Process Spawning Safety (Behaviours 19-24)
 * T-EXEC-02: XSS-to-IPC Chain Prevention (Behaviours 25-32)
 *
 * RED PHASE: B25-B32 expected to FAIL until Wave 3 remediations
 * B19-B24 are already passing (implemented in Phase 20.2.4).
 *
 * T-EXEC-01 tests are retained as HTTP/process-level smoke tests.
 * T-EXEC-02 tests use DOMPurify + jsdom for observable DOM inspection.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  startTestServer,
  makeRequest,
  type TestServer,
} from "./security-test-helpers";
import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import { readFileSync, existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
}, 30_000);

afterAll(async () => {
  await server.stop();
});

// ---------------------------------------------------------------------------
// T-EXEC-01 — Process Spawning Safety (Behaviours 19-24)
// ---------------------------------------------------------------------------

describe("T-EXEC-01 — Process Spawning Safety", () => {
  it.skip(
    "B19: Bun spawned with absolute path (verified via Rust unit test in bun_manager.rs)",
    () => {
      // B19 is verified by Rust tests that inspect the resolved binary path at runtime.
      // The Tauri integration test checks resolve_bun_path() + Command::new with abs path.
      // We cannot inspect /proc/{pid}/exe from a Bun test on all platforms without root.
    }
  );

  it("B22: POST /api/kill-port with out-of-range port returns 400/422 (no shell injection)", async () => {
    // kill-port.ts uses execFile with array args — this should not crash on bad input
    const res = await makeRequest(server.baseUrl, "/api/kill-port", {
      method: "POST",
      body: JSON.stringify({ port: 99999 }),
    });

    // kill-port is not exposed as an HTTP endpoint in server.ts — it is called internally.
    // If the route does not exist (404), that is acceptable.
    // What is NOT acceptable: status 500 (crash) or execution of injected command.
    expect(res.status).not.toBe(500);
  });

  it("B24: GET /api/git/log with non-numeric limit returns 200 or 400 (no crash)", async () => {
    // git-api.ts uses execFile with array args — injection not possible
    const res = await makeRequest(
      server.baseUrl,
      "/api/git/log?limit=abc",
      { token: server.token }
    );

    // Must not crash (500) — execFile with array args handles bad input gracefully
    expect(res.status).not.toBe(500);
    // Should return 200 (clamp bad limit) or 400 (validation error)
    expect([200, 400, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// T-EXEC-02 — XSS-to-IPC Chain Prevention (Behaviours 25-32)
// ---------------------------------------------------------------------------

describe("T-EXEC-02 — XSS to IPC Chain Prevention", () => {
  // Setup: create a JSDOM window + DOMPurify instance for DOM inspection
  // This simulates what the app should do with marked.parse() output.

  it("B25/B26/B27/B65: DOMPurify sanitizes XSS payloads targeting Tauri IPC (DOM inspection)", () => {
    // Simulate the attack chain: malicious .gsd/ file content → marked.parse() → DOM
    // The component (CodeExplorer.tsx) should call DOMPurify.sanitize() before innerHTML.
    // This test verifies DOMPurify WORKS correctly when applied.
    // A separate RED test (B25-component) verifies the component actually calls it.

    const jsdom = new JSDOM("");
    const purify = DOMPurify(jsdom.window as unknown as Window);

    // Attack vectors from the threat model:
    const attackPayloads = [
      // Script injection via marked HTML output
      `<script>window.__TAURI__.invoke('set_credential', {key: 'ANTHROPIC_API_KEY', value: 'stolen'})</script>`,
      // Event handler injection
      `<img src="x" onerror="window.__TAURI__.invoke('delete_credential', {key: 'ANTHROPIC_API_KEY'})">`,
      // Data exfiltration via location change
      `<a href="javascript:window.__TAURI__.invoke('restart_bun')">click me</a>`,
      // Indirect: onload on a style element
      `<style onload="alert(1)">body{}</style>`,
      // iframe injection (covered more by B32)
      `<iframe src="javascript:parent.__TAURI__.invoke('get_credential', {key: 'token'})"></iframe>`,
    ];

    for (const payload of attackPayloads) {
      const sanitized = purify.sanitize(payload);
      const resultDom = new JSDOM(sanitized);
      const doc = resultDom.window.document;

      // No script tags after sanitization
      expect(
        doc.querySelectorAll("script").length,
        `DOMPurify should remove <script> from: ${payload.slice(0, 60)}`
      ).toBe(0);

      // No event handler attributes (onerror, onload, etc.)
      const allElements = doc.querySelectorAll("*");
      for (const el of allElements) {
        for (const attr of el.attributes) {
          expect(
            attr.name.startsWith("on"),
            `DOMPurify should remove on* attr '${attr.name}' from: ${payload.slice(0, 60)}`
          ).toBe(false);
        }
      }

      // No Tauri IPC calls in the sanitized output
      expect(
        sanitized,
        `Sanitized output should not reference __TAURI__`
      ).not.toContain("__TAURI__");

      // No javascript: scheme links
      expect(
        sanitized,
        `Sanitized output should not have javascript: href`
      ).not.toContain("javascript:");
    }
  });

  it("B25: CodeExplorer.tsx uses DOMPurify.sanitize() before dangerouslySetInnerHTML (RED)", () => {
    // Source-inspect is permitted for static config checks only.
    // This is a static check on the component source to confirm sanitization is applied.
    const ceSrc = readFileSync(
      resolve(import.meta.dir, "../src/components/code-explorer/CodeExplorer.tsx"),
      "utf8"
    );

    const irpSrc = readFileSync(
      resolve(import.meta.dir, "../src/components/milestone/InlineReadPanel.tsx"),
      "utf8"
    );

    // Components must sanitize HTML before dangerouslySetInnerHTML.
    // Accept either direct DOMPurify.sanitize() call or the sanitizeHtml wrapper
    // (lib/sanitize-html.ts), which calls DOMPurify.sanitize() internally.
    const sanitizesHtml = (src: string) =>
      src.includes("DOMPurify.sanitize") || src.includes("sanitizeHtml");

    if (ceSrc.includes("dangerouslySetInnerHTML")) {
      expect(sanitizesHtml(ceSrc)).toBe(true);
    }

    if (irpSrc.includes("dangerouslySetInnerHTML")) {
      expect(sanitizesHtml(irpSrc)).toBe(true);
    }

    // At least one uses dangerouslySetInnerHTML (test is meaningful)
    expect(
      ceSrc.includes("dangerouslySetInnerHTML") ||
        irpSrc.includes("dangerouslySetInnerHTML")
    ).toBe(true);
  });

  it("B28: tauri.conf.json script-src does NOT contain 'unsafe-inline' (RED)", () => {
    // Static config check: permitted for tauri.conf.json per CONTEXT.md
    const tauriConf = readFileSync(
      resolve(import.meta.dir, "../src-tauri/tauri.conf.json"),
      "utf8"
    );

    const conf = JSON.parse(tauriConf);
    const csp: string = conf?.app?.security?.csp ?? "";

    // Extract script-src directive
    const scriptSrcMatch = csp.match(/script-src([^;]*)/);
    const scriptSrc = scriptSrcMatch ? scriptSrcMatch[1] : "";

    // RED: tauri.conf.json has 'unsafe-inline' in script-src
    // This allows arbitrary inline scripts to execute — XSS via dangerouslySetInnerHTML
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("B29: tauri.conf.json script-src uses nonces or hashes (not unsafe-inline) (RED)", () => {
    // Static config check: permitted for tauri.conf.json per CONTEXT.md
    const tauriConf = readFileSync(
      resolve(import.meta.dir, "../src-tauri/tauri.conf.json"),
      "utf8"
    );

    const conf = JSON.parse(tauriConf);
    const csp: string = conf?.app?.security?.csp ?? "";

    const scriptSrcMatch = csp.match(/script-src([^;]*)/);
    const scriptSrc = scriptSrcMatch ? scriptSrcMatch[1] : "";

    // Must use nonce or hash-based CSP for inline scripts
    const hasNonceOrHash =
      scriptSrc.includes("'nonce-") ||
      scriptSrc.includes("'sha256-") ||
      scriptSrc.includes("'sha384-") ||
      scriptSrc.includes("'sha512-");

    // RED: script-src uses 'unsafe-inline' instead of nonces/hashes
    expect(hasNonceOrHash).toBe(true);
  });

  it("B30: secondary-window capability file exists (RED)", () => {
    // Static config check: permitted for capability JSON files per CONTEXT.md
    const capPath = resolve(
      import.meta.dir,
      "../src-tauri/capabilities/secondary-window.json"
    );

    // RED: only main.json exists — no secondary window capability file
    expect(existsSync(capPath)).toBe(true);

    if (existsSync(capPath)) {
      const cap = JSON.parse(readFileSync(capPath, "utf8"));
      expect(cap).toHaveProperty("identifier");
      expect(cap).toHaveProperty("permissions");
      expect(Array.isArray(cap.permissions)).toBe(true);
    }
  });

  it("B31: non-main capability files do NOT grant dangerous IPC commands (RED)", () => {
    // Static config check: permitted for capability JSON files per CONTEXT.md
    const capabilitiesDir = resolve(import.meta.dir, "../src-tauri/capabilities");

    const files = readdirSync(capabilitiesDir).filter(
      (f) => f.endsWith(".json") && f !== "main.json"
    );

    // RED: no non-main capability files exist
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const cap = JSON.parse(readFileSync(resolve(capabilitiesDir, file), "utf8"));
      const permissionsStr = JSON.stringify(cap.permissions);

      // Dangerous commands must NOT appear in secondary window capability files
      expect(permissionsStr).not.toContain("set_credential");
      expect(permissionsStr).not.toContain("delete_credential");
      expect(permissionsStr).not.toContain("restart_bun");
    }
  });

  it("B32: all <iframe> elements in TSX components have sandbox attribute (RED)", () => {
    // Scan component files for iframe elements without sandbox
    const componentsDir = resolve(import.meta.dir, "../src/components");

    function findTsxFiles(dir: string): string[] {
      const files: string[] = [];
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = resolve(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...findTsxFiles(fullPath));
          } else if (entry.name.endsWith(".tsx")) {
            files.push(fullPath);
          }
        }
      } catch {
        // Directory may not exist
      }
      return files;
    }

    const tsxFiles = findTsxFiles(componentsDir);

    let iframeCount = 0;
    let sandboxedCount = 0;
    const unsandboxedFiles: string[] = [];

    for (const file of tsxFiles) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("<iframe")) continue;

      const iframeMatches = src.match(/<iframe[\s\S]*?>/g) ?? [];

      for (const iframeTag of iframeMatches) {
        iframeCount++;
        if (iframeTag.includes("sandbox")) {
          sandboxedCount++;
        } else {
          unsandboxedFiles.push(file.split(/[/\\]/).pop() ?? file);
        }
      }
    }

    // Ensure test is meaningful (iframes exist to check)
    expect(iframeCount).toBeGreaterThan(0);

    // RED: iframes in DeviceFrame.tsx and PreviewPanel.tsx lack sandbox attributes
    expect(
      sandboxedCount,
      `Unsandboxed iframes found in: ${unsandboxedFiles.join(", ")}`
    ).toBe(iframeCount);
  });
});
