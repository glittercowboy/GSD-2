/**
 * Regression test for #3670 — needs-remediation verdict forces re-validation
 *
 * When validation returns needs-remediation, the state machine must route
 * back to validating-milestone instead of completing-milestone. Without this,
 * dispatch blocks completion for needs-remediation while state derives
 * completing-milestone, creating a permanent deadlock.
 *
 * This behavior test verifies DB-backed state derivation does not route a
 * needs-remediation validation verdict into milestone completion.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closeDatabase,
  insertAssessment,
  insertMilestone,
  insertSlice,
  openDatabase,
} from '../gsd-db.ts';
import { deriveStateFromDb } from '../state.ts';

describe('needs-remediation revalidation guard (#3670)', () => {
  test('needs-remediation assessment blocks completion when every slice is done', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-needs-remediation-'));
    try {
      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Needs remediation', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'Done slice', status: 'complete' });
      insertAssessment({
        path: join(base, '.gsd', 'milestones', 'M001', 'M001-VALIDATION.md'),
        milestoneId: 'M001',
        status: 'needs-remediation',
        scope: 'milestone-validation',
        fullContent: 'Verdict: needs-remediation',
      });

      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'blocked');
      assert.match(state.nextAction, /remediation/i);
      assert.ok(
        state.blockers.some((blocker) => blocker.includes('needs-remediation')),
        'blocked state explains the remediation verdict',
      );
    } finally {
      closeDatabase();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
