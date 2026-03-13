//! Native git operations via libgit2.

use napi_derive::napi;

#[napi(object)]
pub struct GitStatusResult {
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
}

#[napi(object)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
}

#[napi]
pub fn git_status(repo_path: String) -> napi::Result<GitStatusResult> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();

        if s.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED
                | git2::Status::INDEX_TYPECHANGE,
        ) {
            staged.push(path.clone());
        }

        if s.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::WT_TYPECHANGE
                | git2::Status::WT_RENAMED,
        ) {
            unstaged.push(path.clone());
        }

        if s.contains(git2::Status::WT_NEW) {
            untracked.push(path);
        }
    }

    Ok(GitStatusResult { staged, unstaged, untracked })
}

#[napi]
pub fn git_diff(repo_path: String, staged: Option<bool>) -> napi::Result<String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let diff = if staged.unwrap_or(false) {
        let head = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let head_tree = head.as_ref().and_then(|c| c.tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, None)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?
    } else {
        repo.diff_index_to_workdir(None, None)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?
    };

    let mut output = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        if origin == '+' || origin == '-' || origin == ' ' {
            output.push(origin);
        }
        if let Ok(s) = std::str::from_utf8(line.content()) {
            output.push_str(s);
        }
        true
    })
    .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(output)
}

#[napi]
pub fn git_log(repo_path: String, max_count: Option<u32>) -> napi::Result<Vec<GitLogEntry>> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let mut revwalk = repo
        .revwalk()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    revwalk
        .push_head()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let limit = max_count.unwrap_or(50) as usize;
    let mut entries = Vec::new();

    for oid in revwalk.take(limit) {
        let oid = oid.map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let hash = oid.to_string();
        let short_hash = hash[..8].to_string();
        let message = commit.message().unwrap_or("").trim().to_string();
        let author = commit.author();
        let author_name = author.name().unwrap_or("").to_string();
        let author_email = author.email().unwrap_or("").to_string();
        let timestamp = author.when().seconds();

        entries.push(GitLogEntry {
            hash,
            short_hash,
            message,
            author_name,
            author_email,
            timestamp,
        });
    }

    Ok(entries)
}

#[napi]
pub fn git_current_branch(repo_path: String) -> napi::Result<String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let head = repo.head().map_err(|e| napi::Error::from_reason(e.to_string()))?;

    if head.is_branch() {
        Ok(head.shorthand().unwrap_or("HEAD").to_string())
    } else {
        Ok("HEAD".to_string())
    }
}

#[napi]
pub fn git_is_clean(repo_path: String) -> napi::Result<bool> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(statuses.is_empty())
}

#[napi]
pub fn git_stage_files(repo_path: String, paths: Vec<String>) -> napi::Result<()> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let mut index = repo
        .index()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    for path in &paths {
        index
            .add_path(std::path::Path::new(path))
            .map_err(|e| napi::Error::from_reason(format!("{}: {}", path, e)))?;
    }

    index
        .write()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(())
}

#[napi]
pub fn git_commit(
    repo_path: String,
    message: String,
    author_name: String,
    author_email: String,
) -> napi::Result<String> {
    let repo = git2::Repository::open(&repo_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let sig = git2::Signature::now(&author_name, &author_email)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let mut index = repo
        .index()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let tree_oid = index
        .write_tree()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let parent_commits: Vec<git2::Commit> = match repo.head() {
        Ok(head) => {
            let commit = head
                .peel_to_commit()
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            vec![commit]
        }
        Err(_) => vec![],
    };

    let parents: Vec<&git2::Commit> = parent_commits.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(oid.to_string())
}
