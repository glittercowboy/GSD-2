import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .planning/ is gitignored — file may not exist in CI deployments.
// Tests silently pass when the file is absent (documentation tests, not security tests).
let threatModel: string | null = null;
try {
  threatModel = readFileSync(
    resolve(import.meta.dir, "../../../.planning/THREAT-MODEL.md"),
    "utf-8"
  );
} catch {
  // Not available in this environment — tests will be skipped below
}

describe("GAP-DOC: THREAT-MODEL.md — B37 host allowlist correction", () => {
  it("documents localhost:4200 alongside 127.0.0.1:4200 in allowed hosts", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("localhost:4200");
    expect(threatModel).toContain("127.0.0.1:4200");
  });

  it("B37 entry references both host entries in the same mitigation block", () => {
    if (!threatModel) return;
    const b37Idx = threatModel.indexOf("127.0.0.1:4200 and localhost:4200");
    expect(b37Idx).toBeGreaterThan(-1);
  });
});

describe("GAP-DOC: THREAT-MODEL.md — B57/B71 second auth.json reader", () => {
  it("documents classify-intent-api.ts as second auth.json reader", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("classify-intent-api.ts:49");
  });

  it("documents both read paths requiring update on migration", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("auth-api.ts");
    expect(threatModel).toContain("classify-intent-api.ts:49");
    const bothPaths = threatModel.indexOf("Auth.json read paths (both must be updated");
    expect(bothPaths).toBeGreaterThan(-1);
  });
});

describe("GAP-DOC: THREAT-MODEL.md — accepted-risk entries", () => {
  it("contains GAP-2 accepted-risk entry for /api/fs/list filesystem enumeration", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("GAP-2");
    expect(threatModel).toContain("/api/fs/list");
  });

  it("GAP-2 status is Accepted risk", () => {
    if (!threatModel) return;
    const gap2Idx = threatModel.indexOf("GAP-2");
    const section = threatModel.slice(gap2Idx, gap2Idx + 400);
    expect(section).toContain("Accepted risk");
  });

  it("contains GAP-3 entry marked as HISTORICAL", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("GAP-3");
    expect(threatModel).toContain("HISTORICAL");
  });

  it("GAP-3 documents WS token URL exposure as resolved in phase 20.2.7", () => {
    if (!threatModel) return;
    const gap3Idx = threatModel.indexOf("GAP-3");
    const section = threatModel.slice(gap3Idx, gap3Idx + 400);
    expect(section).toContain("Resolved in phase 20.2.7");
  });

  it("contains GAP-9 accepted-risk entry for rate limiter single global bucket", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("GAP-9");
    expect(threatModel).toContain("Rate Limiter Single Global Bucket");
  });

  it("GAP-9 status is Accepted risk", () => {
    if (!threatModel) return;
    const gap9Idx = threatModel.indexOf("GAP-9");
    const section = threatModel.slice(gap9Idx, gap9Idx + 300);
    expect(section).toContain("Accepted risk");
  });

  it("contains localhost DNS rebinding accepted-risk entry", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("localhost:4200 DNS Rebinding Surface");
  });
});

describe("GAP-DOC: THREAT-MODEL.md — Future Architecture section", () => {
  it("contains ## Future Architecture section header", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("## Future Architecture");
  });

  it("Future Architecture documents Tauri-command auth storage migration path", () => {
    if (!threatModel) return;
    expect(threatModel).toContain("Tauri-Command-Based Auth Storage Migration");
  });

  it("Future Architecture section identifies both files requiring update on migration", () => {
    if (!threatModel) return;
    const futureIdx = threatModel.indexOf("## Future Architecture");
    const section = threatModel.slice(futureIdx);
    expect(section).toContain("auth-api.ts");
    expect(section).toContain("classify-intent-api.ts:49");
  });
});
