//! The command surface: what the frontend may ask of the core. Defined once
//! here, exported to TypeScript by tauri-specta, and reached through one
//! typed call whose transport is Tauri invoke in the window and, later, a
//! WebSocket in serve mode (design §6).
//!
//! `viewer` is a parameter because the window is the DM's own process, so
//! the DM may preview what a player sees. A remote transport sets it from
//! the session, never from the caller.

use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::Serialize;
use specta::Type;
use tablewright_core::{
    Campaign, CampaignError, CampaignManifest, CampaignSummary, DEFAULT_LIMIT, Edge, Entry,
    EntryId, Filter, HeightDisplay, Hit, Manifest, MapImage, PlayState, Scene, SceneError,
    SceneSummary, Shelf, StoreError, Stroke, SystemManifest, Understood, Viewer, Visibility,
    campaign,
};
use tauri::State;

use crate::state::{AppState, Session};

// What a new campaign plays until the intro asks: the bundled system and
// its two rule versions from the library.
const SYSTEM: &str = "5e";
const VERSION: &str = "2024";
const MODULES: [&str; 2] = ["5e-2024-srd", "5e-2014-srd"];

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
    /// No campaign is open; the intro screen is where one is.
    NoCampaign,
    /// Neither the library nor the campaign's own store could be opened;
    /// nothing to search.
    NoCompendium,
    /// No entry with that id, or none the viewer may see.
    NotFound { id: String },
    /// The store failed underneath.
    Store { message: String },
    /// The scene refused the change, or could not be saved.
    Scene { message: String },
    /// The campaign folder refused: not a campaign, or could not be written.
    Campaign { message: String },
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

impl From<CampaignError> for CommandError {
    fn from(error: CampaignError) -> Self {
        Self::Campaign {
            message: error.to_string(),
        }
    }
}

// Every command that needs a campaign: lock the session, and say so when
// there is none.
fn with_session<T>(
    state: &AppState,
    answer: impl FnOnce(&mut Session) -> Result<T, CommandError>,
) -> Result<T, CommandError> {
    let mut guard = state.session.lock().map_err(|_| poisoned())?;
    let session = guard.as_mut().ok_or(CommandError::NoCampaign)?;
    answer(session)
}

fn shelf(session: &Session) -> Result<&Shelf, CommandError> {
    session.shelf.as_ref().ok_or(CommandError::NoCompendium)
}

