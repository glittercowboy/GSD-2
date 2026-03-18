//! Fuzzy text matching and unified diff generation for the edit tool.
//!
//! Replaces the JS `edit-diff.ts` hot path with native Rust:
//! - `normalizeForFuzzyMatch`: Unicode normalization (smart quotes, dashes, special spaces, trailing whitespace)
//! - `fuzzyFindText`: exact-then-fuzzy substring search
//! - `generateDiff`: unified diff with line numbers and context, matching the JS output format

use napi_derive::napi;

// ---------------------------------------------------------------------------
// normalizeForFuzzyMatch
// ---------------------------------------------------------------------------

/// Normalize text for fuzzy matching:
/// - Strip trailing whitespace from each line
/// - Smart single quotes → '
/// - Smart double quotes → "
/// - Various dashes/hyphens → -
/// - Special Unicode spaces → regular space
#[napi(js_name = "normalizeForFuzzyMatch")]
pub fn normalize_for_fuzzy_match(text: String) -> String {
    normalize_impl(&text)
}

fn normalize_impl(text: &str) -> String {
    let mut out = String::with_capacity(text.len());

    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            out.push('\n');
        }
        let trimmed = line.trim_end();
        for ch in trimmed.chars() {
            out.push(normalize_char(ch));
        }
    }

    out
}

#[inline]
fn normalize_char(ch: char) -> char {
    match ch {
        // Smart single quotes → '
        '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}' => '\'',
        // Smart double quotes → "
        '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => '"',
        // Various dashes/hyphens → -
        '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}'
        | '\u{2212}' => '-',
        // Special spaces → regular space
        '\u{00A0}' | '\u{2002}' | '\u{2003}' | '\u{2004}' | '\u{2005}' | '\u{2006}'
        | '\u{2007}' | '\u{2008}' | '\u{2009}' | '\u{200A}' | '\u{202F}' | '\u{205F}'
        | '\u{3000}' => ' ',
        _ => ch,
    }
}

// ---------------------------------------------------------------------------
// fuzzyFindText
// ---------------------------------------------------------------------------

#[napi(object)]
pub struct FuzzyMatchResult {
    pub found: bool,
    pub index: i32,
    pub match_length: i32,
    pub used_fuzzy_match: bool,
    /// When exact match: original content. When fuzzy match: normalized content.
    pub content_for_replacement: String,
}

/// Convert a UTF-8 byte offset to a JS string index (UTF-16 code unit offset).
fn byte_offset_to_utf16(s: &str, byte_offset: usize) -> usize {
    s[..byte_offset].chars().map(|c| c.len_utf16()).sum()
}

/// Get the UTF-16 code unit length of a UTF-8 string.
fn utf16_len(s: &str) -> usize {
    s.chars().map(|c| c.len_utf16()).sum()
}

/// Find `old_text` in `content`, trying exact match first, then fuzzy match.
///
/// Returns indices and lengths as UTF-16 code unit offsets (compatible with
/// JS `String.prototype.substring()`).
///
/// When fuzzy matching is used, `content_for_replacement` is the normalized
/// version of `content` (trailing whitespace stripped, Unicode quotes/dashes
/// normalized to ASCII).
#[napi(js_name = "fuzzyFindText")]
pub fn fuzzy_find_text(content: String, old_text: String) -> FuzzyMatchResult {
    // Try exact match first
    if let Some(byte_idx) = content.find(&old_text) {
        return FuzzyMatchResult {
            found: true,
            index: byte_offset_to_utf16(&content, byte_idx) as i32,
            match_length: utf16_len(&old_text) as i32,
            used_fuzzy_match: false,
            content_for_replacement: content,
        };
    }

    // Try fuzzy match
    let fuzzy_content = normalize_impl(&content);
    let fuzzy_old_text = normalize_impl(&old_text);

    if let Some(byte_idx) = fuzzy_content.find(&fuzzy_old_text) {
        FuzzyMatchResult {
            found: true,
            index: byte_offset_to_utf16(&fuzzy_content, byte_idx) as i32,
            match_length: utf16_len(&fuzzy_old_text) as i32,
            used_fuzzy_match: true,
            content_for_replacement: fuzzy_content,
        }
    } else {
        FuzzyMatchResult {
            found: false,
            index: -1,
            match_length: 0,
            used_fuzzy_match: false,
            content_for_replacement: content,
        }
    }
}

// ---------------------------------------------------------------------------
// generateDiff
// ---------------------------------------------------------------------------

