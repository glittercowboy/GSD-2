/**
 * Regression test for #3672 — query-tools uses ensureDbOpen
 *
 * gsd_milestone_status previously called isDbAvailable() but never
 * ensureDbOpen(), making it always fail outside auto-mode sessions.
 * The fix imports ensureDbOpen from dynamic-tools and calls it before
 * querying the DB.
 *
 * This behavior test registers the query tool and executes it against a
 * temp workspace where the DB must be opened on demand.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeDatabase, insertMilestone, openDatabase } from '../gsd-db.ts';
import { registerQueryTools } from '../bootstrap/query-tools.ts';

describe('query-tools ensureDbOpen usage (#3672)', () => {
  test('gsd_milestone_status opens the workspace DB before querying', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-query-tools-'));
    const dbPath = join(base, '.gsd', 'gsd.db');
    const tools: Record<string, any> = {};
    const originalCwd = process.cwd();
    try {
      mkdirSync(join(base, '.gsd'), { recursive: true });
      openDatabase(dbPath);
      insertMilestone({ id: 'M001', title: 'Query me', status: 'active' });
      closeDatabase();

      registerQueryTools({ registerTool(tool: any) { tools[tool.name] = tool; } } as any);
      process.chdir(base);
      const result = await tools.gsd_milestone_status.execute(
        'call-1',
        { milestoneId: 'M001' },
        undefined,
        undefined,
        undefined,
      );

      assert.notEqual(result.details?.error, 'db_unavailable');
      assert.equal(result.details?.milestoneId ?? result.details?.milestone?.id, 'M001');
    } finally {
      process.chdir(originalCwd);
      closeDatabase();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
