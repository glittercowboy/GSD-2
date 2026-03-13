mod bun_manager;
mod commands;
mod dep_check;

use tauri_plugin_window_state::Builder as WindowStateBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(WindowStateBuilder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("gsd", |_app, request| {
            // Stub: full OAuth callback handling implemented in a later phase.
            // Tauri requires gsd:// to be registered here (not in tauri.conf.json)
            // so the OS registers the protocol on install.
            tauri::http::Response::builder()
                .status(200)
                .body(Vec::new())
                .unwrap()
        })
        .setup(|app| {
            // Dependency check runs before any window shows
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                dep_check::run_startup_checks(app_handle).await;
            });

            // Spawn Bun server managed process
            let bun_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                bun_manager::spawn_bun_server(bun_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_folder_dialog,
            commands::get_credential,
            commands::set_credential,
            commands::delete_credential,
            commands::open_external,
            commands::get_platform,
            commands::restart_bun,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
