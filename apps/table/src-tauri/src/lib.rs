//! Table: the VTT shell. Hosts the board and the DM tools in a Tauri window;
//! domain logic belongs to crates/core, never here.
//! Design: docs/design.md §4.

mod commands;
mod compendium;
mod state;

use std::path::{Path, PathBuf};

use specta_typescript::Typescript;
use tauri::Manager;
use tauri::path::BaseDirectory;
use tauri_specta::{Builder, collect_commands};

use state::{AppState, Compendium};

/// Where the generated TypeScript bindings live, relative to this crate.
pub const BINDINGS_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/schema/src/bindings.ts"
);

const BINDINGS_HEADER: &str = "// Generated from apps/table/src-tauri by tauri-specta. Do not edit;\n// run `bun run schema` after changing the command surface.\n";

/// Builds and runs the Tauri application until the last window closes.
///
/// # Panics
///
/// Panics if the Tauri runtime cannot start. A desktop shell has nothing
/// to fall back to, so the process exits with the reason.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();
    #[cfg(debug_assertions)]
    if let Err(error) = export_bindings(Path::new(BINDINGS_PATH)) {
        eprintln!("bindings: {error}");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            app.manage(open_compendium(app));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri runtime");
}

/// Write the TypeScript bindings for the command surface to `path`.
///
/// # Errors
///
/// Fails if a type cannot be expressed in TypeScript or the file cannot be
/// written.
pub fn export_bindings(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    specta_builder().export(Typescript::default().header(BINDINGS_HEADER), path)?;
    Ok(())
}

// The one list of commands; both the invoke handler and the export read it.
fn specta_builder() -> Builder<tauri::Wry> {
    // No type here serialises differently from how it deserialises, so one
    // TypeScript alias per type is the honest export.
    Builder::<tauri::Wry>::new()
        .disable_serde_phases()
        .commands(collect_commands![
            commands::search,
            commands::get_entry,
            commands::modules,
        ])
}

// A missing or unreadable compendium is reported, not fatal: the app runs
// without one and the commands say so.
fn open_compendium(app: &tauri::App) -> AppState {
    let compendium = install_compendium(app).and_then(|path| match Compendium::open(&path) {
        Ok(compendium) => {
            eprintln!(
                "compendium: {} entries from {}",
                compendium.catalogue.len(),
                path.display()
            );
            Some(compendium)
        }
        Err(error) => {
            eprintln!("compendium: could not open {}: {error}", path.display());
            None
        }
    });
    AppState { compendium }
}

fn install_compendium(app: &tauri::App) -> Option<PathBuf> {
    let bundled = app
        .path()
        .resolve(compendium::BUNDLED, BaseDirectory::Resource);
    let data_dir = app.path().app_data_dir();
    match (bundled, data_dir) {
        (Ok(bundled), Ok(data_dir)) => match compendium::install(&bundled, &data_dir) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("compendium: not installed: {error} ({})", bundled.display());
                None
            }
        },
        (Err(error), _) | (_, Err(error)) => {
            eprintln!("compendium: no path: {error}");
            None
        }
    }
}
