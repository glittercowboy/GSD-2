// Tests for inlinePriorMilestoneSummary — the cross-milestone context bridging helper.
//
// Scenarios covered:
//   (A) M002 with M001-SUMMARY.md present → returns string containing "Prior Milestone Summary" and summary content
//   (B) M001 (no prior milestone in dir) → returns null
//   (C) M002 with no M001-SUMMARY.md written → returns null
//   (D) M003 with M002 dir present but no M002-SUMMARY.md → returns null

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { inlinePriorMilestoneSummary } from '../files.ts';

// ─── Fixture helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-plan-ms-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function writeMilestoneDir(base: string, mid: string): void {
  mkdirSync(join(base, '.gsd', 'milestones', mid), { recursive: true });
}

function writeMilestoneSummary(base: string, mid: string, content: string): void {
  writeFileSync(join(base, '.gsd', 'milestones', mid, `${mid}-SUMMARY.md`), content, 'utf-8');
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('plan-milestone', () => {
  test('(A) M002 with M001-SUMMARY.md present → string containing "Prior Milestone Summary"', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');
      writeMilestoneDir(base, 'M002');
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nKey decisions: used TypeScript throughout.\n');

      const result = await inlinePriorMilestoneSummary('M002', base);

      assert.ok(result !== null, '(A) result is not null when prior milestone has SUMMARY');
      assert.ok(
        typeof result === 'string' && result.includes('Prior Milestone Summary'),
        '(A) result contains "Prior Milestone Summary" label',
      );
      assert.ok(
        typeof result === 'string' && result.includes('Key decisions: used TypeScript throughout.'),
        '(A) result contains the summary file content',
      );
    } finally {
      cleanup(base);
    }
  });

  test('(B) M001 — first milestone, no prior → null', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');

      const result = await inlinePriorMilestoneSummary('M001', base);

      assert.deepStrictEqual(result, null, '(B) M001 with no prior milestone → null');
    } finally {
      cleanup(base);
    }
  });

  test('(C) M002 with M001 dir but no M001-SUMMARY.md → null', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');
      writeMilestoneDir(base, 'M002');

      const result = await inlinePriorMilestoneSummary('M002', base);

      assert.deepStrictEqual(result, null, '(C) M002 when M001 has no SUMMARY file → null');
    } finally {
      cleanup(base);
    }
  });

  test('(D) M003, M002 is immediately prior but has no SUMMARY → null', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');
      writeMilestoneDir(base, 'M002');
      writeMilestoneDir(base, 'M003');
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nOld context.\n');

      const result = await inlinePriorMilestoneSummary('M003', base);

      assert.deepStrictEqual(result, null, '(D) M003 when M002 (immediately prior) has no SUMMARY → null');
    } finally {
      cleanup(base);
    }
  });
});
