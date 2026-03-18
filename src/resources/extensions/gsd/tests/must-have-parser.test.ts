import { parseTaskPlanMustHaves } from '../files.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();
// ═══════════════════════════════════════════════════════════════════════════
// (a) Standard unchecked format: - [ ] text
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: standard unchecked ===');
{
  const content = `# T01: Test Task

## Must-Haves

- [ ] First must-have item
- [ ] Second must-have item
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 2, 'should return 2 items');
  assertEq(result[0].text, 'First must-have item', 'first item text');
  assertEq(result[0].checked, false, 'first item unchecked');
  assertEq(result[1].text, 'Second must-have item', 'second item text');
  assertEq(result[1].checked, false, 'second item unchecked');
}

// ═══════════════════════════════════════════════════════════════════════════
// (b) Checked variants: - [x] and - [X]
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: checked [x] and [X] ===');
{
  const content = `## Must-Haves

- [x] Lowercase checked item
- [X] Uppercase checked item
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 2, 'should return 2 items');
  assertEq(result[0].checked, true, 'lowercase x is checked');
  assertEq(result[0].text, 'Lowercase checked item', 'lowercase x text');
  assertEq(result[1].checked, true, 'uppercase X is checked');
  assertEq(result[1].text, 'Uppercase checked item', 'uppercase X text');
}

// ═══════════════════════════════════════════════════════════════════════════
// (c) No-checkbox bullets: - text
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: no-checkbox bullets ===');
{
  const content = `## Must-Haves

- Plain bullet item
- Another plain item
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 2, 'should return 2 items');
  assertEq(result[0].text, 'Plain bullet item', 'plain bullet text');
  assertEq(result[0].checked, false, 'plain bullet defaults to unchecked');
  assertEq(result[1].text, 'Another plain item', 'second plain bullet text');
}

// ═══════════════════════════════════════════════════════════════════════════
// (d) Indented variants
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: indented variants ===');
{
  const content = `## Must-Haves

  - [ ] Indented unchecked item
  - [x] Indented checked item
  - Plain indented item
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 3, 'should return 3 items');
  assertEq(result[0].text, 'Indented unchecked item', 'indented unchecked text');
  assertEq(result[0].checked, false, 'indented unchecked state');
  assertEq(result[1].text, 'Indented checked item', 'indented checked text');
  assertEq(result[1].checked, true, 'indented checked state');
  assertEq(result[2].text, 'Plain indented item', 'indented plain text');
  assertEq(result[2].checked, false, 'indented plain state');
}

// ═══════════════════════════════════════════════════════════════════════════
// (e) Mixed checkbox states in one section
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: mixed states ===');
{
  const content = `## Must-Haves

- [ ] Unchecked one
- [x] Checked one
- [X] Also checked
- Plain bullet
- [ ] Another unchecked
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 5, 'should return 5 items');
  assertEq(result[0].checked, false, 'first is unchecked');
  assertEq(result[1].checked, true, 'second is checked');
  assertEq(result[2].checked, true, 'third is checked (uppercase)');
  assertEq(result[3].checked, false, 'fourth (plain) is unchecked');
  assertEq(result[4].checked, false, 'fifth is unchecked');
}

// ═══════════════════════════════════════════════════════════════════════════
// (f) Missing Must-Haves section → empty array
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: missing section ===');
{
  const content = `# T01: Some Task

## Description

Some description here.

## Verification

- Run tests
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 0, 'returns empty array when section missing');
  assertTrue(Array.isArray(result), 'result is an array');
}

// ═══════════════════════════════════════════════════════════════════════════
// (g) Empty Must-Haves section → empty array
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: empty section ===');
{
  const content = `## Must-Haves

## Verification

- Run tests
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 0, 'returns empty array when section is empty');
}

// ═══════════════════════════════════════════════════════════════════════════
// (h) Content with YAML frontmatter
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: YAML frontmatter ===');
{
  const content = `---
estimated_steps: 5
estimated_files: 3
---

# T01: Task with frontmatter

## Must-Haves

- [ ] Real must-have after frontmatter
- [x] Checked must-have after frontmatter
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 2, 'frontmatter does not pollute results');
  assertEq(result[0].text, 'Real must-have after frontmatter', 'first item text correct');
  assertEq(result[0].checked, false, 'first item unchecked');
  assertEq(result[1].text, 'Checked must-have after frontmatter', 'second item text correct');
  assertEq(result[1].checked, true, 'second item checked');
}

