// Tests for pruneActivityLogs — age-based activity log pruning with
// highest-seq preservation invariant — plus step-11 prompt text assertion.
//
// Sections:
//   (a) Basic pruning: one old file deleted, two recent survive
//   (b) Highest-seq preserved even when all files are old
//   (c) retentionDays=0 boundary: all non-highest-seq deleted
//   (d) No-op when all files are recent
//   (e) Empty directory: no crash
//   (f) All old files: only highest-seq survives
//   (g) Single file: always preserved (it IS highest-seq)
//   (h) Seq number is tie-breaker (010 beats 001 lexicographically and numerically)
//   (i) Non-matching filenames ignored: notes.txt survives, no crash
//   (j) Step-11 prompt text: "refresh current state if needed"

import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { pruneActivityLogs } from '../activity-log.ts';
import { createTestContext } from './test-helpers.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));


const { assertEq, assertTrue, report } = createTestContext();
// ─── Fixture helpers ───────────────────────────────────────────────────────

let tmpDirs: string[] = [];

function createTmpActivityDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-prune-test-'));
  tmpDirs.push(dir);
  return dir;
}

function writeActivityFile(activityDir: string, seq: string, name: string): string {
  mkdirSync(activityDir, { recursive: true });
  const filePath = join(activityDir, `${seq}-${name}.jsonl`);
  writeFileSync(filePath, `{"seq":${parseInt(seq, 10)},"name":"${name}"}\n`, 'utf-8');
  return filePath;
}

/** Set mtime to daysAgo days in the past. */
function backdateFile(filePath: string, daysAgo: number): void {
  const pastMs = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const pastDate = new Date(pastMs);
  utimesSync(filePath, pastDate, pastDate);
}

function cleanup(): void {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
}

process.on('exit', cleanup);

// ─── Helper: get sorted filenames (basenames only) in a directory ──────────

