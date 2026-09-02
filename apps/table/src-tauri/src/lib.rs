//! Table: the VTT shell. Hosts the board and the DM tools in a Tauri window;
//! domain logic belongs to crates/core, never here.
//! Design: docs/design.md §4.

/// Builds and runs the Tauri application until the last window closes.
///
/// # Panics
///
/// Panics if the Tauri runtime cannot start. A desktop shell has nothing
/// to fall back to, so the process exits with the reason.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri runtime");
}
