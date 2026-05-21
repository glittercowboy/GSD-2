/**
 * Regression test for #3695 — insertMilestone defaults status to "queued"
 *
 * Milestones were being auto-created with status "active", causing phantom
 * milestones to appear as active work.  The fix defaults to "queued" so
 * new milestones must be explicitly activated.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDatabase, getMilestone, insertMilestone, openDatabase } from '../gsd-db.ts';

describe('insertMilestone defaults status to queued (#3695)', () => {
  test('omitted status persists as queued, not active', () => {
    try {
      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Reserved milestone' });

      assert.equal(getMilestone('M001')?.status, 'queued');
    } finally {
      closeDatabase();
    }
  });
});
