/**
 * @gsd/native — High-performance Rust modules exposed via N-API.
 *
 * Modules:
 * - grep: ripgrep-backed regex search (content + filesystem)
 * - fd: fuzzy file path discovery for autocomplete and @-mention resolution
 */

export { searchContent, grep } from "./grep/index.js";
export type {
  ContextLine,
  GrepMatch,
  GrepOptions,
  GrepResult,
  SearchMatch,
  SearchOptions,
  SearchResult,
} from "./grep/index.js";

export { fuzzyFind } from "./fd/index.js";
export type {
  FuzzyFindMatch,
  FuzzyFindOptions,
  FuzzyFindResult,
} from "./fd/index.js";
