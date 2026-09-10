//! The command surface: what the frontend may ask of the core. Defined once
//! here, exported to TypeScript by tauri-specta, and reached through one
//! typed call whose transport is Tauri invoke in the window and, later, a
//! WebSocket in serve mode (design §6).
//!
//! `viewer` is a parameter because the window is the DM's own process, so
//! the DM may preview what a player sees. A remote transport sets it from
//! the session, never from the caller.

use std::time::Instant;

use serde::Serialize;
use specta::Type;
use tablewright_core::{
    DEFAULT_LIMIT, Edge, Entry, EntryId, Filter, HeightDisplay, Hit, Manifest, MapImage, PlayState,
    Scene, SceneError, SceneSummary, StoreError, Stroke, SystemManifest, Understood, Viewer,
    Visibility,
};
use tauri::State;

use crate::state::{AppState, Compendium};

/// A ranked search result with the time the core spent on it.
#[derive(Debug, Clone, Serialize, Type)]
pub struct SearchResponse {
    pub hits: Vec<Hit>,
    /// Time spent in the core, in microseconds.
    pub elapsed_us: u32,
    /// How many entries the catalogue held when it answered.
    pub catalogue_size: u32,
    /// What the parser made of the typed text: the stretches that became
    /// filters, and those set aside as meaning nothing here.
    pub understood: Vec<Understood>,
}

/// Why a command could not answer.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CommandError {
    /// No compendium is installed; nothing to search.
    NoCompendium,
    /// No entry with that id, or none the viewer may see.
    NotFound { id: String },
    /// The store failed underneath.
    Store { message: String },
    /// The scene refused the change, or could not be saved.
    Scene { message: String },
}

impl From<StoreError> for CommandError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::NotFound(id) => Self::NotFound { id: id.to_string() },
            other => Self::Store {
                message: other.to_string(),
            },
        }
    }
}

impl From<SceneError> for CommandError {
    fn from(error: SceneError) -> Self {
        Self::Scene {
            message: error.to_string(),
        }
    }
}

fn compendium(state: &AppState) -> Result<&Compendium, CommandError> {
    state.compendium.as_ref().ok_or(CommandError::NoCompendium)
}

/// Rank the compendium against `query` for a viewer of `viewer` tier who
/// reads the rules of `version` (one hit per thing; the version's own entry
/// when it has one, else another version's, which carries its version).
#[tauri::command]
#[specta::specta]
pub fn search(
    state: State<'_, AppState>,
    query: String,
    viewer: Visibility,
    limit: Option<u32>,
    filters: Option<Vec<Filter>>,
    version: Option<String>,
) -> Result<SearchResponse, CommandError> {
    let compendium = compendium(&state)?;
    let started = Instant::now();
    let limit = limit.map_or(DEFAULT_LIMIT, |limit| limit as usize);
    let viewer = Viewer {
        tier: viewer,
        version,
    };
    let answer =
        compendium
            .catalogue
            .answer_with(&query, viewer, limit, &filters.unwrap_or_default());
    Ok(SearchResponse {
        hits: answer.hits,
        elapsed_us: u32::try_from(started.elapsed().as_micros()).unwrap_or(u32::MAX),
        catalogue_size: u32::try_from(compendium.catalogue.len()).unwrap_or(u32::MAX),
        understood: answer.understood,
    })
}

/// One entry as `viewer` may see it. With a `version`, the same thing in
/// that rule version when it exists there, else the entry asked for: a
/// page turns to the reader's version when they switch.
#[tauri::command]
#[specta::specta]
pub fn get_entry(
    state: State<'_, AppState>,
    id: EntryId,
    viewer: Visibility,
    version: Option<String>,
) -> Result<Entry, CommandError> {
    let compendium = compendium(&state)?;
    let store = compendium.store.lock().map_err(|_| CommandError::Store {
        message: "the store lock is poisoned".into(),
    })?;
    let id = match version {
        Some(version) => store.version_of(&id, &version)?.unwrap_or(id),
        None => id,
    };
    Ok(store.get(&id, viewer)?)
}

/// The manifests of every module in the compendium, for the credits view.
#[tauri::command]
#[specta::specta]
pub fn modules(state: State<'_, AppState>) -> Result<Vec<Manifest>, CommandError> {
    let compendium = compendium(&state)?;
    let store = compendium.store.lock().map_err(|_| CommandError::Store {
        message: "the store lock is poisoned".into(),
    })?;
    Ok(store.modules()?)
}

/// The text values each facet holds across the compendium, for the tray's
/// chips: schools, creature types, categories.
#[tauri::command]
#[specta::specta]
pub fn facet_values(
    state: State<'_, AppState>,
) -> Result<std::collections::BTreeMap<String, Vec<String>>, CommandError> {
    Ok(compendium(&state)?.catalogue.facet_values())
}

/// The system the compendium was seeded for: its categories, kinds,
/// facets and the tray's controls. `None` when the seeder was given none.
#[tauri::command]
#[specta::specta]
pub fn system(state: State<'_, AppState>) -> Result<Option<SystemManifest>, CommandError> {
    Ok(compendium(&state)?.system.clone())
}

