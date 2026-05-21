// GSD-2 — Visualizer data behavior tests.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  computeCriticalPath,
  loadVisualizerData,
  type VisualizerMilestone,
} from "../visualizer-data.ts";

test("computeCriticalPath follows milestone dependencies", () => {
  const milestones: VisualizerMilestone[] = [
    {
      id: "M001",
      title: "Foundation",
      status: "active",
      dependsOn: [],
      slices: [{ id: "S01", title: "Foundation", done: false, active: false, risk: "low", depends: [], tasks: [] }],
    },
    {
      id: "M002",
      title: "Feature",
      status: "active",
      dependsOn: ["M001"],
      slices: [{ id: "S01", title: "Build", done: false, active: true, risk: "medium", depends: [], tasks: [] }],
    },
  ];

  const path = computeCriticalPath(milestones);
  assert.deepEqual(path.milestonePath, ["M001", "M002"]);
  assert.equal(path.milestoneSlack.has("M001"), true);
  assert.equal(path.milestoneSlack.has("M002"), true);
});

test("loadVisualizerData hydrates milestones, captures, stats, and health fields", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-visualizer-data-"));
  try {
    const msDir = join(base, ".gsd", "milestones", "M001");
    const sliceDir = join(msDir, "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(
      join(msDir, "M001-ROADMAP.md"),
      [
        "# M001: Visualizer",
        "",
        "## Slices",
        "- [ ] **S01: Build UI** `risk:low` `depends:[]`",
      ].join("\n"),
    );
    writeFileSync(
      join(sliceDir, "S01-PLAN.md"),
      "# S01 Plan\n\n## Tasks\n- [ ] **T01: Render data** `est:10m`\n",
    );
    writeFileSync(
      join(base, ".gsd", "CAPTURES.md"),
      [
        "# Captures",
        "",
        "### CAP-visual",
        "**Text:** Investigate visualizer state",
        "**Captured:** 2026-01-01T00:00:00.000Z",
        "**Status:** pending",
        "",
      ].join("\n"),
    );

    const data = await loadVisualizerData(base);

    assert.equal(data.milestones.length, 1);
    assert.equal(data.milestones[0]?.id, "M001");
    assert.equal(data.milestones[0]?.slices[0]?.id, "S01");
    assert.equal(data.remainingSliceCount, 1);
    assert.equal(data.captures.pendingCount, 1);
    assert.equal(data.stats.missingCount, 1);
    assert.ok(data.health);
    assert.ok(data.criticalPath.milestonePath.length >= 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
