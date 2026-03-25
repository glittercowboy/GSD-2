use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

/// B72/B31: Verify the calling window is the main window.
/// Custom #[tauri::command] functions are not restricted by Tauri capability JSON,
/// so we enforce access control programmatically via window label check.
pub fn require_main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        Err(format!(
            "Permission denied: command restricted to main window (caller: {})",
            window.label()
        ))
    } else {
        Ok(())
    }
}

/// Atomic counter for generating unique window labels.
/// Avoids race condition when two windows are opened within the same millisecond.
pub struct WindowCounter(AtomicU64);

impl WindowCounter {
    pub fn new() -> Self {
        Self(AtomicU64::new(1))
    }
    pub fn next(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst)
    }
}

/// B60/B61 — OAuth nonce registry: maps state nonce → originating window label.
/// Used by on_open_url in lib.rs to validate and route oauth-callback events.
pub struct OAuthNonces(pub Arc<Mutex<HashMap<String, String>>>);

impl OAuthNonces {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

/// Register a state nonce for the OAuth flow, bound to the given window label.
/// Called from OAuthConnectFlow.tsx before opening the external browser.
/// B60: prevents oauth-callback from being emitted for unknown state nonces.
/// B61: binds the callback to the originating window, not all windows.
#[tauri::command]
pub async fn register_oauth_nonce(
    nonces: tauri::State<'_, OAuthNonces>,
    nonce: String,
    window_label: String,
) -> Result<(), String> {
    let mut map = nonces
        .0
        .lock()
        .map_err(|_| "nonce lock poisoned".to_string())?;
    map.insert(nonce, window_label);
    Ok(())
}

const KEYCHAIN_SERVICE: &str = "gsd-mission-control";

const ALLOWED_CREDENTIAL_KEYS: &[&str] = &[
    "anthropic_api_key",
    "github_token",
    "openrouter_api_key",
    "claude_access_token",
    "claude_refresh_token",
];

/// Open a native folder picker dialog. Returns the selected path or None if cancelled.
/// B47/B80: Uses tokio oneshot channel with the async callback variant to avoid
/// blocking the Tokio executor with a blocking OS dialog call.
#[tauri::command]
pub async fn open_folder_dialog(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    app.dialog()
        .file()
        .pick_folder(move |folder| {
            let result = folder.map(|p| p.to_string());
            let _ = tx.send(result);
        });
    rx.await.unwrap_or(None)
}

/// Read a credential from the OS keychain.
/// Returns None if the key does not exist or access is denied.
/// B72/B31: Only callable from the "main" window.
#[tauri::command]
pub async fn get_credential(window: tauri::WebviewWindow, key: String) -> Option<String> {
    if require_main_window(&window).is_err() {
        eprintln!("[commands] get_credential: rejected call from window '{}'", window.label());
        return None;
    }
    if !ALLOWED_CREDENTIAL_KEYS.contains(&key.as_str()) {
        eprintln!("[commands] get_credential: rejected key: {key}");
        return None;
    }
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).ok()?;
    entry.get_password().ok()
}

/// Write a credential to the OS keychain.
/// Returns true on success, false on failure.
/// B72/B31: Only callable from the "main" window.
#[tauri::command]
pub async fn set_credential(window: tauri::WebviewWindow, key: String, value: String) -> bool {
    if require_main_window(&window).is_err() {
        eprintln!("[commands] set_credential: rejected call from window '{}'", window.label());
        return false;
    }
    if !ALLOWED_CREDENTIAL_KEYS.contains(&key.as_str()) {
        eprintln!("[commands] set_credential: rejected key: {key}");
        return false;
    }
    let entry = match keyring::Entry::new(KEYCHAIN_SERVICE, &key) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[commands] set_credential error creating entry: {e}");
            return false;
        }
    };
    match entry.set_password(&value) {
        Ok(_) => true,
        Err(e) => {
            eprintln!("[commands] set_credential error: {e}");
            false
        }
    }
}

