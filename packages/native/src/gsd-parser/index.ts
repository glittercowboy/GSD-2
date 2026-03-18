/**
 * GSD file parser — native Rust implementation.
 *
 * Parses `.gsd/` directory markdown files containing YAML-like frontmatter
 * and structured sections. Replaces the JS regex-based parser for
 * performance-critical batch operations.
 */

import { native } from "../native.js";
import type {
  BatchParseResult,
  FrontmatterResult,
  NativeRoadmap,
  SectionResult,
} from "./types.js";

export type {
  BatchParseResult,
  FrontmatterResult,
  NativeBoundaryMapEntry,
  NativeRoadmap,
  NativeRoadmapSlice,
  ParsedGsdFile,
  SectionResult,
} from "./types.js";

/**
 * Parse YAML-like frontmatter from markdown content.
 *
 * Returns `{ metadata, body }` where `metadata` is a JSON string
 * of the parsed frontmatter key-value pairs. Parse it with `JSON.parse()`.
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  return (native as Record<string, Function>).parseFrontmatter(
    content,
  ) as FrontmatterResult;
}

/**
 * Extract a section from markdown content by heading name.
 *
 * @param content  Markdown content to search.
 * @param heading  Heading text to match (without the `#` prefix).
 * @param level    Heading level (default 2 for `##`).
 */
export function extractSection(
  content: string,
  heading: string,
  level?: number,
): SectionResult {
  return (native as Record<string, Function>).extractSection(
    content,
    heading,
    level,
  ) as SectionResult;
}

/**
 * Extract all sections at a given heading level.
 *
 * Returns a JSON string mapping heading names to their content.
 * Parse with `JSON.parse()`.
 */
export function extractAllSections(
  content: string,
  level?: number,
): string {
  return (native as Record<string, Function>).extractAllSections(
    content,
    level,
  ) as string;
}

/**
 * Batch-parse all `.md` files in a `.gsd/` directory tree.
 *
 * Reads and parses all markdown files under the given directory.
 * Each file gets frontmatter parsing and section extraction.
 */
export function batchParseGsdFiles(
  directory: string,
): BatchParseResult {
  return (native as Record<string, Function>).batchParseGsdFiles(
    directory,
  ) as BatchParseResult;
}

/**
 * Parse a roadmap file's content into structured data.
 *
 * Extracts title, vision, success criteria, slices (with risk/depends),
 * and boundary map entries.
 */
export function parseRoadmapFile(content: string): NativeRoadmap {
  return (native as Record<string, Function>).parseRoadmapFile(
    content,
  ) as NativeRoadmap;
}
