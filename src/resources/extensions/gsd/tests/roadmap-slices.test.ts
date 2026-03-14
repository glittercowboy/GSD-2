import { parseRoadmap } from "../files.ts";
import { parseRoadmapSlices } from "../roadmap-slices.ts";
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();
const content = `# M003: Current

**Vision:** Build the thing.

## Slices
- [x] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: First demo works.
- [ ] **S02: Second Slice** \`risk:medium\` \`depends:[S01]\`
- [x] **S03: Third Slice** \`depends:[S01, S02]\`
  > After this: Third demo works.

## Boundary Map
### S01 → S02
Produces:
  foo.ts
`;

console.log("\n=== parseRoadmapSlices ===");
const slices = parseRoadmapSlices(content);
assertEq(slices.length, 3, "slice count");
assertEq(slices[0]?.id, "S01", "first id");
assertEq(slices[0]?.done, true, "first done");
assertEq(slices[0]?.demo, "First demo works.", "first demo");
assertEq(slices[1]?.depends, ["S01"], "second depends");
assertEq(slices[1]?.risk, "medium", "second risk");
assertEq(slices[2]?.risk, "low", "missing risk defaults to low");
assertEq(slices[2]?.depends, ["S01", "S02"], "third depends");

console.log("\n=== parseRoadmap integration ===");
const roadmap = parseRoadmap(content);
assertEq(roadmap.slices, slices, "parseRoadmap uses extracted slice parser");
assertEq(roadmap.title, "M003: Current", "roadmap title preserved");
assertEq(roadmap.vision, "Build the thing.", "roadmap vision preserved");
assertTrue(roadmap.boundaryMap.length === 1, "boundary map still parsed");

report();