// Verify frontmatter content is not misinterpreted as must-haves
console.log('\n=== parseTaskPlanMustHaves: frontmatter-only content ===');
{
  const content = `---
estimated_steps: 5
estimated_files: 3
---

# T01: Task with only frontmatter

## Description

No must-haves section here.
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 0, 'frontmatter-only content returns empty array');
}

// ═══════════════════════════════════════════════════════════════════════════
// (i) Real task plan format (based on S01/T01-PLAN.md structure)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: real task plan format ===');
{
  const content = `---
estimated_steps: 5
estimated_files: 3
---

# T01: Add completing-milestone phase to deriveState with tests

**Slice:** S01 — Milestone Completion Unit
**Milestone:** M002

## Description

Add the \`completing-milestone\` phase to the GSD state machine.

## Steps

1. Add \`'completing-milestone'\` to the \`Phase\` union type in \`types.ts\`.
2. In \`state.ts\`, modify the registry-building loop.

## Must-Haves

- [ ] \`Phase\` type includes \`'completing-milestone'\`
- [ ] \`deriveState\` returns \`phase: 'completing-milestone'\` when all slices are \`[x]\` and no \`M00x-SUMMARY.md\` exists
- [ ] \`deriveState\` returns milestone as \`'complete'\` and advances when summary exists
- [ ] All 63+ existing \`deriveState\` tests pass without modification
- [ ] New test fixtures cover single-milestone and multi-milestone completing-milestone scenarios

## Verification

- Run tests
- All existing 63 assertions pass

## Observability Impact

- Signals added/changed: \`completing-milestone\` phase now visible
- How a future agent inspects this: Run \`deriveState(basePath)\`
- Failure state exposed: If \`deriveState\` doesn't detect the phase

## Inputs

- \`agent/extensions/gsd/types.ts\` — Phase type definition

## Expected Output

- \`agent/extensions/gsd/types.ts\` — Phase union includes \`'completing-milestone'\`
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 5, 'real plan has 5 must-haves');
  assertTrue(result[0].text.includes('`Phase` type includes'), 'first must-have text matches');
  assertTrue(result[1].text.includes('`deriveState` returns'), 'second must-have text matches');
  assertEq(result[0].checked, false, 'all real must-haves are unchecked');
  assertEq(result[4].checked, false, 'last real must-have is unchecked');
  assertTrue(result[4].text.includes('multi-milestone'), 'last must-have references multi-milestone');
}

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseTaskPlanMustHaves: empty string ===');
{
  const result = parseTaskPlanMustHaves('');
  assertEq(result.length, 0, 'empty string returns empty array');
}

console.log('\n=== parseTaskPlanMustHaves: must-haves with inline code and backticks ===');
{
  const content = `## Must-Haves

- [ ] \`functionName\` is exported from \`module.ts\`
- [x] Returns \`Array<{ text: string }>\` with correct extraction
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 2, 'handles backtick content');
  assertTrue(result[0].text.includes('`functionName`'), 'preserves backticks in text');
  assertEq(result[0].checked, false, 'backtick item unchecked');
  assertEq(result[1].checked, true, 'backtick item checked');
}

console.log('\n=== parseTaskPlanMustHaves: asterisk bullets ===');
{
  const content = `## Must-Haves

* [ ] Asterisk unchecked
* [x] Asterisk checked
* Plain asterisk
`;
  const result = parseTaskPlanMustHaves(content);
  assertEq(result.length, 3, 'handles asterisk bullets');
  assertEq(result[0].checked, false, 'asterisk unchecked');
  assertEq(result[1].checked, true, 'asterisk checked');
  assertEq(result[2].checked, false, 'plain asterisk unchecked');
}

// ═══════════════════════════════════════════════════════════════════════════

report();
