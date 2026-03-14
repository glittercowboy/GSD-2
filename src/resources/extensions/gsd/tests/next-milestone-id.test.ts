// Tests for nextMilestoneId and maxMilestoneNum — milestone ID generation
// using max-based approach to avoid collisions after deletions.
//
// Sections:
//   (a) Empty array returns M001
//   (b) Sequential IDs return next in sequence
//   (c) IDs with gaps (deletion) use max, not fill
//   (d) Non-numeric directory names mixed in are ignored

import { nextMilestoneId, maxMilestoneNum } from '../guided-flow.ts';
import { createTestContext } from './test-helpers.ts';


const { assertEq, report } = createTestContext();
// ─── Tests ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('nextMilestoneId / maxMilestoneNum tests');

  // (a) Empty array → M001
  {
    assertEq(maxMilestoneNum([]), 0, 'maxMilestoneNum([]) === 0');
    assertEq(nextMilestoneId([]), 'M001', 'nextMilestoneId([]) === "M001"');
  }

  // (b) Sequential IDs → next in sequence
  {
    assertEq(
      nextMilestoneId(['M001', 'M002', 'M003']),
      'M004',
      'sequential IDs return M004',
    );
    assertEq(maxMilestoneNum(['M001', 'M002', 'M003']), 3, 'max of sequential is 3');
  }

  // (c) IDs with gaps (deletion scenario) → uses max, not fill
  {
    assertEq(
      nextMilestoneId(['M001', 'M003']),
      'M004',
      'gap scenario returns M004, not M002',
    );
    assertEq(maxMilestoneNum(['M001', 'M003']), 3, 'max with gap is 3');
  }

  // (d) Non-numeric directory names mixed in are ignored
  {
    assertEq(
      nextMilestoneId(['M001', 'notes', '.DS_Store', 'M003']),
      'M004',
      'non-numeric names ignored, returns M004',
    );
    assertEq(
      maxMilestoneNum(['M001', 'notes', '.DS_Store', 'M003']),
      3,
      'max ignores non-numeric entries',
    );
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