#[napi(object)]
pub struct DiffResult {
    pub diff: String,
    pub first_changed_line: Option<i32>,
}

/// Generate a unified diff string with line numbers and context.
///
/// Uses the `similar` crate (Myers' diff algorithm with optimizations).
/// Output format matches the JS `generateDiffString`:
/// - `+N line` for additions
/// - `-N line` for removals
/// - ` N line` for context
/// - ` ... ` for skipped context
#[napi(js_name = "generateDiff")]
pub fn generate_diff(old_content: String, new_content: String, context_lines: Option<u32>) -> DiffResult {
    let context = context_lines.unwrap_or(4) as usize;
    generate_diff_impl(&old_content, &new_content, context)
}

fn generate_diff_impl(old_content: &str, new_content: &str, context_lines: usize) -> DiffResult {
    let old_lines: Vec<&str> = old_content.split('\n').collect();
    let new_lines: Vec<&str> = new_content.split('\n').collect();

    let max_line_num = old_lines.len().max(new_lines.len());
    let line_num_width = if max_line_num == 0 {
        1
    } else {
        max_line_num.to_string().len()
    };

    // Use similar crate for diffing
    let diff = similar::TextDiff::configure()
        .algorithm(similar::Algorithm::Myers)
        .diff_lines(old_content, new_content);

    let mut output: Vec<String> = Vec::new();
    let mut old_line_num: usize = 1;
    let mut new_line_num: usize = 1;
    let mut last_was_change = false;
    let mut first_changed_line: Option<i32> = None;

    // Build parts from diff ops, matching the JS `diff` npm package structure
    #[derive(Debug)]
    enum PartTag {
        Equal,
        Added,
        Removed,
    }

    struct Part {
        tag: PartTag,
        lines: Vec<String>,
    }

    let mut parts: Vec<Part> = Vec::new();

    for op in diff.ops() {
        match op {
            similar::DiffOp::Equal { old_index, len, .. } => {
                let lines: Vec<String> = old_lines[*old_index..*old_index + *len]
                    .iter()
                    .map(|s| s.to_string())
                    .collect();
                parts.push(Part { tag: PartTag::Equal, lines });
            }
            similar::DiffOp::Delete { old_index, old_len, .. } => {
                let lines: Vec<String> = old_lines[*old_index..*old_index + *old_len]
                    .iter()
                    .map(|s| s.to_string())
                    .collect();
                parts.push(Part { tag: PartTag::Removed, lines });
            }
            similar::DiffOp::Insert { new_index, new_len, .. } => {
                let lines: Vec<String> = new_lines[*new_index..*new_index + *new_len]
                    .iter()
                    .map(|s| s.to_string())
                    .collect();
                parts.push(Part { tag: PartTag::Added, lines });
            }
            similar::DiffOp::Replace {
                old_index, old_len, new_index, new_len, ..
            } => {
                let del_lines: Vec<String> = old_lines[*old_index..*old_index + *old_len]
                    .iter()
                    .map(|s| s.to_string())
                    .collect();
                parts.push(Part { tag: PartTag::Removed, lines: del_lines });

                let ins_lines: Vec<String> = new_lines[*new_index..*new_index + *new_len]
                    .iter()
                    .map(|s| s.to_string())
                    .collect();
                parts.push(Part { tag: PartTag::Added, lines: ins_lines });
            }
        }
    }

    for (i, part) in parts.iter().enumerate() {
        let raw = &part.lines;

        match part.tag {
            PartTag::Added | PartTag::Removed => {
                if first_changed_line.is_none() {
                    first_changed_line = Some(new_line_num as i32);
                }

                for line in raw {
                    match part.tag {
                        PartTag::Added => {
                            let num = format!("{:>width$}", new_line_num, width = line_num_width);
                            output.push(format!("+{} {}", num, line));
                            new_line_num += 1;
                        }
                        PartTag::Removed => {
                            let num = format!("{:>width$}", old_line_num, width = line_num_width);
                            output.push(format!("-{} {}", num, line));
                            old_line_num += 1;
                        }
                        _ => unreachable!(),
                    }
                }
                last_was_change = true;
            }
            PartTag::Equal => {
                let next_part_is_change = i < parts.len() - 1
                    && matches!(parts[i + 1].tag, PartTag::Added | PartTag::Removed);

                if last_was_change || next_part_is_change {
                    let mut lines_to_show = raw.as_slice();
                    let mut skip_start = 0usize;
                    let mut skip_end = 0usize;

                    if !last_was_change {
                        // Show only last N lines as leading context
                        skip_start = raw.len().saturating_sub(context_lines);
                        lines_to_show = &raw[skip_start..];
                    }

                    if !next_part_is_change && lines_to_show.len() > context_lines {
                        // Show only first N lines as trailing context
                        skip_end = lines_to_show.len() - context_lines;
                        lines_to_show = &lines_to_show[..context_lines];
                    }

                    if skip_start > 0 {
                        output.push(format!(
                            " {:>width$} ...",
                            "",
                            width = line_num_width
                        ));
                        old_line_num += skip_start;
                        new_line_num += skip_start;
                    }

                    for line in lines_to_show {
                        let num = format!("{:>width$}", old_line_num, width = line_num_width);
                        output.push(format!(" {} {}", num, line));
                        old_line_num += 1;
                        new_line_num += 1;
                    }

                    if skip_end > 0 {
                        output.push(format!(
                            " {:>width$} ...",
                            "",
                            width = line_num_width
                        ));
                        old_line_num += skip_end;
                        new_line_num += skip_end;
                    }
                } else {
                    old_line_num += raw.len();
                    new_line_num += raw.len();
                }

                last_was_change = false;
            }
        }
    }

    DiffResult {
        diff: output.join("\n"),
        first_changed_line,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_smart_quotes() {
        let input = "\u{201C}hello\u{201D} \u{2018}world\u{2019}";
        assert_eq!(normalize_impl(input), "\"hello\" 'world'");
    }

    #[test]
    fn test_normalize_dashes() {
        let input = "a\u{2013}b\u{2014}c\u{2212}d";
        assert_eq!(normalize_impl(input), "a-b-c-d");
    }

    #[test]
    fn test_normalize_special_spaces() {
        let input = "a\u{00A0}b\u{2003}c\u{3000}d";
        assert_eq!(normalize_impl(input), "a b c d");
    }

    #[test]
    fn test_normalize_trailing_whitespace() {
        let input = "hello   \nworld  ";
        assert_eq!(normalize_impl(input), "hello\nworld");
    }

    #[test]
    fn test_fuzzy_find_exact() {
        let result = fuzzy_find_text("hello world".to_string(), "world".to_string());
        assert!(result.found);
        assert_eq!(result.index, 6);
        assert_eq!(result.match_length, 5);
        assert!(!result.used_fuzzy_match);
    }

    #[test]
    fn test_fuzzy_find_with_smart_quotes() {
        let content = "let x = \u{201C}hello\u{201D};".to_string();
        let old_text = "let x = \"hello\";".to_string();
        let result = fuzzy_find_text(content, old_text);
        assert!(result.found);
        assert!(result.used_fuzzy_match);
    }

    #[test]
    fn test_fuzzy_find_not_found() {
        let result = fuzzy_find_text("hello world".to_string(), "xyz".to_string());
        assert!(!result.found);
        assert_eq!(result.index, -1);
    }

    #[test]
    fn test_generate_diff_basic() {
        let old = "line1\nline2\nline3";
        let new_text = "line1\nmodified\nline3";
        let result = generate_diff_impl(old, new_text, 4);
        assert!(result.diff.contains("-"));
        assert!(result.diff.contains("+"));
        assert!(result.diff.contains("line2"));
        assert!(result.diff.contains("modified"));
        assert!(result.first_changed_line.is_some());
    }

    #[test]
    fn test_generate_diff_addition() {
        let old = "line1\nline3";
        let new_text = "line1\nline2\nline3";
        let result = generate_diff_impl(old, new_text, 4);
        assert!(result.diff.contains("+"));
        assert!(result.diff.contains("line2"));
    }

    #[test]
    fn test_generate_diff_deletion() {
        let old = "line1\nline2\nline3";
        let new_text = "line1\nline3";
        let result = generate_diff_impl(old, new_text, 4);
        assert!(result.diff.contains("-"));
        assert!(result.diff.contains("line2"));
    }

    #[test]
    fn test_generate_diff_context_ellipsis() {
        let mut old_lines: Vec<String> = (1..=20).map(|i| format!("line{}", i)).collect();
        let old = old_lines.join("\n");
        old_lines[10] = "modified".to_string();
        let new_text = old_lines.join("\n");
        let result = generate_diff_impl(&old, &new_text, 2);
        assert!(result.diff.contains("..."));
    }

    #[test]
    fn test_generate_diff_empty() {
        let result = generate_diff_impl("same", "same", 4);
        assert!(result.diff.is_empty());
        assert!(result.first_changed_line.is_none());
    }
}
