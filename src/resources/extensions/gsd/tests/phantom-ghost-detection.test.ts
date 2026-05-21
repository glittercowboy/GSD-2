/**
 * Regression test for #3671 — isGhostMilestone detects phantom queued rows
 *
 * gsd_milestone_generate_id inserts a DB row with status "queued" as a side
 * effect. If the milestone is never planned, isGhostMilestone previously
 * returned false for any milestone with a DB row, blocking the state machine.
 *
 * The fix makes isGhostMilestone treat a "queued" DB row with no disk
 * artifacts (CONTEXT, ROADMAP, SUMMARY) as a ghost.
 *
 * This behavior test exercises isGhostMilestone against real DB rows and
 * milestone artifacts.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDatabase, insertMilestone, openDatabase } from '../gsd-db.ts';
import { clearPathCache } from '../paths.ts';
import { isGhostMilestone } from '../state.ts';

describe('isGhostMilestone phantom queued detection (#3671)', () => {
  test('queued DB row with no artifacts is a ghost, but content makes it real', () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-phantom-ghost-'));
    try {
      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Reserved only', status: 'queued' });
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });

      assert.equal(isGhostMilestone(base, 'M001'), true);

      writeFileSync(join(base, '.gsd', 'milestones', 'M001', 'M001-CONTEXT.md'), '# Context\n');
      clearPathCache();
      assert.equal(isGhostMilestone(base, 'M001'), false);
    } finally {
      closeDatabase();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
