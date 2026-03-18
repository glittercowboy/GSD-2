/** Result of fuzzy text matching (exact match tried first, then normalized). */
export interface FuzzyMatchResult {
  /** Whether a match was found. */
  found: boolean;
  /** UTF-16 code unit index where the match starts (-1 if not found). */
  index: number;
  /** Length of the matched text in UTF-16 code units (0 if not found). */
  matchLength: number;
  /** Whether fuzzy (normalized) matching was used instead of exact. */
  usedFuzzyMatch: boolean;
  /**
   * Content to use for replacement operations.
   * Original content when exact match; normalized content when fuzzy match.
   */
  contentForReplacement: string;
}

/** Result of unified diff generation. */
export interface DiffResult {
  /** The unified diff string with line numbers. */
  diff: string;
  /** Line number of the first change in the new file (undefined if no changes). */
  firstChangedLine: number | undefined;
}
