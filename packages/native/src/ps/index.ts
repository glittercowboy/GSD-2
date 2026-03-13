/**
 * Cross-platform process tree management via N-API.
 *
 * Provides efficient process tree enumeration and termination
 * using platform-native APIs (libproc on macOS, /proc on Linux,
 * Toolhelp32 on Windows).
 */

import { native } from "../native.js";

/**
 * Kill a process tree (the process and all its descendants).
 *
 * Kills children first (bottom-up) to prevent orphan re-parenting issues.
 * @param pid - Root process ID
 * @param signal - Signal to send (e.g. 9 for SIGKILL, 15 for SIGTERM). Ignored on Windows.
 * @returns Number of processes successfully killed.
 */
export function killTree(pid: number, signal: number): number {
  return native.killTree(pid, signal);
}

/**
 * List all descendant PIDs of a process.
 *
 * @param pid - Parent process ID
 * @returns Array of descendant PIDs (empty if no children or process doesn't exist).
 */
export function listDescendants(pid: number): number[] {
  return native.listDescendants(pid);
}

/**
 * Get the process group ID for a process.
 *
 * @param pid - Process ID
 * @returns Process group ID, or null if the process doesn't exist or on Windows.
 */
export function processGroupId(pid: number): number | null {
  return native.processGroupId(pid);
}

/**
 * Kill an entire process group.
 *
 * @param pgid - Process group ID
 * @param signal - Signal to send
 * @returns true if the signal was delivered, false on failure or Windows.
 */
export function killProcessGroup(pgid: number, signal: number): boolean {
  return native.killProcessGroup(pgid, signal);
}
