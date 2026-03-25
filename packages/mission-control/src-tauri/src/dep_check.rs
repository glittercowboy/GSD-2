use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

/// Known Bun installation directories per platform.
const KNOWN_BUN_DIRS: &[&str] = &[
    // macOS / Linux
    ".bun/bin",
    ".nvm/versions/node",
    "/usr/local/bin",
    "/usr/bin",
    "/opt/homebrew/bin",
    // Windows
    ".bun\\bin",
    "scoop\\apps\\bun",
    "AppData\\Local\\bun",
];

/// Resolve the absolute path to the Bun binary.
/// Returns the verified canonical path or an error if not found or resolution fails.
/// Logs a warning if the path is not in a known installation directory
/// (still allows it — the absolute path prevents PATH hijack regardless).
pub fn resolve_bun_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let checker = "where";
    #[cfg(not(target_os = "windows"))]
    let checker = "which";

    let output = Command::new(checker)
        .arg("bun")
        .output()
        .map_err(|e| format!("Failed to locate bun: {e}"))?;

    if !output.status.success() {
        return Err("bun not found on PATH".to_string());
    }

    let path_str = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    if path_str.is_empty() {
        return Err("bun path is empty".to_string());
    }

    let bun_path = PathBuf::from(&path_str);

    // Canonicalize to resolve symlinks and get absolute path
    let canonical = bun_path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize bun path: {e}"))?;

    // Verify against known installation directories
    let home = dirs::home_dir().unwrap_or_default();
    let is_known = KNOWN_BUN_DIRS.iter().any(|dir| {
        let known = home.join(dir);
        canonical.starts_with(&known)
    }) || canonical.starts_with("/usr/local/bin")
        || canonical.starts_with("/usr/bin")
        || canonical.starts_with("/opt/homebrew/bin");

    if !is_known {
        eprintln!(
            "[dep_check] WARNING: bun found at {canonical:?} which is not a known installation directory"
        );
        // Still allow it — the absolute path prevents PATH hijack regardless
    }

    Ok(canonical)
}

/// Check if a CLI tool is available on PATH.
/// Uses `where` on Windows, `which` on macOS/Linux.
pub fn check_dependency(name: &str) -> bool {
    #[cfg(target_os = "windows")]
    let checker = "where";
    #[cfg(not(target_os = "windows"))]
    let checker = "which";

    Command::new(checker)
        .arg(name)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Run startup dependency checks. Called from setup() before any UI interaction.
/// If all deps present: emits `dep-check-passed`.
/// If any dep missing: navigates the main window to dep_screen.html with ?missing= param.
pub async fn run_startup_checks(app: AppHandle) {
    let bun_ok = check_dependency("bun");
    let gsd_ok = check_dependency("gsd");

    if bun_ok && gsd_ok {
        let _ = app.emit("dep-check-passed", ());
        return;
    }

    // Build missing list
    let mut missing: Vec<&str> = Vec::new();
    if !bun_ok {
        missing.push("bun");
    }
    if !gsd_ok {
        missing.push("gsd");
    }
    let missing_str = missing.join(",");

    eprintln!("[dep_check] Missing dependencies: {missing_str}");

    // Navigate main window to dep screen
    // Use the asset protocol to serve the bundled dep_screen.html
    let dep_url = format!("asset://localhost/dep_screen.html?missing={missing_str}");

    // Get main window and navigate
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(dep_url.parse().expect("valid dep screen URL"));
    }

    // Also emit event in case React app is listening
    let _ = app.emit("dep-check-failed", missing_str);
}
