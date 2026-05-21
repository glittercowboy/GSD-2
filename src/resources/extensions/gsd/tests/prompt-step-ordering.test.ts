/**
 * Regression tests for #3696 — prompt step ordering and compact hook behavior.
 *
 * These tests assert rendered prompts and registered hook behavior instead of
 * reading source files as text.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { _setAutoActiveForTest } from '../auto.ts';
import { buildCompleteMilestonePrompt, buildCompleteSlicePrompt } from '../auto-prompts.ts';
import { registerHooks } from '../bootstrap/register-hooks.ts';

function makePromptBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-prompt-order-'));
  const msDir = join(base, '.gsd', 'milestones', 'M001');
  const sliceDir = join(msDir, 'slices', 'S01');
  mkdirSync(sliceDir, { recursive: true });
  writeFileSync(
    join(msDir, 'M001-ROADMAP.md'),
    '# Roadmap\n\n## Slices\n\n- [x] **S01: Done** `risk:low` `depends:[]`\n',
  );
  writeFileSync(join(sliceDir, 'S01-PLAN.md'), '# S01 Plan\n\n## Tasks\n\n- T01\n');
  writeFileSync(join(sliceDir, 'S01-SUMMARY.md'), '# S01 Summary\n\nDone.\n');
  return base;
}

function numberedStepIndex(prompt: string, needle: RegExp): number {
  const lines = prompt.split('\n');
  const idx = lines.findIndex((line) => /^\d+\.\s/.test(line) && needle.test(line));
  assert.notEqual(idx, -1, `missing numbered step matching ${needle}`);
  return idx;
}

describe('prompt step ordering (#3696)', () => {
  test('complete-milestone prompt orders durable writes before gsd_complete_milestone', async () => {
    const base = makePromptBase();
    try {
      const prompt = await buildCompleteMilestonePrompt('M001', 'Milestone', base, 'minimal');
      const guardIdx = numberedStepIndex(prompt, /gsd_milestone_status/);
      const requirementIdx = numberedStepIndex(prompt, /gsd_requirement_update/);
      const projectIdx = numberedStepIndex(prompt, /PROJECT\.md/);
      const learningsIdx = numberedStepIndex(prompt, /Extract structured learnings/);
      const completeIdx = numberedStepIndex(prompt, /gsd_complete_milestone/);

      assert.ok(guardIdx < requirementIdx);
      assert.ok(requirementIdx < completeIdx);
      assert.ok(projectIdx < completeIdx);
      assert.ok(learningsIdx < completeIdx);
      assert.match(prompt, /status(?:`|\*\*)?\s+(?:is\s+)?(?:`complete`|"complete")/i);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('complete-slice prompt exposes gsd_requirement_update', async () => {
    const base = makePromptBase();
    try {
      const prompt = await buildCompleteSlicePrompt('M001', 'Milestone', 'S01', 'Done', base, 'minimal');
      assert.match(prompt, /gsd_requirement_update/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('register-hooks session_before_compact (#3696)', () => {
  test('registered hook cancels compaction only while auto-mode is active', async () => {
    const handlers = new Map<string, Function>();
    registerHooks({
      on(event: string, handler: Function) {
        handlers.set(event, handler);
      },
    } as any, []);

    const compact = handlers.get('session_before_compact');
    assert.ok(compact, 'session_before_compact hook should be registered');

    _setAutoActiveForTest(true);
    try {
      const result = await compact({}, { cwd: mkdtempSync(join(tmpdir(), 'gsd-compact-active-')), ui: { notify() {}, setWidget() {} } });
      assert.deepEqual(result, { cancel: true });
    } finally {
      _setAutoActiveForTest(false);
    }
  });
});
