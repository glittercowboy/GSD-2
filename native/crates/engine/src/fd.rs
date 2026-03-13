//! Fuzzy file path discovery for autocomplete and @-mention resolution.
//!
//! Searches for files and directories whose paths match a query string via
//! subsequence scoring. Uses the `ignore` crate for directory walking
//! (respects `.gitignore`, hidden files, etc.).

use std::path::Path;

use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;

// ═══════════════════════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════════════════════

/// Options for fuzzy file path search.
#[napi(object)]
pub struct FuzzyFindOptions {
    /// Fuzzy query to match against file paths (case-insensitive).
    pub query: String,
    /// Directory to search.
    pub path: String,
    /// Include hidden files (default: false).
    pub hidden: Option<bool>,
    /// Respect .gitignore (default: true).
    pub gitignore: Option<bool>,
    /// Maximum number of matches to return (default: 100).
    #[napi(js_name = "maxResults")]
    pub max_results: Option<u32>,
}

/// A single match in fuzzy find results.
#[napi(object)]
pub struct FuzzyFindMatch {
    /// Relative path from the search root (uses `/` separators).
    pub path: String,
    /// Whether this entry is a directory.
    #[napi(js_name = "isDirectory")]
    pub is_directory: bool,
    /// Match quality score (higher is better).
    pub score: u32,
}

/// Result of fuzzy file path search.
#[napi(object)]
pub struct FuzzyFindResult {
    /// Matched entries (up to `maxResults`).
    pub matches: Vec<FuzzyFindMatch>,
    /// Total number of matches found (may exceed `matches.len()`).
    #[napi(js_name = "totalMatches")]
    pub total_matches: u32,
}

// ═══════════════════════════════════════════════════════════════════════════
// Path utilities
// ═══════════════════════════════════════════════════════════════════════════

/// Resolve a search path string to a canonical `PathBuf` (must be a directory).
fn resolve_search_path(path: &str) -> Result<std::path::PathBuf> {
    let candidate = std::path::PathBuf::from(path);
    let root = if candidate.is_absolute() {
        candidate
    } else {
        let cwd = std::env::current_dir()
            .map_err(|err| Error::from_reason(format!("Failed to resolve cwd: {err}")))?;
        cwd.join(candidate)
    };
    let metadata = std::fs::metadata(&root)
        .map_err(|err| Error::from_reason(format!("Path not found: {err}")))?;
    if !metadata.is_dir() {
        return Err(Error::from_reason(
            "Search path must be a directory".to_string(),
        ));
    }
    Ok(std::fs::canonicalize(&root).unwrap_or(root))
}

/// Check if a path component matches a target string.
fn contains_component(path: &Path, target: &str) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_some_and(|value| value == target)
    })
}

/// Skip `.git` directories and `node_modules`.
fn should_skip_path(path: &Path) -> bool {
    contains_component(path, ".git") || contains_component(path, "node_modules")
}

// ═══════════════════════════════════════════════════════════════════════════
// Scoring
// ═══════════════════════════════════════════════════════════════════════════

/// Strips separators, whitespace, and punctuation for normalized fuzzy comparison.
fn normalize_fuzzy_text(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_whitespace() && !matches!(ch, '/' | '\\' | '.' | '_' | '-'))
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

/// Scores a query as a subsequence of `target`. Returns 0 if not a subsequence.
fn fuzzy_subsequence_score(query_chars: &[char], target: &str) -> u32 {
    if query_chars.is_empty() {
        return 1;
    }
    let mut query_index = 0usize;
    let mut gaps = 0u32;
    let mut last_match_index: Option<usize> = None;
    for (target_index, target_ch) in target.chars().enumerate() {
        if query_index >= query_chars.len() {
            break;
        }
        if query_chars[query_index] == target_ch {
            if let Some(last_index) = last_match_index {
                if target_index > last_index + 1 {
                    gaps = gaps.saturating_add(1);
                }
            }
            last_match_index = Some(target_index);
            query_index += 1;
        }
    }
    if query_index != query_chars.len() {
        return 0;
    }
    let gap_penalty = gaps.saturating_mul(5);
    40u32.saturating_sub(gap_penalty).max(1)
}

