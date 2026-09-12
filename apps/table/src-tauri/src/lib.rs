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

use state::AppState;

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
            app.manage(boot(app));
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
        // The cast of the stand-in crosses to the page as a file the seed
        // writes, not as a command, so its type is named here by hand.
        .typ::<tablewright_core::Cast>()
        .commands(collect_commands![
            commands::search,
            commands::get_entry,
            commands::modules,
            commands::system,
            commands::permissions,
            commands::facet_values,
            commands::list_campaigns,
            commands::current_campaign,
            commands::open_campaign,
            commands::create_campaign,
            commands::close_campaign,
            commands::get_scene,
            commands::list_scenes,
            commands::open_scene,
            commands::create_scene,
            commands::move_token,
            commands::place_entry,
            commands::remove_token,
            commands::add_stroke,
            commands::remove_stroke,
            commands::undo_stroke,
            commands::set_display,
            commands::set_map,
            commands::set_threshold_state,
        ])
}

// Where things live: campaigns and the library under the Tablewright home
// in the user's documents, the app's own memory in its data directory, the
// bundled compendium among the resources, installed into the library at
// start. The campaign open when the app last closed is opened again;
// otherwise the intro screen is where the table starts. A missing path is
// reported and stood in for, never fatal.
fn boot(app: &tauri::App) -> AppState {
    let home = match app.path().document_dir() {
        Ok(documents) => documents.join("Tablewright"),
        Err(error) => {
            eprintln!("home: no documents directory ({error}); using ./Tablewright");
            PathBuf::from("Tablewright")
        }
    };
    let data_dir = app.path().app_data_dir().unwrap_or_else(|error| {
        eprintln!("data: no app data directory ({error}); using ./data");
        PathBuf::from("data")
    });
    let bundled = match app
        .path()
        .resolve(compendium::BUNDLED, BaseDirectory::Resource)
    {
        Ok(path) => Some(path),
        Err(error) => {
            eprintln!("compendium: no bundle path: {error}");
            None
        }
    };
    let state = AppState::new(home, data_dir, bundled);
    eprintln!("home: {}", state.home.display());
    if let Some(library) = state.library() {
        eprintln!("library: {}", library.display());
    }
    if let Some(dir) = state.last_open() {
        match state.open_campaign(&dir) {
            Ok(summary) => eprintln!("campaign: {} from {}", summary.name, dir.display()),
            Err(error) => eprintln!("campaign: could not reopen {}: {error}", dir.display()),
        }
    }
    state
}