function listFiles(dir: string): string[] {
  return readdirSync(dir).sort();
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ─── (a) Basic pruning ────────────────────────────────────────────────────
  console.log('\n── (a) Basic pruning: one old file deleted, two recent survive');

  {
    const dir = createTmpActivityDir();
    const f001 = writeActivityFile(dir, '001', 'execute-task-M001-S01-T01');
    const _f002 = writeActivityFile(dir, '002', 'execute-task-M001-S01-T02');
    const _f003 = writeActivityFile(dir, '003', 'execute-task-M001-S01-T03');

    backdateFile(f001, 40); // older than 30-day retention

    pruneActivityLogs(dir, 30);

    const remaining = listFiles(dir);
    assertTrue(
      !remaining.includes('001-execute-task-M001-S01-T01.jsonl'),
      '(a) file 001 deleted (40 days old, past 30-day threshold)',
    );
    assertTrue(
      remaining.includes('002-execute-task-M001-S01-T02.jsonl'),
      '(a) file 002 survives (recent)',
    );
    assertTrue(
      remaining.includes('003-execute-task-M001-S01-T03.jsonl'),
      '(a) file 003 survives (recent, also highest-seq)',
    );
  }

  // ─── (b) Highest-seq preserved even when all files are old ───────────────
  console.log('\n── (b) Highest-seq preserved even when all files are old');

  {
    const dir = createTmpActivityDir();
    const f001 = writeActivityFile(dir, '001', 'execute-task-M001-S01-T01');
    const f002 = writeActivityFile(dir, '002', 'execute-task-M001-S01-T02');
    const f003 = writeActivityFile(dir, '003', 'execute-task-M001-S01-T03');

    backdateFile(f001, 40);
    backdateFile(f002, 40);
    backdateFile(f003, 40); // all old, but 003 is highest-seq

    pruneActivityLogs(dir, 30);

    const remaining = listFiles(dir);
    assertEq(remaining.length, 1, '(b) exactly 1 file survives when all are old');
    assertTrue(
      remaining.includes('003-execute-task-M001-S01-T03.jsonl'),
      '(b) highest-seq file (003) is the survivor',
    );
  }

  // ─── (c) retentionDays=0 boundary ────────────────────────────────────────
  console.log('\n── (c) retentionDays=0: all non-highest-seq deleted even if brand-new');

  {
    const dir = createTmpActivityDir();
    // All files have mtime=now (freshly written — no backdating)
    writeActivityFile(dir, '001', 'execute-task-M002-S01-T01');
    writeActivityFile(dir, '002', 'execute-task-M002-S01-T02');
    writeActivityFile(dir, '003', 'execute-task-M002-S01-T03');

    pruneActivityLogs(dir, 0); // cutoff = now → everything is "expired"

    const remaining = listFiles(dir);
    assertEq(remaining.length, 1, '(c) retentionDays=0: exactly 1 file survives');
    assertTrue(
      remaining.includes('003-execute-task-M002-S01-T03.jsonl'),
      '(c) retentionDays=0: only highest-seq (003) survives',
    );
  }

  // ─── (d) No-op when all files are recent ─────────────────────────────────
  console.log('\n── (d) No-op when all files are recent');

  {
    const dir = createTmpActivityDir();
    writeActivityFile(dir, '001', 'execute-task-M003-S01-T01');
    writeActivityFile(dir, '002', 'execute-task-M003-S01-T02');
    writeActivityFile(dir, '003', 'execute-task-M003-S01-T03');
    // No backdating — all files are fresh

    pruneActivityLogs(dir, 30);

    const remaining = listFiles(dir);
    assertEq(remaining.length, 3, '(d) all 3 files survive when all are recent');
  }

  // ─── (e) Empty directory: no crash ────────────────────────────────────────
  console.log('\n── (e) Empty directory: no crash');

  {
    const dir = createTmpActivityDir();
    // dir exists but is empty

    let threw = false;
    try {
      pruneActivityLogs(dir, 30);
    } catch {
      threw = true;
    }

    assertTrue(!threw, '(e) pruneActivityLogs does not throw on empty directory');
    assertTrue(
      readdirSync(dir).length === 0,
      '(e) directory still exists and is still empty after no-op',
    );
  }

  // ─── (f) All old files: only highest-seq survives ─────────────────────────
  console.log('\n── (f) All old files: only highest-seq survives');

  {
    const dir = createTmpActivityDir();
    const f004 = writeActivityFile(dir, '004', 'execute-task-M004-S01-T01');
    const f005 = writeActivityFile(dir, '005', 'execute-task-M004-S01-T02');
    const f006 = writeActivityFile(dir, '006', 'execute-task-M004-S01-T03');

    backdateFile(f004, 60);
    backdateFile(f005, 60);
    backdateFile(f006, 60);

    pruneActivityLogs(dir, 30);

    const remaining = listFiles(dir);
    assertEq(remaining.length, 1, '(f) exactly 1 file survives when all are old');
    assertTrue(
      remaining[0].startsWith('006-'),
      '(f) the surviving file starts with 006 (highest-seq)',
    );
  }

  // ─── (g) Single file: always preserved ────────────────────────────────────
  console.log('\n── (g) Single file: always preserved (it IS highest-seq)');

  {
    const dir = createTmpActivityDir();
    const f001 = writeActivityFile(dir, '001', 'execute-task-M005-S01-T01');
    backdateFile(f001, 100); // very old

    pruneActivityLogs(dir, 30);

    const remaining = listFiles(dir);
    assertEq(remaining.length, 1, '(g) single file survives even when very old (it is the highest-seq)');
    assertTrue(
      remaining.includes('001-execute-task-M005-S01-T01.jsonl'),
      '(g) the single file (001) is preserved',
    );
  }

  // ─── (h) Seq tie-breaker: 010 is higher than 001 ─────────────────────────
  console.log('\n── (h) Seq number tie-breaker: 010 beats 001 numerically');

  {
    const dir = createTmpActivityDir();
    const f001 = writeActivityFile(dir, '001', 'execute-task-M006-S01-T01');
    const f010 = writeActivityFile(dir, '010', 'execute-task-M006-S01-T10');

    backdateFile(f001, 40);
    backdateFile(f010, 40); // both old; 010 is numerically highest

    pruneActivityLogs(dir, 30);

    const remaining = listFiles(dir);
    assertEq(remaining.length, 1, '(h) exactly 1 file survives');
    assertTrue(
      remaining.includes('010-execute-task-M006-S01-T10.jsonl'),
      '(h) seq 010 (numeric 10) survives over seq 001 (numeric 1)',
    );
  }

  // ─── (i) Non-matching filenames ignored ───────────────────────────────────
  console.log('\n── (i) Non-matching filenames ignored: notes.txt survives, no crash');

  {
    const dir = createTmpActivityDir();
    const f001 = writeActivityFile(dir, '001', 'execute-task-M007-S01-T01');
    const notesPath = join(dir, 'notes.txt');
    writeFileSync(notesPath, 'some notes\n', 'utf-8');

    backdateFile(f001, 40); // eligible for pruning
    // notes.txt never gets a seq prefix → should be ignored by pruner

    let threw = false;
    try {
      pruneActivityLogs(dir, 30);
    } catch {
      threw = true;
    }

    assertTrue(!threw, '(i) no crash when non-matching file is present');

    const remaining = listFiles(dir);
    assertTrue(
      remaining.includes('notes.txt'),
      '(i) notes.txt (non-matching filename) survives pruning unchanged',
    );
    // 001 is deleted (old, and notes.txt is not counted as seq-bearing so 001 is not "highest")
    // But wait — 001 IS the only seq file, making it highest-seq → it survives
    assertTrue(
      remaining.includes('001-execute-task-M007-S01-T01.jsonl'),
      '(i) seq 001 survives (it is the highest-seq among seq files)',
    );
  }

  // ─── (j) Step-11 prompt text assertion ────────────────────────────────────
  console.log('\n── (j) Step-11 prompt text: "refresh current state if needed"');

  {
    const { readFileSync } = await import('node:fs');
    const promptPath = join(__dirname, '..', 'prompts', 'complete-slice.md');
    const content = readFileSync(promptPath, 'utf-8');

    assertTrue(
      content.includes('refresh current state if needed'),
      '(j) complete-slice.md step 11 contains "refresh current state if needed"',
    );
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