// ── The compendium ──

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
    with_session(&state, |session| {
        let shelf = shelf(session)?;
        let started = Instant::now();
        let limit = limit.map_or(DEFAULT_LIMIT, |limit| limit as usize);
        let viewer = Viewer {
            tier: viewer,
            version,
        };
        let answer =
            shelf
                .catalogue()
                .answer_with(&query, viewer, limit, &filters.unwrap_or_default());
        Ok(SearchResponse {
            hits: answer.hits,
            elapsed_us: u32::try_from(started.elapsed().as_micros()).unwrap_or(u32::MAX),
            catalogue_size: u32::try_from(shelf.len()).unwrap_or(u32::MAX),
            understood: answer.understood,
        })
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
    with_session(&state, |session| {
        let shelf = shelf(session)?;
        let id = match version {
            Some(version) => shelf.version_of(&id, &version).unwrap_or(id),
            None => id,
        };
        Ok(shelf.get(&id, viewer)?)
    })
}

/// The manifests of every module on the shelf, for the credits view.
#[tauri::command]
#[specta::specta]
pub fn modules(state: State<'_, AppState>) -> Result<Vec<Manifest>, CommandError> {
    with_session(&state, |session| Ok(shelf(session)?.modules()?))
}

/// The text values each facet holds across the compendium, for the tray's
/// chips: schools, creature types, categories.
#[tauri::command]
#[specta::specta]
pub fn facet_values(
    state: State<'_, AppState>,
) -> Result<std::collections::BTreeMap<String, Vec<String>>, CommandError> {
    with_session(&state, |session| {
        Ok(shelf(session)?.catalogue().facet_values())
    })
}

/// The system the shelf was seeded for: its categories, kinds, facets and
/// the tray's controls. `None` when the seeder was given none.
#[tauri::command]
#[specta::specta]
pub fn system(state: State<'_, AppState>) -> Result<Option<SystemManifest>, CommandError> {
    with_session(&state, |session| Ok(shelf(session)?.system().cloned()))
}

// ── Campaigns ──

/// Every campaign the app knows: those under the home and those opened
/// from elsewhere, by name.
#[tauri::command]
#[specta::specta]
pub fn list_campaigns(state: State<'_, AppState>) -> Result<Vec<CampaignSummary>, CommandError> {
    let known = state.known.lock().map_err(|_| poisoned())?;
    Ok(campaign::list(&state.campaigns_dir(), &known))
}

/// The campaign at the table, if one is open.
#[tauri::command]
#[specta::specta]
pub fn current_campaign(
    state: State<'_, AppState>,
) -> Result<Option<CampaignSummary>, CommandError> {
    let guard = state.session.lock().map_err(|_| poisoned())?;
    Ok(guard.as_ref().map(|session| session.campaign.summary()))
}

/// Open the campaign folder at `path` and bring it to the table.
#[tauri::command]
#[specta::specta]
pub fn open_campaign(
    state: State<'_, AppState>,
    path: String,
) -> Result<CampaignSummary, CommandError> {
    Ok(state.open_campaign(Path::new(&path))?)
}

/// Make a campaign named `name` under the home, or under `location` when
/// the DM chose a folder of their own, and bring it to the table.
#[tauri::command]
#[specta::specta]
pub fn create_campaign(
    state: State<'_, AppState>,
    name: String,
    location: Option<String>,
) -> Result<CampaignSummary, CommandError> {
    let root = location.map_or_else(|| state.campaigns_dir(), PathBuf::from);
    let dir = Campaign::place(&root, &name);
    Campaign::create(
        &dir,
        CampaignManifest {
            name,
            system: SYSTEM.into(),
            version: VERSION.into(),
            modules: MODULES.iter().map(|module| (*module).to_owned()).collect(),
        },
    )?;
    Ok(state.open_campaign(&dir)?)
}

/// Back to the intro screen.
#[tauri::command]
#[specta::specta]
pub fn close_campaign(state: State<'_, AppState>) -> Result<(), CommandError> {
    state.close_campaign();
    Ok(())
}

// ── The scene ──

// Every change to the open scene: change it, save it, and answer with the
// scene as it now stands.
fn edit_scene(
    state: &AppState,
    change: impl FnOnce(&mut Scene) -> Result<(), SceneError>,
) -> Result<Scene, CommandError> {
    with_session(state, |session| {
        let scenes = session.campaign.scenes_mut();
        change(scenes.current_mut())?;
        scenes.save()?;
        Ok(scenes.current().clone())
    })
}

/// The scene the board shows.
#[tauri::command]
#[specta::specta]
pub fn get_scene(state: State<'_, AppState>) -> Result<Scene, CommandError> {
    with_session(&state, |session| {
        Ok(session.campaign.scenes().current().clone())
    })
}

/// Every scene in the campaign, by name.
#[tauri::command]
#[specta::specta]
pub fn list_scenes(state: State<'_, AppState>) -> Result<Vec<SceneSummary>, CommandError> {
    with_session(&state, |session| Ok(session.campaign.scenes().list()?))
}

/// Switch the table to the scene `id`.
#[tauri::command]
#[specta::specta]
pub fn open_scene(state: State<'_, AppState>, id: String) -> Result<Scene, CommandError> {
    with_session(&state, |session| {
        Ok(session.campaign.scenes_mut().open_scene(&id)?.clone())
    })
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
    with_session(&state, |session| {
        Ok(session
            .campaign
            .scenes_mut()
            .create(&name, strokes)?
            .clone())
    })
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
    with_session(&state, |session| {
        let summary = shelf(session)?.get(&id, Visibility::Dm)?.summary();
        let scenes = session.campaign.scenes_mut();
        scenes.current_mut().place(&summary, col, row);
        scenes.save()?;
        Ok(scenes.current().clone())
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

/// Give the scene its picture, or take it away. A picture arrives as a
/// path on this machine, is copied into the campaign, and is kept by its
/// path within it.
#[tauri::command]
#[specta::specta]
pub fn set_map(state: State<'_, AppState>, map: Option<MapImage>) -> Result<Scene, CommandError> {
    with_session(&state, |session| {
        let taken = match map {
            Some(picture) => Some(MapImage {
                url: session.campaign.take_asset(Path::new(&picture.url))?,
                width: picture.width,
                height: picture.height,
            }),
            None => None,
        };
        let scenes = session.campaign.scenes_mut();
        scenes.current_mut().set_map(taken);
        scenes.save()?;
        Ok(scenes.current().clone())
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
    CommandError::Campaign {
        message: "the session lock is poisoned".into(),
    }
}
