// Integration test: doctor repair → auto-resume lineage preservation.
//
// Verifies the full recovery path:
// 1. Doctor detects ghost milestone directories and emits orphaned_milestone_directory warnings
// 2. rebuildState writes correct STATE.md excluding ghost milestones
// 3. deriveState returns the real active milestone (M005), not a ghost

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runGSDDoctor, rebuildState } from '../doctor.ts';
import { deriveState } from '../state.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();

// ─── Fixture Helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-doctor-ghost-regression-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function createGhostMilestone(base: string, mid: string): void {
  // Create an empty milestone directory — a "ghost" with no content
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
}

function writeRoadmap(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-ROADMAP.md`), content);
}

function writePlan(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, `${sid}-PLAN.md`), content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Integration Test: Doctor Repair → Auto-Resume Lineage
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // ─── Test: Doctor detects ghost directories, rebuildState writes correct state ─────
  console.log('\n=== doctor detects ghost directories and emits warnings ===');
  {
    const base = createFixtureBase();
    try {
      // Create ghost directories M001 and M002 (empty, no content)
      createGhostMilestone(base, 'M001');
      createGhostMilestone(base, 'M002');

      // Create a real M005 with a roadmap containing an incomplete slice
      writeRoadmap(base, 'M005', `# M005: Real Active Milestone

**Vision:** This is the milestone that should be active.

## Slices

- [ ] **S01: Work in Progress** \`risk:low\` \`depends:[]\`
  > After this: Slice is done.
`);

      // Add a plan with incomplete tasks so it's in executing phase
      writePlan(base, 'M005', 'S01', `# S01: Work in Progress

**Goal:** Execute real work.
**Demo:** Tests pass.

## Tasks

- [ ] **T01: First Task** \`est:10m\`
  First task description.
`);

      // Verify fixture structure
      assertTrue(
        existsSync(join(base, '.gsd', 'milestones', 'M001')),
        'M001 ghost directory exists'
      );
      assertTrue(
        existsSync(join(base, '.gsd', 'milestones', 'M002')),
        'M002 ghost directory exists'
      );
      assertTrue(
        existsSync(join(base, '.gsd', 'milestones', 'M005', 'M005-ROADMAP.md')),
        'M005 has a real roadmap'
      );

      // Step 2: Run doctor audit and collect issues
      const doctorReport = await runGSDDoctor(base, { fix: false });

      // Step 3: Assert issues include orphaned_milestone_directory for M001 and M002
      const ghostWarnings = doctorReport.issues.filter(
        issue => issue.code === 'orphaned_milestone_directory'
      );

      assertEq(
        ghostWarnings.length,
        2,
        'doctor emits 2 orphaned_milestone_directory warnings'
      );

      const ghostIds = ghostWarnings.map(w => w.unitId).sort();
      assertEq(
        ghostIds[0],
        'M001',
        'M001 is flagged as orphaned_milestone_directory'
      );
      assertEq(
        ghostIds[1],
        'M002',
        'M002 is flagged as orphaned_milestone_directory'
      );

      // Verify M005 is NOT flagged as a ghost
      const m005Flagged = ghostWarnings.some(w => w.unitId === 'M005');
      assertTrue(
        !m005Flagged,
        'M005 is NOT flagged as orphaned_milestone_directory (it has real content)'
      );

      console.log('\n  Doctor ghost detection test PASSED.');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: rebuildState + deriveState return correct active milestone ──────
  console.log('\n=== rebuildState + deriveState return correct active milestone ===');
  {
    const base = createFixtureBase();
    try {
      // Create ghost directories
      createGhostMilestone(base, 'M001');
      createGhostMilestone(base, 'M002');

      // Create real M005 with incomplete slice
      writeRoadmap(base, 'M005', `# M005: Real Active Milestone

**Vision:** Should be active after rebuild.

## Slices

- [ ] **S01: Active Work** \`risk:low\` \`depends:[]\`
  > After this: Done.
`);

      writePlan(base, 'M005', 'S01', `# S01: Active Work

**Goal:** Work.
**Demo:** Tests.

## Tasks

- [ ] **T01: Task** \`est:10m\`
  Task.
`);

      // Step 4: Call rebuildState and then deriveState
      await rebuildState(base);
      const state = await deriveState(base);

      // Step 5: Assert activeMilestone.id === 'M005'
      assertEq(
        state.activeMilestone?.id,
        'M005',
        'activeMilestone is M005 after rebuildState'
      );

      assertEq(
        state.phase,
        'executing',
        'phase is executing (M005 has incomplete tasks)'
      );

      // Verify STATE.md was created and contains M005 as active
      const statePath = join(base, '.gsd', 'STATE.md');
      assertTrue(
        existsSync(statePath),
        'STATE.md was created by rebuildState'
      );

      const stateContent = readFileSync(statePath, 'utf-8');
      assertTrue(
        stateContent.includes('M005'),
        'STATE.md contains M005'
      );
      assertTrue(
        stateContent.includes('Active Milestone:') || stateContent.includes('**Active Milestone:**'),
        'STATE.md has Active Milestone field'
      );

      // Verify ghost milestones are NOT in the registry
      const m001InRegistry = state.registry.some(e => e.id === 'M001');
      const m002InRegistry = state.registry.some(e => e.id === 'M002');
      assertTrue(
        !m001InRegistry,
        'M001 (ghost) is not in registry after rebuildState'
      );
      assertTrue(
        !m002InRegistry,
        'M002 (ghost) is not in registry after rebuildState'
      );

      // Verify only M005 is in the registry
      assertEq(
        state.registry.length,
        1,
        'registry has 1 entry (M005 only)'
      );
      assertEq(
        state.registry[0]?.id,
        'M005',
        'registry entry is M005'
      );

      console.log('\n  rebuildState + deriveState test PASSED.');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: STATE.md content verified after full repair flow ────────────────
  console.log('\n=== STATE.md content verified after full repair flow ===');
  {
    const base = createFixtureBase();
    try {
      // Create ghosts
      createGhostMilestone(base, 'M001');
      createGhostMilestone(base, 'M002');

      // Create M005 with complete slices (but no milestone summary)
      // This tests the completing-milestone or validating-milestone phase
      writeRoadmap(base, 'M005', `# M005: Near Complete Milestone

**Vision:** Almost done.

## Slices

- [x] **S01: Done Slice** \`risk:low\` \`depends:[]\`
  > After this: Slice done.
`);

      // Slice with completed task
      const sDir = join(base, '.gsd', 'milestones', 'M005', 'slices', 'S01');
      mkdirSync(join(sDir, 'tasks'), { recursive: true });
      writeFileSync(join(sDir, 'S01-PLAN.md'), `# S01: Done Slice

**Goal:** Done.
**Demo:** Done.

## Tasks

- [x] **T01: Task** \`est:10m\`
  Done.
`);
      writeFileSync(join(sDir, 'S01-SUMMARY.md'), `---
id: S01
parent: M005
milestone: M005
---
# S01: Done

**Done.**
`);

      // Run doctor with fix to trigger rebuild
      await runGSDDoctor(base, { fix: true });
      await rebuildState(base);

      const statePath = join(base, '.gsd', 'STATE.md');
      assertTrue(
        existsSync(statePath),
        'STATE.md exists after doctor --fix + rebuildState'
      );

      const stateContent = readFileSync(statePath, 'utf-8');

      // Verify ghosts are NOT mentioned in STATE.md
      assertTrue(
        !stateContent.includes('M001') || !stateContent.match(/M001:/),
        'STATE.md does not show ghost M001 as an active/registry entry'
      );
      assertTrue(
        !stateContent.includes('M002') || !stateContent.match(/M002:/),
        'STATE.md does not show ghost M002 as an active/registry entry'
      );

      // Verify M005 is present
      assertTrue(
        stateContent.includes('M005'),
        'STATE.md contains M005'
      );

      // Final verify via deriveState
      const state = await deriveState(base);
      assertEq(
        state.activeMilestone?.id,
        'M005',
        'deriveState returns M005 as active after full repair flow'
      );

      console.log('\n  STATE.md content verification test PASSED.');
    } finally {
      cleanup(base);
    }
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
