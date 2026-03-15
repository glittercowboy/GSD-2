# {{scope}} — Research

**Date:** {{date}}

## Summary

{{summary — 2-3 paragraphs with primary recommendation}}

## Recommendation

{{whatApproachToTake_AND_why}}

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| {{problem}} | {{solution}} | {{why}} |

## Codebase Landscape

- `{{filePath}}` — {{whatItDoesAndHowToReuseIt}}
- `{{filePath}}` — {{patternToFollowOrAvoid}}

## Planner Brief

<!-- Everything below this line is written FOR the planner. It must be detailed enough that the planner can write task plans with correct file paths, function signatures, and integration points without reading a single source file. -->

### File Inventory

<!-- List every file the planner will need to reference. Include purpose, key exports/functions, and dependencies. -->

- `{{filePath}}` — {{purpose, key exports/functions, what it depends on}}

### Integration Points

<!-- Describe exactly where new code hooks into existing code: file, function, and pattern. -->

- {{where new code hooks into existing code, with specific file + function + pattern}}

### Patterns to Follow

<!-- Name the pattern, show which file demonstrates it, and explain it in 1-2 sentences — enough for the planner to replicate it. -->

- **{{patternName}}**: used in `{{exampleFile}}` — {{how it works in 1-2 sentences, enough to replicate}}

### Key Constraints for Planning

<!-- Constraints that affect task decomposition or ordering (e.g. must migrate before adding columns, auth must exist before protected routes). -->

- {{constraint that affects task decomposition or ordering}}

## Constraints

- {{hardConstraintFromCodebaseOrRuntime}}
- {{constraintFromDependencies}}

## Common Pitfalls

- **{{pitfall}}** — {{howToAvoid}}
- **{{pitfall}}** — {{howToAvoid}}

## Open Risks

- {{riskThatCouldSurfaceDuringExecution}}

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| {{technology}} | {{owner/repo@skill}} | {{installed / available / none found}} |

## Sources

- {{whatWasLearned}} (source: [{{title}}]({{url}}))
