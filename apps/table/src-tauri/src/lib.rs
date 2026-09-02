//! Table: the VTT shell. Hosts the board and the DM tools in a Tauri window;
//! domain logic belongs to crates/core, never here.
//! Design: docs/design.md §4.

mod compendium;

use tauri::Manager;
use tauri::path::BaseDirectory;

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
        .setup(|app| {
            install_compendium(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri runtime");
}

// A missing or unwritable bundle is reported, not fatal: the app runs
// without a compendium and the search will say so.
fn install_compendium(app: &tauri::App) {
    let bundled = app
        .path()
        .resolve(compendium::BUNDLED, BaseDirectory::Resource);
    let data_dir = app.path().app_data_dir();
    match (bundled, data_dir) {
        (Ok(bundled), Ok(data_dir)) => match compendium::install(&bundled, &data_dir) {
            Ok(path) => eprintln!("compendium: {}", path.display()),
            Err(error) => eprintln!("compendium: not installed: {error} ({})", bundled.display()),
        },
        (Err(error), _) | (_, Err(error)) => eprintln!("compendium: no path: {error}"),
    }
}
