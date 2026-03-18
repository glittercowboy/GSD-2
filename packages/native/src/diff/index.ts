/**
 * Native fuzzy text matching and diff generation for the edit tool.
 *
 * Uses the `similar` Rust crate (Myers' algorithm) for O(n+d) diffing,
 * and single-pass Unicode normalization for fuzzy matching.
 */

import { native } from "../native.js";
import type { DiffResult, FuzzyMatchResult } from "./types.js";

export type { DiffResult, FuzzyMatchResult };

/**
 * Normalize text for fuzzy matching:
 * - Strip trailing whitespace from each line
 * - Smart quotes to ASCII equivalents
 * - Unicode dashes/hyphens to ASCII hyphen
 * - Special Unicode spaces to regular space
 */
export function normalizeForFuzzyMatch(text: string): string {
  return (native as Record<string, Function>).normalizeForFuzzyMatch(
    text,
  ) as string;
}

/**
 * Find `oldText` in `content`, trying exact match first, then fuzzy match.
 *
 * When fuzzy matching is used, `contentForReplacement` is the normalized
 * version of `content`.
 */
export function fuzzyFindText(
  content: string,
  oldText: string,
): FuzzyMatchResult {
  return (native as Record<string, Function>).fuzzyFindText(
    content,
    oldText,
  ) as FuzzyMatchResult;
}

/**
 * Generate a unified diff string with line numbers and context.
 *
 * Uses Myers' diff algorithm via the `similar` Rust crate.
 *
 * @param oldContent  Original text
 * @param newContent  Modified text
 * @param contextLines  Number of context lines around changes (default: 4)
 */
export function generateDiff(
  oldContent: string,
  newContent: string,
  contextLines?: number,
): DiffResult {
  return (native as Record<string, Function>).generateDiff(
    oldContent,
    newContent,
    contextLines,
  ) as DiffResult;
}