/// Composite path scoring: exact > starts-with > contains > fuzzy subsequence.
fn score_fuzzy_path(
    path: &str,
    is_directory: bool,
    query_lower: &str,
    normalized_query: &str,
    query_chars: &[char],
) -> u32 {
    if query_lower.is_empty() {
        return if is_directory { 11 } else { 1 };
    }

    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path);
    let lower_file_name = file_name.to_lowercase();

    let mut score = if lower_file_name == query_lower {
        120
    } else if lower_file_name.starts_with(query_lower) {
        100
    } else if lower_file_name.contains(query_lower) {
        80
    } else {
        let lower_path = path.to_lowercase();
        if lower_path.contains(query_lower) {
            60
        } else {
            let normalized_file_name = normalize_fuzzy_text(file_name);
            let file_name_fuzzy = fuzzy_subsequence_score(query_chars, &normalized_file_name);
            if file_name_fuzzy > 0 {
                50 + file_name_fuzzy
            } else {
                let normalized_path = normalize_fuzzy_text(path);
                let path_fuzzy = if normalized_path == normalized_query {
                    40
                } else {
                    fuzzy_subsequence_score(query_chars, &normalized_path)
                };
                if path_fuzzy > 0 {
                    30 + path_fuzzy
                } else {
                    0
                }
            }
        }
    };

    if is_directory && score > 0 {
        score += 10;
    }

    score
}

// ═══════════════════════════════════════════════════════════════════════════
// Directory walking
// ═══════════════════════════════════════════════════════════════════════════

/// File type classification for discovered entries.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EntryType {
    File,
    Dir,
    Symlink,
}

/// A filesystem entry discovered during walking.
struct WalkEntry {
    /// Relative path from root (forward slashes).
    path: String,
    /// Entry type.
    entry_type: EntryType,
}

/// Walk a directory tree collecting entries.
fn walk_directory(
    root: &Path,
    include_hidden: bool,
    respect_gitignore: bool,
) -> Vec<WalkEntry> {
    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(!include_hidden)
        .follow_links(false)
        .sort_by_file_path(|a, b| a.cmp(b));

    if respect_gitignore {
        builder
            .git_ignore(true)
            .git_exclude(true)
            .git_global(true)
            .ignore(true)
            .parents(true);
    } else {
        builder
            .git_ignore(false)
            .git_exclude(false)
            .git_global(false)
            .ignore(false)
            .parents(false);
    }

    let mut entries = Vec::new();
    for entry in builder.build() {
        let Ok(entry) = entry else { continue };
        let path = entry.path();

        if should_skip_path(path) {
            continue;
        }

        let relative = path.strip_prefix(root).unwrap_or(path);
        let relative_str = relative.to_string_lossy();
        if relative_str.is_empty() {
            continue;
        }

        // Normalize to forward slashes on all platforms.
        let relative_str = if cfg!(windows) && relative_str.contains('\\') {
            relative_str.replace('\\', "/")
        } else {
            relative_str.into_owned()
        };

        let Some(metadata) = std::fs::symlink_metadata(path).ok() else {
            continue;
        };
        let file_type = metadata.file_type();
        let entry_type = if file_type.is_symlink() {
            EntryType::Symlink
        } else if file_type.is_dir() {
            EntryType::Dir
        } else {
            EntryType::File
        };

        entries.push(WalkEntry {
            path: relative_str,
            entry_type,
        });
    }
    entries
}

// ═══════════════════════════════════════════════════════════════════════════
// Execution
// ═══════════════════════════════════════════════════════════════════════════

/// Saturating cast from u64 to u32.
fn clamp_u32(value: u64) -> u32 {
    value.min(u32::MAX as u64) as u32
}

