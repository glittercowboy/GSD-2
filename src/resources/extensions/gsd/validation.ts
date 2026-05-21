/**
 * Shared input-validation primitives for GSD tool handlers.
 */

/** Type guard: value is a string with at least one non-whitespace character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Characters that are used as delimiters in GSD state management documents
 * and should not appear in milestone or slice titles.
 */
const TITLE_DELIMITER_RE = /[\u2014\u2013\/]/; // em dash, en dash, forward slash

/**
 * Check whether a milestone or slice title contains characters that conflict
 * with GSD's state document delimiter conventions.
 * Returns a human-readable description of the problem, or null if the title is safe.
 */
export function validateTitle(title: string): string | null {
  if (TITLE_DELIMITER_RE.test(title)) {
    const found: string[] = [];
    if (/[\u2014\u2013]/.test(title)) found.push("em/en dash (\u2014 or \u2013)");
    if (/\//.test(title)) found.push("forward slash (/)");
    return `title contains ${found.join(" and ")}, which conflict with GSD state document delimiters`;
  }
  return null;
}

/**
 * Validate that `value` is an array of non-empty strings.
 * Throws with a message referencing `field` on failure.
 * Returns the validated array (narrowed to string[]).
 */
export function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    const received = value === null ? "null" : typeof value;
    throw new Error(`${field} must be an array of strings, not ${received}`);
  }
  if (value.some((item) => !isNonEmptyString(item))) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  return value;
}