/// Delete a credential from the OS keychain.
/// Returns true on success or if key did not exist, false on error.
/// B72/B31: Only callable from the "main" window.
#[tauri::command]
pub async fn delete_credential(window: tauri::WebviewWindow, key: String) -> bool {
    if require_main_window(&window).is_err() {
        eprintln!("[commands] delete_credential: rejected call from window '{}'", window.label());
        return false;
    }
    if !ALLOWED_CREDENTIAL_KEYS.contains(&key.as_str()) {
        eprintln!("[commands] delete_credential: rejected key: {key}");
        return false;
    }
    let entry = match keyring::Entry::new(KEYCHAIN_SERVICE, &key) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[commands] delete_credential error: {e}");
            return false;
        }
    };
    match entry.delete_credential() {
        Ok(_) => true,
        Err(keyring::Error::NoEntry) => true, // not found = already deleted
        Err(e) => {
            eprintln!("[commands] delete_credential error: {e}");
            false
        }
    }
}

/// Reveal a file or directory in the native file manager (Finder/Explorer).
/// Falls back to opening the path as a file:// URL if reveal_item_in_dir is unavailable.
/// Returns true on success.
/// GAP-5: Only callable from the "main" window.
#[tauri::command]
pub async fn reveal_path(window: tauri::WebviewWindow, app: AppHandle, path: String) -> bool {
    if require_main_window(&window).is_err() {
        eprintln!("[commands] reveal_path: rejected call from window '{}'", window.label());
        return false;
    }
    let p = std::path::Path::new(&path);
    if !p.is_absolute() {
        eprintln!("[commands] reveal_path: rejected non-absolute path: {path}");
        return false;
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map(|_| true)
        .unwrap_or_else(|_| {
            // Fallback: open directory itself in file manager
            // B70: Use Url::from_file_path() for safe URL construction (no string concat)
            let file_url = match Url::from_file_path(std::path::Path::new(&path)) {
                Ok(u) => u.to_string(),
                Err(_) => {
                    eprintln!("[commands] reveal_path: failed to build file URL for {path}");
                    return false;
                }
            };
            app.opener()
                .open_url(file_url, None::<String>)
                .map(|_| true)
                .unwrap_or(false)
        })
}

/// Open a URL in the system default browser.
/// B69: URL is validated via Url::parse() before use.
/// B68: Only https:// scheme is permitted (defense in depth — frontend also checks).
/// The re-serialized URL from the parser is used, not the raw input string,
/// to prevent parser differential attacks.
/// Returns true on success.
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> bool {
    // B69: Parse via URL library — rejects malformed and dangerous URLs
    let parsed = match Url::parse(&url) {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[commands] open_external: invalid URL rejected: {e}");
            return false;
        }
    };

    // B68: Only allow https:// scheme
    if parsed.scheme() != "https" {
        eprintln!("[commands] open_external: rejected non-https scheme: {}", parsed.scheme());
        return false;
    }

    // Use the re-serialized URL from the parser (not the raw input string)
    let safe_url = parsed.to_string();

    app.opener()
        .open_url(safe_url, None::<String>)
        .map(|_| true)
        .unwrap_or_else(|e| {
            eprintln!("[commands] open_external error: {e}");
            false
        })
}

/// Return the current platform as a lowercase string.
#[tauri::command]
pub fn get_platform() -> String {
    #[cfg(target_os = "macos")]
    return "macos".to_string();
    #[cfg(target_os = "windows")]
    return "windows".to_string();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return "linux".to_string();
}

/// Kill and respawn the managed Bun server process.
/// Returns true on success.
/// B72/B31: Only callable from the "main" window.
#[tauri::command]
pub async fn restart_bun(window: tauri::WebviewWindow, app: AppHandle) -> bool {
    if require_main_window(&window).is_err() {
        eprintln!("[commands] restart_bun: rejected call from window '{}'", window.label());
        return false;
    }
    crate::bun_manager::restart_bun(app).await;
    true
}

/// Re-run dependency checks (called from dep_screen.html Retry button).
#[tauri::command]
pub async fn retry_dep_check(app: AppHandle) -> bool {
    crate::dep_check::run_startup_checks(app).await;
    true
}

/// Open a new Mission Control window (independent project state).
/// GAP-6: Only callable from the "main" window.
#[tauri::command]
pub async fn open_new_window(
    window: tauri::WebviewWindow,
    app: AppHandle,
    counter: tauri::State<'_, WindowCounter>,
) -> Result<(), String> {
    require_main_window(&window)?;
    let label = format!("window-{}", counter.next());
    tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("GSD Mission Control")
    .inner_size(1280.0, 800.0)
    .min_inner_size(1024.0, 640.0)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

