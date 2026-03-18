/** Options for fuzzy file path search. */
export interface FuzzyFindOptions {
  /** Fuzzy query to match against file paths (case-insensitive). */
  query: string;
  /** Directory to search. */
  path: string;
  /** Include hidden files (default: false). */
  hidden?: boolean;
  /** Respect .gitignore (default: true). */
  gitignore?: boolean;
  /** Maximum number of matches to return (default: 100). */
  maxResults?: number;
}

/** A single match in fuzzy find results. */
export interface FuzzyFindMatch {
  /** Relative path from the search root (uses `/` separators). Directories have a trailing `/`. */
  path: string;
  /** Whether this entry is a directory. */
  isDirectory: boolean;
  /** Match quality score (higher is better). */
  score: number;
}

/** Result of fuzzy file path search. */
export interface FuzzyFindResult {
  /** Matched entries (up to `maxResults`), sorted by score descending. */
  matches: FuzzyFindMatch[];
  /** Total number of matches found (may exceed `matches.length`). */
  totalMatches: number;
}
