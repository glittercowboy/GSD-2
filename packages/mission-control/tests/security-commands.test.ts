import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const commandsRs = readFileSync(
  resolve(import.meta.dir, "../src-tauri/src/commands.rs"),
  "utf-8"
);

describe("B2: open_external URL scheme allowlist", () => {
  it("checks for https:// before opening URL (B68/B69: uses Url::parse for safe URL validation)", () => {
    // Phase 20.2.5 B68/B69 remediation: replaced starts_with() string check with Url::parse()
    // The old pattern (starts_with("https://")) was replaced with proper URL parser-based validation.
    // Verify the function uses Url::parse and checks the scheme via parsed.scheme()
    expect(commandsRs).toMatch(/Url::parse\(&url\)/);
    // Must reject non-https scheme (B68 — only https:// allowed for open_external)
    expect(commandsRs).toContain('parsed.scheme() != "https"');
  });

  it("returns false for rejected URLs", () => {
    expect(commandsRs).toContain("return false");
  });
});

describe("B2: reveal_path absolute path validation", () => {
  it("uses std::path::Path::new to parse the path", () => {
    expect(commandsRs).toContain("std::path::Path::new(&path)");
  });

  it("checks is_absolute() before revealing", () => {
    expect(commandsRs).toContain("!p.is_absolute()");
  });
});

describe("B3: credential key allowlist", () => {
  it("defines ALLOWED_CREDENTIAL_KEYS constant", () => {
    expect(commandsRs).toContain("const ALLOWED_CREDENTIAL_KEYS: &[&str]");
  });

  it("includes anthropic_api_key in allowlist", () => {
    expect(commandsRs).toContain('"anthropic_api_key"');
  });

  it("includes github_token in allowlist", () => {
    expect(commandsRs).toContain('"github_token"');
  });

  it("includes openrouter_api_key in allowlist", () => {
    expect(commandsRs).toContain('"openrouter_api_key"');
  });

  it("includes claude_access_token in allowlist", () => {
    expect(commandsRs).toContain('"claude_access_token"');
  });

  it("includes claude_refresh_token in allowlist", () => {
    expect(commandsRs).toContain('"claude_refresh_token"');
  });

  it("validates key against allowlist in get_credential", () => {
    // The check must appear BEFORE keyring::Entry::new
    const getAllowlistIdx = commandsRs.indexOf("ALLOWED_CREDENTIAL_KEYS.contains");
    const getEntryIdx = commandsRs.indexOf('keyring::Entry::new(KEYCHAIN_SERVICE, &key)');
    expect(getAllowlistIdx).toBeGreaterThan(-1);
    expect(getAllowlistIdx).toBeLessThan(getEntryIdx);
  });
});
