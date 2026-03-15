---
phase: 15
slug: tauri-shell
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 15 — Tauri Shell: Validation Strategy

> Per-phase validation contract reconstructed from PLAN and SUMMARY artifacts.
> State B: No prior VALIDATION.md — rebuilt by Nyquist auditor on 2026-03-15.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (TypeScript)** | bun:test (Bun v1.3.10) |
| **Config file** | none — bun:test discovered automatically |
| **Quick run command (TS)** | `bun test packages/mission-control/tests/tauri-scaffold.test.ts packages/mission-control/tests/tauri-dep-screen.test.ts packages/mission-control/tests/tauri-bun-ipc.test.ts` |
| **Full suite command (TS)** | `bun test packages/mission-control/tests/tauri-scaffold.test.ts packages/mission-control/tests/tauri-dep-screen.test.ts packages/mission-control/tests/tauri-bun-ipc.test.ts` |
| **Framework (Rust)** | cargo test |
| **Quick run command (Rust)** | `cargo test --test phase15_dep_check --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | ~8 seconds (TS); ~10 minutes first compile / <1s incremental (Rust) |

---

## Sampling Rate

- **After every task commit:** Run TS quick command (~8s)
- **After every plan wave:** Run TS + Rust suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds (TypeScript); first Rust compile is slow

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | TAURI-01 | integration | `bun test packages/mission-control/tests/tauri-scaffold.test.ts` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | TAURI-01 | integration | `bun test packages/mission-control/tests/tauri-scaffold.test.ts` | ✅ | ✅ green |
| 15-01-03 | 01 | 1 | TAURI-01 | integration | `bun test packages/mission-control/tests/tauri-scaffold.test.ts` | ✅ | ✅ green |
| 15-02-01 | 02 | 2 | TAURI-02 | integration | `bun test packages/mission-control/tests/tauri-bun-ipc.test.ts` | ✅ | ✅ green |
| 15-02-02 | 02 | 2 | TAURI-02 | integration | `bun test packages/mission-control/tests/tauri-bun-ipc.test.ts` | ✅ | ✅ green |
| 15-03-01 | 03 | 3 | TAURI-03 | integration | `bun test packages/mission-control/tests/tauri-dep-screen.test.ts` | ✅ | ✅ green |
| 15-03-02 | 03 | 3 | TAURI-03 | integration | `bun test packages/mission-control/tests/tauri-dep-screen.test.ts` | ✅ | ✅ green |
| 15-04-01 | 04 | 4 | TAURI-05 | integration | `bun test packages/mission-control/tests/tauri-bun-ipc.test.ts` | ✅ | ✅ green |
| 15-04-02 | 04 | 4 | TAURI-04 | integration | `bun test packages/mission-control/tests/tauri-scaffold.test.ts` | ✅ | ✅ green |
| 15-05-01 | 05 | 5 | TAURI-06 | integration | `bun test packages/mission-control/tests/tauri-scaffold.test.ts` | ✅ | ✅ green |
| 15-05-02 | 05 | 5 | TAURI-06 | manual | see SC-1 through SC-5 in Manual-Only section | N/A | ✅ SC-1 approved |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Rust Unit Tests

| Test File | Command | Tests | Status |
|-----------|---------|-------|--------|
| `src-tauri/tests/phase15_dep_check.rs` | `cargo test --test phase15_dep_check --manifest-path src-tauri/Cargo.toml` | 8 | ✅ green |

**Rust test coverage:**
- `dep_check_tests::dependency_checker_finds_a_known_present_binary` — TAURI-03
- `dep_check_tests::dependency_checker_returns_false_for_nonexistent_binary` — TAURI-03
- `get_platform_tests::get_platform_returns_correct_string_for_current_os` — TAURI-05
- `get_platform_tests::get_platform_matches_std_env_consts` — TAURI-05
- `timestamp_tests::unix_epoch_formats_as_1970_01_01` — TAURI-05 (token helpers)
- `timestamp_tests::known_timestamp_formats_correctly` — TAURI-05
- `timestamp_tests::parse_iso8601_returns_zero_for_short_string` — TAURI-05
- `timestamp_tests::format_and_parse_are_inverse_operations` — TAURI-05

---

## Requirement Coverage Summary

| Requirement | Description | Test File(s) | Rust Tests | Status |
|-------------|-------------|-------------|-----------|--------|
| TAURI-01 | src-tauri scaffold: Cargo.toml, tauri.conf.json, main.rs, lib.rs, gsd:// protocol, CSP, devUrl | `tauri-scaffold.test.ts` | — | ✅ COVERED |
| TAURI-02 | Bun lifecycle: spawn on start, BunState managed, kill on close, bun-crashed event | `tauri-bun-ipc.test.ts` | — | ✅ COVERED |
| TAURI-03 | Dep check: which/where bun+gsd, dep_screen.html shown, retry IPC command | `tauri-dep-screen.test.ts` | `phase15_dep_check.rs` | ✅ COVERED |
| TAURI-04 | Window state: size/position restored, window-state plugin, native title bar | `tauri-scaffold.test.ts` | — | ✅ COVERED |
| TAURI-05 | IPC commands: open_folder_dialog, get/set/delete_credential, open_external, get_platform, restart_bun | `tauri-bun-ipc.test.ts` | `phase15_dep_check.rs` | ✅ COVERED |
| TAURI-06 | Build pipeline: tauri:dev + tauri:build scripts, beforeDevCommand starts Bun | `tauri-scaffold.test.ts` | — | ✅ COVERED |

---

## Wave 0 Requirements

No Wave 0 setup required — bun:test is already the project test framework and no new dependencies are needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| SC-1: `npm run tauri:dev` opens native window with Mission Control UI | TAURI-06 | Requires full Rust build + running Tauri process + display | From repo root: `npm run tauri:dev` — verify native OS window opens and renders Mission Control | ✅ Approved (2026-03-13) |
| SC-2: Closing native window kills Bun (no orphaned process) | TAURI-02 | Requires live process observation | With window open, close it; check Task Manager — no orphaned `bun` process | Deferred M2 |
| SC-3: Dep screen shown when bun/gsd absent | TAURI-03 | Requires PATH manipulation | Temporarily rename `bun` on PATH, run `tauri:dev`; dep screen should appear | Deferred M2 |
| SC-4: Window size/position restores on relaunch | TAURI-04 | Requires two sequential window launches | Resize window, close, relaunch; window opens at same size/position | Deferred M2 |
| SC-5: `npm run tauri:build` produces installer | TAURI-06 | Full Rust release compile (~10 min); produces .msi/.exe on Windows | `npm run tauri:build`; check `src-tauri/target/release/bundle/` | Deferred M2 |

---

## Test File Summary

| File | Type | Requirement(s) | Tests | Status |
|------|------|---------------|-------|--------|
| `packages/mission-control/tests/tauri-scaffold.test.ts` | TypeScript / bun:test | TAURI-01, TAURI-04, TAURI-06 | 19 | ✅ green |
| `packages/mission-control/tests/tauri-dep-screen.test.ts` | TypeScript / bun:test | TAURI-03 | 17 | ✅ green |
| `packages/mission-control/tests/tauri-bun-ipc.test.ts` | TypeScript / bun:test | TAURI-02, TAURI-05 | 21 | ✅ green |
| `src-tauri/tests/phase15_dep_check.rs` | Rust / cargo test | TAURI-03, TAURI-05 | 8 | ✅ green |

**Total automated tests: 65 (57 TypeScript + 8 Rust)**

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (no Wave 0 needed — existing infra)
- [x] No watch-mode flags
- [x] Feedback latency < 10s (TypeScript suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-15
