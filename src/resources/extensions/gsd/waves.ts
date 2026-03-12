/**
 * Wave Computation — groups independent tasks for parallel execution.
 *
 * Tasks that don't share files can run concurrently in the same wave.
 * Tasks with no `files` field are treated as conflicting with everything
 * (conservative: unknown scope → forced sequential).
 */

import type { TaskPlanEntry } from "./types.js";

/** Lowercase, strip leading `./`, collapse duplicate `/`, trim. */
function normalizePath(p: string): string {
  return p
    .trim()
    .toLowerCase()
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/");
}

/** Pre-normalize a task's file list into a Set for O(1) lookups. */
function normalizedFileSet(files: string[]): Set<string> {
  return new Set(files.map(normalizePath));
}

/**
 * Returns `true` when `incomingFiles` conflicts with any task already in `wave`.
 * A wave entry with no files is always treated as conflicting (unknown scope).
 */
function hasFileConflict(
  incomingFiles: Set<string>,
  waveFiles: Set<string>[],
): boolean {
  for (const existingFiles of waveFiles) {
    for (const f of incomingFiles) {
      if (existingFiles.has(f)) return true;
    }
  }

  return false;
}

/**
 * Partition incomplete tasks into execution waves.
 *
 * Greedy left-to-right: each task is assigned to the earliest wave where
 * it has no file overlap. Tasks without a `files` list are placed alone
 * in a dedicated wave (forced sequential).
 *
 * @returns `waves[0]` is the first wave to execute.
 */
export function computeWaves(tasks: TaskPlanEntry[]): TaskPlanEntry[][] {
  const waves: TaskPlanEntry[][] = [];
  // Parallel array: pre-normalized file sets for each wave's tasks
  const waveFileSets: Set<string>[][] = [];

  for (const task of tasks) {
    // Unknown scope — isolate in a new trailing wave.
    if (!task.files || task.files.length === 0) {
      waves.push([task]);
      waveFileSets.push([]);
      continue;
    }

    const taskFiles = normalizedFileSet(task.files);

    // Find the first wave with no file conflict.
    let placed = false;
    for (let i = 0; i < waves.length; i++) {
      // Skip waves that contain unknown-scope tasks
      if (waveFileSets[i].length === 0 && waves[i].length > 0) continue;

      if (!hasFileConflict(taskFiles, waveFileSets[i])) {
        waves[i].push(task);
        waveFileSets[i].push(taskFiles);
        placed = true;
        break;
      }
    }

    if (!placed) {
      waves.push([task]);
      waveFileSets.push([taskFiles]);
    }
  }

  return waves;
}
