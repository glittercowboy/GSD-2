use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::dep_check::resolve_bun_path;

/// Holds the Bun server child process handle.
pub struct BunState {
    pub child: Mutex<Option<Child>>,
}

impl BunState {
    pub fn new() -> Self {
        BunState {
            child: Mutex::new(None),
        }
    }
}

/// Resolve the packages/mission-control directory regardless of where tauri was invoked from.
/// - From packages/mission-control/ (typical `tauri dev`): return cwd as-is
/// - From packages/mission-control/src-tauri/ : go up one level
/// - From repo root (e.g. workspace scripts): append packages/mission-control
fn resolve_mc_dir() -> std::path::PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.ends_with("src-tauri") {
            return cwd.parent().unwrap_or(&cwd).to_path_buf();
        }
        if cwd.file_name().map(|n| n == "mission-control").unwrap_or(false) {
            return cwd;
        }
        return cwd.join("packages").join("mission-control");
    }
    std::path::PathBuf::from("packages/mission-control")
}

/// Spawn the Bun server. Emits `bun-started` to all windows when ready.
/// Watches the process and emits `bun-crashed` if it exits unexpectedly.
///
/// Security hardening (T-EXEC-01):
/// - Uses absolute, canonicalized Bun binary path (never bare "bun")
/// - Clears all inherited environment variables (env_clear)
/// - Passes only an explicit allowlist of safe env vars to the child process
pub async fn spawn_bun_server(app: AppHandle) {
    let mc_dir = resolve_mc_dir();

    // Resolve absolute path — NEVER use bare "bun" or "bun.exe"
    let bun_path = match resolve_bun_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[bun_manager] Cannot resolve Bun binary path: {e}");
            let _ = app.emit("bun-crashed", format!("Cannot find Bun: {e}"));
            return;
        }
    };

    // Build explicit environment allowlist — do NOT clone parent env
    let mut child_env: HashMap<String, String> = HashMap::new();

    // Only include safe, necessary env vars
    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        child_env.insert("HOME".to_string(), home.clone());
        child_env.insert("USERPROFILE".to_string(), home);
    }
    if let Ok(lang) = std::env::var("LANG") {
        child_env.insert("LANG".to_string(), lang);
    }
    if let Ok(term) = std::env::var("TERM") {
        child_env.insert("TERM".to_string(), term);
    }

    // Fixed PATH: only system binary directories + bun's own directory
    #[cfg(target_os = "windows")]
    {
        let system_root =
            std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let bun_dir = bun_path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        child_env.insert(
            "PATH".to_string(),
            format!("{bun_dir};{system_root}\\System32;{system_root}"),
        );
        child_env.insert("SystemRoot".to_string(), system_root);
        if let Ok(tmp) = std::env::var("TEMP").or_else(|_| std::env::var("TMP")) {
            child_env.insert("TEMP".to_string(), tmp.clone());
            child_env.insert("TMP".to_string(), tmp);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let bun_dir = bun_path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        child_env.insert(
            "PATH".to_string(),
            format!("{bun_dir}:/usr/local/bin:/usr/bin:/bin"),
        );
        if let Ok(tmp) = std::env::var("TMPDIR") {
            child_env.insert("TMPDIR".to_string(), tmp);
        }
    }

    // Only the vars above are passed. Injection vectors (runtime hooks, proxy
    // overrides, and loader overrides) are intentionally excluded from this list.

    let result = Command::new(&bun_path)
        .args(["run", "--cwd"])
        .arg(&mc_dir)
        .arg("start")
        .env_clear() // Clear ALL inherited env
        .envs(&child_env) // Set only allowlisted vars
        .spawn();

    match result {
        Ok(child) => {
            // Store handle in managed state
            if let Some(state) = app.try_state::<BunState>() {
                let mut guard = state.child.lock().unwrap_or_else(|e| {
                    eprintln!("[bun_manager] WARNING: mutex poisoned, recovering: {e}");
                    e.into_inner()
                });
                *guard = Some(child);
            }
            // Notify frontend
            let _ = app.emit("bun-started", ());

            // Watch for unexpected exit in background
            let app2 = app.clone();
            tauri::async_runtime::spawn(async move {
                watch_bun_process(app2).await;
            });
        }
        Err(e) => {
            eprintln!("[bun_manager] Failed to spawn Bun: {e}");
            let _ = app.emit("bun-crashed", format!("Failed to start: {e}"));
        }
    }
}

/// Poll the child process every 2 seconds. If it exits, emit `bun-crashed`.
async fn watch_bun_process(app: AppHandle) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        if let Some(state) = app.try_state::<BunState>() {
            let mut guard = state.child.lock().unwrap_or_else(|e| {
                eprintln!("[bun_manager] WARNING: mutex poisoned, recovering: {e}");
                e.into_inner()
            });
            if let Some(child) = guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Process exited — emit crash event
                        *guard = None;
                        drop(guard);
                        let msg = format!("Bun server exited with status: {status}");
                        eprintln!("[bun_manager] {msg}");
                        let _ = app.emit("bun-crashed", msg);
                        return;
                    }
                    Ok(None) => {} // still running
                    Err(e) => {
                        eprintln!("[bun_manager] Error checking process: {e}");
                    }
                }
            }
        }
    }
}

/// Kill the Bun server cleanly. Called on window close.
pub async fn kill_bun_server(app: AppHandle) {
    if let Some(state) = app.try_state::<BunState>() {
        // Take the child process out of the mutex guard and immediately drop the guard.
        // This ensures the MutexGuard (non-Send) is NOT held across the async .await boundary.
        // B45/B78: unwrap_or_else recovers from poisoned mutex instead of panicking.
        let child_opt = {
            let mut guard = state.child.lock().unwrap_or_else(|e| {
                eprintln!("[bun_manager] WARNING: mutex poisoned, recovering: {e}");
                e.into_inner()
            });
            guard.take()
            // guard is dropped here at end of block
        };
        if let Some(mut child) = child_opt {
            // Send SIGTERM (or TerminateProcess on Windows)
            let _ = child.kill();
            // B46/B79: move blocking wait to thread pool — do not block Tokio executor
            let _ = tokio::task::spawn_blocking(move || {
                let _ = child.wait();
            })
            .await;
            eprintln!("[bun_manager] Bun server killed cleanly.");
        }
    }
}

/// Kill and respawn the Bun server. Called via IPC restart_bun command.
pub async fn restart_bun(app: AppHandle) {
    kill_bun_server(app.clone()).await;
    // Brief delay to let the port free
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    spawn_bun_server(app).await;
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_poisoned_mutex_does_not_panic() {
        // Create a mutex and poison it by panicking inside a lock scope
        let mutex = Arc::new(Mutex::new(42u32));
        let mutex_clone = Arc::clone(&mutex);
        let _ = std::thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("intentional panic to poison the mutex");
        })
        .join();

        // The mutex should now be poisoned
        assert!(mutex.is_poisoned());

        // Calling our recovery pattern should NOT panic:
        let value = mutex.lock().unwrap_or_else(|e| e.into_inner());
        assert_eq!(*value, 42);
        // Success: no panic
    }
}
