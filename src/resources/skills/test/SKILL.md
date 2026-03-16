---
name: test
description: Generate or run tests. Auto-detects test framework, generates comprehensive tests for source files, or runs existing test suites with failure analysis.
---

<objective>
Generate or run tests for the current project. This skill auto-detects the test framework in use, generates comprehensive tests for source files, or runs existing test suites and analyzes failures.

Accepts optional arguments:
- A file path: generate tests for that source file
- `run`: run the existing test suite and analyze results
- No arguments: suggest what to test based on recent changes
</objective>

<context>
This skill handles test generation and execution across multiple languages and frameworks. It adapts to whatever testing conventions the project already uses rather than imposing new ones.
</context>

<quick_start>

<step_1_detect_framework>

**Detect the test framework and conventions before doing anything else.**

Check these sources in order:

1. **package.json** (Node/JS/TS projects):
   - `scripts.test` for the test command
   - `devDependencies` for jest, vitest, mocha, ava, tap, node:test, playwright, cypress
   - `jest` or `vitest` config keys

2. **Config files**:
   - `jest.config.*`, `vitest.config.*`, `.mocharc.*`, `ava.config.*`
   - `pytest.ini`, `pyproject.toml` (look for `[tool.pytest]`), `setup.cfg`
   - `go.mod` (Go projects use `go test` by default)
   - `Cargo.toml` (Rust projects use `cargo test`)

3. **Existing test files**:
   - Scan for `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*` files
   - Read 1-2 existing test files to understand patterns, imports, assertion style, and structure
   - Note the directory structure (co-located tests vs `__tests__/` vs `tests/` vs `test/`)

4. **Record your findings**:
   - Framework name and version
   - Test file naming convention
   - Test file location convention
   - Import/require style
   - Assertion style (expect, assert, chai, etc.)
   - Any custom utilities, fixtures, or helpers used

</step_1_detect_framework>

<step_2_handle_arguments>

**Route based on the argument provided.**

- **File path given** -> Go to `generate_tests`
- **"run" given** -> Go to `run_tests`
- **No arguments** -> Go to `suggest_tests`

</step_2_handle_arguments>

<generate_tests>

**Generate tests for the specified source file.**

**A. Read and analyze the source file:**
- Identify all exported/public functions, classes, methods, and types
- Understand each function's parameters, return types, and side effects
- Note error handling patterns (throws, returns null, returns Result, etc.)
- Identify dependencies that will need mocking

**B. Read existing test files in the project (1-2 files minimum):**
- Match their import style exactly
- Match their describe/it or test block structure
- Match their assertion patterns
- Match their mock/stub approach
- Use the same test utilities and helpers

**C. Generate tests covering:**

1. **Happy paths**: Normal expected inputs produce correct outputs
2. **Edge cases**:
   - Empty inputs (empty string, empty array, null, undefined, zero)
   - Boundary values (min/max integers, very long strings)
   - Single element collections
3. **Error handling**:
   - Invalid inputs that should throw or return errors
   - Missing required parameters
   - Type mismatches (if applicable)
4. **Async behavior** (if the function is async):
   - Successful resolution
   - Rejection/error cases
   - Timeout scenarios (if relevant)
5. **Dependencies**:
   - Mock external dependencies (APIs, databases, file system)
   - Verify correct interaction with dependencies (called with right args)

**D. Place the test file correctly:**
- Follow the project's existing convention for test file location
- Use the project's naming convention (`.test.ts`, `.spec.js`, `_test.go`, `test_*.py`, etc.)

**E. Run the generated tests immediately to verify they pass.**
- If tests fail, read the error output carefully
- Fix the test code (not the source code)
- Re-run until all tests pass

</generate_tests>

<run_tests>

**Run the existing test suite and analyze results.**

**A. Determine the test command:**
- Check `package.json` `scripts.test` for Node projects
- Use `pytest` for Python projects
- Use `go test ./...` for Go projects
- Use `cargo test` for Rust projects
- Fall back to the detected framework's CLI

**B. Run the tests:**
- Execute the test command
- Capture full output including failures and errors

**C. Analyze results:**
- Report total passed, failed, skipped counts
- For each failure:
  - Identify the failing test name and file
  - Show the assertion that failed (expected vs actual)
  - Read the relevant source code if needed
  - Provide a specific diagnosis of why it failed
  - Suggest a concrete fix (is it a test bug or a source bug?)

**D. Present a summary:**

```
Test Results: X passed, Y failed, Z skipped

Failures:
1. [test name] - [brief diagnosis]
   Fix: [specific suggestion]

2. [test name] - [brief diagnosis]
   Fix: [specific suggestion]
```

</run_tests>

<suggest_tests>

**Suggest what to test when no arguments are given.**

**A. Check recent changes:**
- Run `git diff --name-only HEAD~5` to find recently changed files
- Run `git diff --name-only --cached` for staged files
- Filter to source files (exclude configs, docs, lockfiles)

**B. Check test coverage gaps:**
- Find source files that have no corresponding test file
- Prioritize files that were recently modified

**C. Present suggestions:**

```
Suggested files to test (based on recent changes and coverage gaps):

1. [file path] - modified recently, no test file exists
2. [file path] - modified recently, tests exist but may need updating
3. [file path] - no test coverage found

Run `/test <file path>` to generate tests for any of these.
Run `/test run` to run the existing test suite.
```

</suggest_tests>

</quick_start>

<critical_rules>

1. **MATCH EXISTING PATTERNS**: Never impose a new test style. Always mirror what the project already does.
2. **READ BEFORE WRITING**: Always read existing test files before generating new ones.
3. **VERIFY GENERATED TESTS**: Always run generated tests. Untested test code is unreliable.
4. **DON'T MODIFY SOURCE CODE**: If generated tests fail, fix the tests, not the source. If the source has a real bug, report it to the user.
5. **MOCK EXTERNAL DEPENDENCIES**: Never let tests hit real APIs, databases, or file systems unless the project explicitly uses integration tests that way.
6. **ONE FILE AT A TIME**: Generate tests for one source file per invocation. Keep scope manageable.
7. **USE PROJECT DEPENDENCIES**: Only use test libraries already installed in the project. Do not add new dependencies without asking.

</critical_rules>

<success_criteria>

Before completing:
- [ ] Test framework and conventions were detected correctly
- [ ] Generated tests match the project's existing test style
- [ ] All generated tests pass when run
- [ ] Tests cover happy paths, edge cases, and error handling
- [ ] Test file is placed in the correct location with the correct naming convention
- [ ] No source code was modified

</success_criteria>
