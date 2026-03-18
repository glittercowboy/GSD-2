import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Load a JSON file with validation, returning a default on failure.
 * Handles missing files, corrupt JSON, and schema mismatches uniformly.
 */
export function loadJsonFile<T>(
  filePath: string,
  validate: (data: unknown) => data is T,
  defaultFactory: () => T,
): T {
  try {
    if (!existsSync(filePath)) return defaultFactory();
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return validate(parsed) ? parsed : defaultFactory();
  } catch {
    return defaultFactory();
  }
}

/**
 * Load a JSON file with validation, returning null on failure.
 * For callers that distinguish "no data" from "default data".
 */
export function loadJsonFileOrNull<T>(
  filePath: string,
  validate: (data: unknown) => data is T,
): T | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Save a JSON file, creating parent directories as needed.
 * Non-fatal — swallows errors to prevent persistence from breaking operations.
 */
export function saveJsonFile<T>(filePath: string, data: T): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } catch {
    // Non-fatal — don't let persistence failures break operation
  }
}
