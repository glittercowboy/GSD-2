/**
 * GSD file parser type definitions.
 *
 * Types for the native Rust parser that handles `.gsd/` directory files
 * containing YAML-like frontmatter and markdown sections.
 */

export interface FrontmatterResult {
  /** Parsed frontmatter as a JSON string of key-value pairs. */
  metadata: string;
  /** Body content after the frontmatter block. */
  body: string;
}

export interface SectionResult {
  /** The section content, or empty string if not found. */
  content: string;
  /** Whether the section was found. */
  found: boolean;
}

export interface ParsedGsdFile {
  /** Relative path from the base directory. */
  path: string;
  /** Parsed frontmatter as JSON string. */
  metadata: string;
  /** Body content after frontmatter. */
  body: string;
  /** Map of section heading to content, serialized as JSON. */
  sections: string;
}

export interface BatchParseResult {
  /** All parsed files. */
  files: ParsedGsdFile[];
  /** Number of files processed. */
  count: number;
}

export interface NativeRoadmapSlice {
  id: string;
  title: string;
  risk: string;
  depends: string[];
  done: boolean;
  demo: string;
}

export interface NativeBoundaryMapEntry {
  fromSlice: string;
  toSlice: string;
  produces: string;
  consumes: string;
}

export interface NativeRoadmap {
  title: string;
  vision: string;
  successCriteria: string[];
  slices: NativeRoadmapSlice[];
  boundaryMap: NativeBoundaryMapEntry[];
}
