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
    DEFAULT_LIMIT, Entry, EntryId, Hit, Manifest, Scene, SceneError, StoreError, Visibility,
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

/// Rank the compendium against `query` for a viewer of `viewer` tier.
#[tauri::command]
#[specta::specta]
pub fn search(
    state: State<'_, AppState>,
    query: String,
    viewer: Visibility,
    limit: Option<u32>,
) -> Result<SearchResponse, CommandError> {
    let compendium = compendium(&state)?;
    let started = Instant::now();
    let limit = limit.map_or(DEFAULT_LIMIT, |limit| limit as usize);
    let hits = compendium.catalogue.search(&query, viewer, limit);
    Ok(SearchResponse {
        hits,
        elapsed_us: u32::try_from(started.elapsed().as_micros()).unwrap_or(u32::MAX),
        catalogue_size: u32::try_from(compendium.catalogue.len()).unwrap_or(u32::MAX),
    })
}

/// One entry as `viewer` may see it.
#[tauri::command]
#[specta::specta]
pub fn get_entry(
    state: State<'_, AppState>,
    id: EntryId,
    viewer: Visibility,
) -> Result<Entry, CommandError> {
    let compendium = compendium(&state)?;
    let store = compendium.store.lock().map_err(|_| CommandError::Store {
        message: "the store lock is poisoned".into(),
    })?;
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

/// The scene the board shows.
#[tauri::command]
#[specta::specta]
pub fn get_scene(state: State<'_, AppState>) -> Result<Scene, CommandError> {
    let scene = state.scene.lock().map_err(|_| poisoned())?;
    Ok(scene.clone())
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
    let mut scene = state.scene.lock().map_err(|_| poisoned())?;
    scene.move_token(&id, col, row, facing)?;
    scene.save(&state.scene_path)?;
    Ok(scene.clone())
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
    let mut scene = state.scene.lock().map_err(|_| poisoned())?;
    scene.place(&summary, col, row);
    scene.save(&state.scene_path)?;
    Ok(scene.clone())
}

/// Take a token off the board.
#[tauri::command]
#[specta::specta]
pub fn remove_token(state: State<'_, AppState>, id: String) -> Result<Scene, CommandError> {
    let mut scene = state.scene.lock().map_err(|_| poisoned())?;
    scene.remove_token(&id)?;
    scene.save(&state.scene_path)?;
    Ok(scene.clone())
}

fn poisoned() -> CommandError {
    CommandError::Scene {
        message: "the scene lock is poisoned".into(),
    }
}