// ── The scene ──

// Every change to the open scene: lock the library, change the scene,
// save it, and answer with the scene as it now stands.
fn edit_scene(
    state: &AppState,
    change: impl FnOnce(&mut Scene) -> Result<(), SceneError>,
) -> Result<Scene, CommandError> {
    let mut scenes = state.scenes.lock().map_err(|_| poisoned())?;
    change(scenes.current_mut())?;
    scenes.save()?;
    Ok(scenes.current().clone())
}

/// The scene the board shows.
#[tauri::command]
#[specta::specta]
pub fn get_scene(state: State<'_, AppState>) -> Result<Scene, CommandError> {
    let scenes = state.scenes.lock().map_err(|_| poisoned())?;
    Ok(scenes.current().clone())
}

/// Every scene in the library, by name.
#[tauri::command]
#[specta::specta]
pub fn list_scenes(state: State<'_, AppState>) -> Result<Vec<SceneSummary>, CommandError> {
    let scenes = state.scenes.lock().map_err(|_| poisoned())?;
    Ok(scenes.list()?)
}

/// Switch the table to the scene `id`.
#[tauri::command]
#[specta::specta]
pub fn open_scene(state: State<'_, AppState>, id: String) -> Result<Scene, CommandError> {
    let mut scenes = state.scenes.lock().map_err(|_| poisoned())?;
    Ok(scenes.open_scene(&id)?.clone())
}

/// Create a scene with `strokes` drawn, and switch to it: blank, or a
/// reference drawing, or later an import.
#[tauri::command]
#[specta::specta]
pub fn create_scene(
    state: State<'_, AppState>,
    name: String,
    strokes: Vec<Stroke>,
) -> Result<Scene, CommandError> {
    let mut scenes = state.scenes.lock().map_err(|_| poisoned())?;
    Ok(scenes.create(&name, strokes)?.clone())
}

/// Commit a token's move: the release of a drag, or a keyboard step.
#[tauri::command]
#[specta::specta]
pub fn move_token(
    state: State<'_, AppState>,
    id: String,
    col: i32,
    row: i32,
    facing: u16,
) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| {
        scene.move_token(&id, col, row, facing).map(|_| ())
    })
}

/// Stand a compendium entry on a cell as a new token.
#[tauri::command]
#[specta::specta]
pub fn place_entry(
    state: State<'_, AppState>,
    id: EntryId,
    col: i32,
    row: i32,
) -> Result<Scene, CommandError> {
    let compendium = compendium(&state)?;
    let summary = {
        let store = compendium.store.lock().map_err(|_| CommandError::Store {
            message: "the store lock is poisoned".into(),
        })?;
        store.get(&id, Visibility::Dm)?.summary()
    };
    edit_scene(&state, |scene| {
        scene.place(&summary, col, row);
        Ok(())
    })
}

/// Take a token off the board.
#[tauri::command]
#[specta::specta]
pub fn remove_token(state: State<'_, AppState>, id: String) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| scene.remove_token(&id).map(|_| ()))
}

/// Add a stroke to the end of the scene's record: the release of a Build
/// mode gesture.
#[tauri::command]
#[specta::specta]
pub fn add_stroke(state: State<'_, AppState>, stroke: Stroke) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| {
        scene.add_stroke(stroke);
        Ok(())
    })
}

/// Take one stroke out of the record by its position; the rest keep
/// their order.
#[tauri::command]
#[specta::specta]
pub fn remove_stroke(state: State<'_, AppState>, index: u32) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| {
        scene.remove_stroke(index as usize).map(|_| ())
    })
}

/// Take back the last stroke drawn. With nothing to take back the scene
/// comes back unchanged.
#[tauri::command]
#[specta::specta]
pub fn undo_stroke(state: State<'_, AppState>) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| {
        scene.undo_stroke();
        Ok(())
    })
}

/// Choose how the scene shows height over its picture.
#[tauri::command]
#[specta::specta]
pub fn set_display(
    state: State<'_, AppState>,
    display: HeightDisplay,
) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| {
        scene.set_display(display);
        Ok(())
    })
}

/// Give the scene its picture, or take it away.
#[tauri::command]
#[specta::specta]
pub fn set_map(state: State<'_, AppState>, map: Option<MapImage>) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| {
        scene.set_map(map);
        Ok(())
    })
}

/// Record what a threshold became in play: opened, shut, smashed, or a
/// secret door revealed.
#[tauri::command]
#[specta::specta]
pub fn set_threshold_state(
    state: State<'_, AppState>,
    edge: Edge,
    play: PlayState,
) -> Result<Scene, CommandError> {
    edit_scene(&state, |scene| {
        scene.set_threshold_state(edge, play);
        Ok(())
    })
}

fn poisoned() -> CommandError {
    CommandError::Scene {
        message: "the scene lock is poisoned".into(),
    }
}
