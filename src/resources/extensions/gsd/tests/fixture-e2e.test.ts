/**
 * Fixture Harness End-to-End Tests
 *
 * Comprehensive validation of the fixture harness system:
 * - Loads each concept fixture into temp directories
 * - Validates state integrity against manifest requiredFiles
 * - Verifies claim mix consistency (counts match claims array)
 * - Tests metrics JSONL round-trip through readMetricsJsonl
 *
 * Run: npx tsx --test src/resources/extensions/gsd/tests/fixture-e2e.test.ts
 *
 * @module fixture-e2e.test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  loadFixture,
  validateFixtureState,
  readFixtureManifest,
  type FixtureManifest,
} from "./fixture-harness.js";
import { readMetricsJsonl } from "../metrics-reader.js";
import type { UnitMetrics } from "../metrics.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** All 3 concept fixtures to test */
const FIXTURE_IDS = [
  "low-unknown",
  "high-unknown",
  "mixed-confidence",
] as const;

// ─── Temp Directory Management ────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  // Use os.tmpdir() + crypto.randomUUID() for isolation (S02 pattern)
  tempDir = join(tmpdir(), `gsd-fixture-e2e-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ─── Helper: Create Synthetic UnitMetrics ─────────────────────────────────────

interface MakeUnitOptions {
  factCheck?: {
    claimsChecked: number;
    verified: number;
    refuted: number;
    inconclusive: number;
  };
}

/**
 * Create a synthetic UnitMetrics entry for testing JSONL round-trip.
 */
function makeUnit(
  type: string,
  id: string,
  opts: MakeUnitOptions = {}
): UnitMetrics {
  const now = Date.now();
  return {
    type,
    id,
    model: "claude-3-sonnet",
    startedAt: now - 100000,
    finishedAt: now,
    tokens: {
      input: 10000,
      output: 5000,
      cacheRead: 0,
      cacheWrite: 0,
      total: 15000,
    },
    cost: 0.15,
    toolCalls: 5,
    assistantMessages: 3,
    userMessages: 2,
    ...(opts.factCheck ? { factCheck: opts.factCheck } : {}),
  };
}

// ─── Test: Fixture Loading and State Integrity ─────────────────────────────────

describe("Fixture Loading and State Integrity", () => {
  for (const fixtureId of FIXTURE_IDS) {
    it(`loads ${fixtureId} fixture and validates state integrity`, () => {
      // Load fixture into temp directory
      const manifest = loadFixture(fixtureId, tempDir);

      // Validate manifest loaded correctly
      assert.ok(manifest, `${fixtureId}: loadFixture returns manifest`);
      assert.ok(
        manifest.id.includes(fixtureId) || manifest.id.includes("concept"),
        `${fixtureId}: manifest id references fixture`
      );

      // Validate state integrity
      const validation = validateFixtureState(manifest, tempDir);

      assert.strictEqual(
        validation.valid,
        true,
        `${fixtureId}: state should be valid (all required files present)`
      );
      assert.deepStrictEqual(
        validation.missingFiles,
        [],
        `${fixtureId}: no missing files`
      );
    });
  }
});

// ─── Test: Claim Mix Consistency ───────────────────────────────────────────────

describe("Claim Mix Consistency", () => {
  for (const fixtureId of FIXTURE_IDS) {
    it(`verifies claim mix counts match claims array for ${fixtureId}`, () => {
      const manifest = readFixtureManifest(fixtureId);
      const { claimMix, claims } = manifest;

      // Total count matches claims array length
      assert.strictEqual(
        claimMix.total,
        claims.length,
        `${fixtureId}: claimMix.total (${claimMix.total}) should equal claims.length (${claims.length})`
      );

      // Count claims by verdict
      const counts = {
        confirmed: claims.filter((c) => c.verdict === "confirmed").length,
        refuted: claims.filter((c) => c.verdict === "refuted").length,
        inconclusive: claims.filter((c) => c.verdict === "inconclusive").length,
        unresolved: claims.filter((c) => c.verdict === "unresolved").length,
      };

      // Verify each verdict count matches claimMix
      assert.strictEqual(
        counts.confirmed,
        claimMix.confirmed,
        `${fixtureId}: confirmed count should match`
      );
      assert.strictEqual(
        counts.refuted,
        claimMix.refuted,
        `${fixtureId}: refuted count should match`
      );
      assert.strictEqual(
        counts.inconclusive,
        claimMix.inconclusive,
        `${fixtureId}: inconclusive count should match`
      );
      assert.strictEqual(
        counts.unresolved,
        claimMix.unresolved,
        `${fixtureId}: unresolved count should match`
      );

      // Verify sum of verdict counts equals total
      const sumVerdicts =
        counts.confirmed +
        counts.refuted +
        counts.inconclusive +
        counts.unresolved;
      assert.strictEqual(
        sumVerdicts,
        claimMix.total,
        `${fixtureId}: sum of verdict counts should equal total`
      );
    });
  }
});

// ─── Test: Expected Telemetry Shape Validation ────────────────────────────────

describe("Expected Telemetry Shape Validation", () => {
  for (const fixtureId of FIXTURE_IDS) {
    it(`verifies expected telemetry shape matches claimMix for ${fixtureId}`, () => {
      const manifest = readFixtureManifest(fixtureId);
      const { claimMix, expectedTelemetryShape } = manifest;
      const { factCheck } = expectedTelemetryShape;

      // factCheck.claimsChecked should match claimMix.total
      assert.strictEqual(
        factCheck.claimsChecked,
        claimMix.total,
        `${fixtureId}: factCheck.claimsChecked should match claimMix.total`
      );

      // factCheck.verified should match claimMix.confirmed
      assert.strictEqual(
        factCheck.verified,
        claimMix.confirmed,
        `${fixtureId}: factCheck.verified should match claimMix.confirmed`
      );

      // factCheck.refuted should match claimMix.refuted
      assert.strictEqual(
        factCheck.refuted,
        claimMix.refuted,
        `${fixtureId}: factCheck.refuted should match claimMix.refuted`
      );

      // factCheck.inconclusive should match claimMix.inconclusive
      assert.strictEqual(
        factCheck.inconclusive,
        claimMix.inconclusive,
        `${fixtureId}: factCheck.inconclusive should match claimMix.inconclusive`
      );
    });
  }
});

// ─── Test: Metrics JSONL Round-Trip ───────────────────────────────────────────

describe("Metrics JSONL Round-Trip", () => {
  for (const fixtureId of FIXTURE_IDS) {
    it(`writes and reads back metrics matching ${fixtureId} telemetry shape`, () => {
      const manifest = readFixtureManifest(fixtureId);
      const expectedFc = manifest.expectedTelemetryShape.factCheck;

      // Create synthetic UnitMetrics with factCheck matching manifest
      const unit = makeUnit("execute-task", `${manifest.milestoneId}/S01/T01`, {
        factCheck: {
          claimsChecked: expectedFc.claimsChecked,
          verified: expectedFc.verified,
          refuted: expectedFc.refuted,
          inconclusive: expectedFc.inconclusive,
        },
      });

      // Write to JSONL file
      const jsonlPath = join(tempDir, "dispatch-metrics.jsonl");
      writeFileSync(jsonlPath, JSON.stringify(unit) + "\n", "utf-8");

      // Read back with readMetricsJsonl
      const result = readMetricsJsonl(jsonlPath);

      // Verify round-trip succeeded
      assert.strictEqual(
        result.units.length,
        1,
        `${fixtureId}: should parse 1 unit`
      );
      assert.strictEqual(
        result.skippedLines,
        0,
        `${fixtureId}: should skip 0 lines`
      );

      const parsedUnit = result.units[0];

      // Verify fact-check values match
      assert.ok(parsedUnit.factCheck, `${fixtureId}: parsed unit has factCheck`);
      assert.strictEqual(
        parsedUnit.factCheck!.claimsChecked,
        expectedFc.claimsChecked,
        `${fixtureId}: claimsChecked matches expected`
      );
      assert.strictEqual(
        parsedUnit.factCheck!.verified,
        expectedFc.verified,
        `${fixtureId}: verified matches expected`
      );
      assert.strictEqual(
        parsedUnit.factCheck!.refuted,
        expectedFc.refuted,
        `${fixtureId}: refuted matches expected`
      );
      assert.strictEqual(
        parsedUnit.factCheck!.inconclusive,
        expectedFc.inconclusive,
        `${fixtureId}: inconclusive matches expected`
      );
    });
  }
});

// ─── Test: Failure Path Detection ─────────────────────────────────────────────

describe("Failure Path Detection", () => {
  it("detects missing files in validateFixtureState", () => {
    // Load the mixed-confidence fixture
    const manifest = loadFixture("mixed-confidence", tempDir);

    // Verify initial state is valid
    const initialValidation = validateFixtureState(manifest, tempDir);
    assert.strictEqual(initialValidation.valid, true, "initial state should be valid");

    // Delete a required file to create a failure scenario
    const fileToDelete = join(tempDir, "state/slices/S01/factcheck/claims/C001.json");
    if (existsSync(fileToDelete)) {
      rmSync(fileToDelete);
    }

    // Validate again - should detect missing file
    const validation = validateFixtureState(manifest, tempDir);

    assert.strictEqual(
      validation.valid,
      false,
      "validation should fail after file deletion"
    );
    assert.ok(
      validation.missingFiles.length > 0,
      "missingFiles array should have entries"
    );
    assert.ok(
      validation.missingFiles.some((f) => f.includes("C001.json")),
      "missingFiles should include the deleted file"
    );
  });

  it("handles nonexistent fixture gracefully", () => {
    assert.throws(
      () => {
        loadFixture("nonexistent-fixture", tempDir);
      },
      /Fixture not found/,
      "loadFixture should throw for nonexistent fixture"
    );
  });
});

// ─── Test: Required Files Exist in Fixture State ──────────────────────────────

describe("Required Files Exist in Fixture State", () => {
  for (const fixtureId of FIXTURE_IDS) {
    it(`verifies all requiredFiles exist after loading ${fixtureId}`, () => {
      const manifest = loadFixture(fixtureId, tempDir);

      // Check each required file exists
      for (const requiredFile of manifest.requiredFiles) {
        const fullPath = join(tempDir, requiredFile);
        assert.ok(
          existsSync(fullPath),
          `${fixtureId}: required file ${requiredFile} should exist`
        );
      }
    });
  }
});
