---
# Optional scope estimate — helps the plan quality validator detect over-scoped tasks.
# Tasks with 10+ estimated steps or 12+ estimated files trigger a warning to consider splitting.
estimated_steps: {{estimatedSteps}}
estimated_files: {{estimatedFiles}}
---

# {{taskId}}: {{taskTitle}}

**Slice:** {{sliceId}} — {{sliceTitle}}
**Milestone:** {{milestoneId}}

## Description

{{description}}

## Steps

1. {{step}}
2. {{step}}
3. {{step}}

## Must-Haves

- [ ] {{mustHave}}
- [ ] {{mustHave}}

## Verification

- {{howToVerifyThisTaskIsActuallyDone}}
- {{commandToRun_OR_behaviorToCheck}}

## Observability Impact

<!-- OMIT THIS SECTION ENTIRELY for simple tasks that don't touch runtime boundaries,
     async flows, APIs, background processes, or error paths.
     Include it only when the task meaningfully changes how failures are detected or diagnosed. -->

- Signals added/changed: {{structured logs, statuses, errors, metrics}}
- How a future agent inspects this: {{command, endpoint, file, UI state}}
- Failure state exposed: {{what becomes visible on failure}}

## Inputs

- `{{filePath}}` — {{whatThisTaskNeedsFromPriorWork}}
- {{priorTaskSummaryInsight}}

## Expected Output

<!-- This task should produce a real increment toward making the slice goal/demo true. A full slice plan should not be able to mark every task complete while the claimed slice behavior still does not work at the stated proof level. -->

- `{{filePath}}` — {{whatThisTaskShouldProduceOrModify}}
