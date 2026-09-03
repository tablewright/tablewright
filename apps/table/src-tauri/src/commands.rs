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
use tablewright_core::{DEFAULT_LIMIT, Entry, EntryId, Hit, Manifest, StoreError, Visibility};
use tauri::State;

use crate::state::AppState;

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

/// Rank the compendium against `query` for a viewer of `viewer` tier.
#[tauri::command]
#[specta::specta]
pub fn search(
    state: State<'_, AppState>,
    query: String,
    viewer: Visibility,
    limit: Option<u32>,
) -> Result<SearchResponse, CommandError> {
    let compendium = state
        .compendium
        .as_ref()
        .ok_or(CommandError::NoCompendium)?;
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
    let compendium = state
        .compendium
        .as_ref()
        .ok_or(CommandError::NoCompendium)?;
    let store = compendium.store.lock().map_err(|_| CommandError::Store {
        message: "the store lock is poisoned".into(),
    })?;
    Ok(store.get(&id, viewer)?)
}

/// The manifests of every module in the compendium, for the credits view.
#[tauri::command]
#[specta::specta]
pub fn modules(state: State<'_, AppState>) -> Result<Vec<Manifest>, CommandError> {
    let compendium = state
        .compendium
        .as_ref()
        .ok_or(CommandError::NoCompendium)?;
    let store = compendium.store.lock().map_err(|_| CommandError::Store {
        message: "the store lock is poisoned".into(),
    })?;
    Ok(store.modules()?)
}