/// Fuzzy file path search for autocomplete and @-mention resolution.
///
/// Searches for files and directories whose paths match the query string.
/// Results are sorted by match quality (higher score = better match).
#[napi(js_name = "fuzzyFind")]
pub fn fuzzy_find(options: FuzzyFindOptions) -> Result<FuzzyFindResult> {
    let root = resolve_search_path(&options.path)?;
    let include_hidden = options.hidden.unwrap_or(false);
    let respect_gitignore = options.gitignore.unwrap_or(true);
    let max_results = options.max_results.unwrap_or(100) as usize;

    if max_results == 0 {
        return Ok(FuzzyFindResult {
            matches: Vec::new(),
            total_matches: 0,
        });
    }

    let query_lower = options.query.trim().to_lowercase();
    let normalized_query = normalize_fuzzy_text(&query_lower);
    let query_chars: Vec<char> = normalized_query.chars().collect();

    if !query_lower.is_empty() && normalized_query.is_empty() {
        return Ok(FuzzyFindResult {
            matches: Vec::new(),
            total_matches: 0,
        });
    }

    let entries = walk_directory(&root, include_hidden, respect_gitignore);

    let mut scored: Vec<FuzzyFindMatch> = Vec::with_capacity(entries.len().min(256));
    for entry in entries {
        if entry.entry_type == EntryType::Symlink {
            continue;
        }

        let is_directory = entry.entry_type == EntryType::Dir;
        let score = score_fuzzy_path(
            &entry.path,
            is_directory,
            &query_lower,
            &normalized_query,
            &query_chars,
        );
        if score == 0 {
            continue;
        }

        let mut path = entry.path;
        if is_directory {
            path.push('/');
        }
        scored.push(FuzzyFindMatch {
            path,
            is_directory,
            score,
        });
    }

    scored.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.path.cmp(&b.path)));
    let total_matches = clamp_u32(scored.len() as u64);
    let matches = scored.into_iter().take(max_results).collect();

    Ok(FuzzyFindResult {
        matches,
        total_matches,
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_fuzzy_text() {
        assert_eq!(normalize_fuzzy_text("foo/bar.ts"), "foobarts");
        assert_eq!(normalize_fuzzy_text("my_file-name.rs"), "myfilenamers");
        assert_eq!(normalize_fuzzy_text("MyFile"), "myfile");
        assert_eq!(normalize_fuzzy_text(""), "");
    }

    #[test]
    fn test_fuzzy_subsequence_score_exact() {
        let query: Vec<char> = "abc".chars().collect();
        let score = fuzzy_subsequence_score(&query, "abc");
        assert_eq!(score, 40);
    }

    #[test]
    fn test_fuzzy_subsequence_score_with_gaps() {
        let query: Vec<char> = "ac".chars().collect();
        let score = fuzzy_subsequence_score(&query, "abc");
        assert_eq!(score, 35);
    }

    #[test]
    fn test_fuzzy_subsequence_score_no_match() {
        let query: Vec<char> = "xyz".chars().collect();
        let score = fuzzy_subsequence_score(&query, "abc");
        assert_eq!(score, 0);
    }

    #[test]
    fn test_fuzzy_subsequence_score_empty_query() {
        let query: Vec<char> = Vec::new();
        let score = fuzzy_subsequence_score(&query, "abc");
        assert_eq!(score, 1);
    }

    #[test]
    fn test_score_fuzzy_path_exact_filename() {
        let score = score_fuzzy_path(
            "src/main.rs",
            false,
            "main.rs",
            "mainrs",
            &"mainrs".chars().collect::<Vec<_>>(),
        );
        assert_eq!(score, 120);
    }

    #[test]
    fn test_score_fuzzy_path_starts_with() {
        let score = score_fuzzy_path(
            "src/main.rs",
            false,
            "main",
            "main",
            &"main".chars().collect::<Vec<_>>(),
        );
        assert_eq!(score, 100);
    }

    #[test]
    fn test_score_fuzzy_path_contains() {
        let score = score_fuzzy_path(
            "src/my_main.rs",
            false,
            "main",
            "main",
            &"main".chars().collect::<Vec<_>>(),
        );
        assert_eq!(score, 80);
    }

    #[test]
    fn test_score_fuzzy_path_directory_bonus() {
        let file_score = score_fuzzy_path(
            "src/main.rs",
            false,
            "main.rs",
            "mainrs",
            &"mainrs".chars().collect::<Vec<_>>(),
        );
        let dir_score = score_fuzzy_path(
            "src/main.rs",
            true,
            "main.rs",
            "mainrs",
            &"mainrs".chars().collect::<Vec<_>>(),
        );
        assert_eq!(dir_score, file_score + 10);
    }

    #[test]
    fn test_score_fuzzy_path_empty_query() {
        let file_score = score_fuzzy_path("src/main.rs", false, "", "", &[]);
        let dir_score = score_fuzzy_path("src/", true, "", "", &[]);
        assert_eq!(file_score, 1);
        assert_eq!(dir_score, 11);
    }

    #[test]
    fn test_score_fuzzy_path_no_match() {
        let score = score_fuzzy_path(
            "src/main.rs",
            false,
            "xyz",
            "xyz",
            &"xyz".chars().collect::<Vec<_>>(),
        );
        assert_eq!(score, 0);
    }

    #[test]
    fn test_walk_directory_real_fs() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let entries = walk_directory(&root, false, true);
        let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        assert!(
            paths.iter().any(|p| p.contains("fd.rs")),
            "Should find fd.rs in {paths:?}"
        );
        assert!(
            paths.iter().any(|p| p.contains("lib.rs")),
            "Should find lib.rs in {paths:?}"
        );
    }
}
