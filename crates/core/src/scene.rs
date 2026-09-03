//! The scene document: one map, its grid, and what stands on it
//! (design.md §5). The board is a view of this document; every change
//! goes through it, so the DM's process is the record and a player's
//! client can only ask. Saved as JSON; walls, lights and emitters join
//! this type in later stages.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;

use crate::compendium::{EntryId, EntrySummary, Visibility};

/// A scene as the board shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub grid: Grid,
    pub map: Option<MapImage>,
    pub tokens: Vec<Token>,
    /// Counter behind the ids this scene mints for new tokens.
    next_token: u32,
}

/// A square grid, in map pixels; hex grids arrive with hexpunk's lattice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Grid {
    pub cell_size: u32,
    pub origin_x: i32,
    pub origin_y: i32,
    pub cols: u32,
    pub rows: u32,
}

/// The map image under the grid.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct MapImage {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

/// Something standing on a cell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Token {
    pub id: String,
    pub name: String,
    /// The short mark drawn on the disc: initials, at most two letters.
    pub label: String,
    pub col: i32,
    pub row: i32,
    /// Degrees clockwise from north.
    pub facing: u16,
    /// The compendium entry this token stands for, when it stands for one.
    pub entry: Option<EntryId>,
    pub visibility: Visibility,
}

/// Failures of the scene document.
#[derive(Debug, Error)]
pub enum SceneError {
    #[error("no token {0} in the scene")]
    NoToken(String),
    #[error("{path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

impl Scene {
    /// The scene a fresh install opens on: the dev tavern, twenty by fifteen
    /// cells, three tokens ready to be dragged.
    pub fn tavern() -> Self {
        let token = |id: &str, label: &str, col: i32, row: i32, facing: u16| Token {
            id: id.into(),
            name: format!("Token {label}"),
            label: label.into(),
            col,
            row,
            facing,
            entry: None,
            visibility: Visibility::Party,
        };
        Self {
            id: "tavern".into(),
            name: "The Rusty Flagon".into(),
            grid: Grid {
                cell_size: 50,
                origin_x: 0,
                origin_y: 0,
                cols: 20,
                rows: 15,
            },
            map: None,
            tokens: vec![
                token("seed-a", "A", 4, 5, 90),
                token("seed-b", "B", 7, 6, 0),
                token("seed-c", "C", 11, 9, 315),
            ],
            next_token: 1,
        }
    }

    /// Move a token to a cell, facing `facing`. The commit point of a drag
    /// or a keyboard step.
    ///
    /// # Errors
    ///
    /// `NoToken` when no token has that id.
    pub fn move_token(
        &mut self,
        id: &str,
        col: i32,
        row: i32,
        facing: u16,
    ) -> Result<&Token, SceneError> {
        let token = self
            .tokens
            .iter_mut()
            .find(|token| token.id == id)
            .ok_or_else(|| SceneError::NoToken(id.to_owned()))?;
        token.col = col;
        token.row = row;
        token.facing = facing % 360;
        Ok(token)
    }

    /// Stand a compendium entry on a cell as a new token, facing north.
    pub fn place(&mut self, entry: &EntrySummary, col: i32, row: i32) -> &Token {
        let id = format!("tok-{}", self.next_token);
        self.next_token += 1;
        self.tokens.push(Token {
            id,
            name: entry.name.clone(),
            label: initials(&entry.name),
            col,
            row,
            facing: 0,
            entry: Some(entry.id.clone()),
            visibility: entry.visibility,
        });
        self.tokens.last().expect("just pushed")
    }

    /// Take a token off the board.
    ///
    /// # Errors
    ///
    /// `NoToken` when no token has that id.
    pub fn remove_token(&mut self, id: &str) -> Result<Token, SceneError> {
        let index = self
            .tokens
            .iter()
            .position(|token| token.id == id)
            .ok_or_else(|| SceneError::NoToken(id.to_owned()))?;
        Ok(self.tokens.remove(index))
    }

    /// Read a scene from its JSON file.
    ///
    /// # Errors
    ///
    /// Fails if the file cannot be read or is not a scene.
    pub fn load(path: &Path) -> Result<Self, SceneError> {
        let text = std::fs::read_to_string(path).map_err(|source| SceneError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        serde_json::from_str(&text).map_err(|source| SceneError::Json {
            path: path.to_path_buf(),
            source,
        })
    }

    /// Write the scene as JSON, creating the directory if need be.
    ///
    /// # Errors
    ///
    /// Fails if the directory or file cannot be written.
    pub fn save(&self, path: &Path) -> Result<(), SceneError> {
        let io = |source| SceneError::Io {
            path: path.to_path_buf(),
            source,
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(io)?;
        }
        let text = serde_json::to_string_pretty(self).map_err(|source| SceneError::Json {
            path: path.to_path_buf(),
            source,
        })?;
        std::fs::write(path, text).map_err(io)
    }
}

// "Goblin Warrior" reads as GW on a disc; "Owl" as O.
fn initials(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|word| word.chars().next())
        .filter(|c| c.is_alphanumeric())
        .take(2)
        .flat_map(char::to_uppercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn goblin() -> EntrySummary {
        EntrySummary {
            id: EntryId::new("5e-2024-srd:monster:goblin-warrior"),
            kind: "monster".into(),
            name: "Goblin Warrior".into(),
            source: "5e-2024-srd".into(),
            tags: vec!["fey".into()],
            visibility: Visibility::Party,
            facets: std::collections::BTreeMap::new(),
        }
    }

    #[test]
    fn the_tavern_has_three_tokens_on_a_twenty_by_fifteen_grid() {
        let scene = Scene::tavern();
        assert_eq!(
            (scene.grid.cols, scene.grid.rows, scene.grid.cell_size),
            (20, 15, 50)
        );
        let ids: Vec<&str> = scene.tokens.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, vec!["seed-a", "seed-b", "seed-c"]);
    }

    #[test]
    fn a_move_lands_on_the_cell_and_wraps_the_facing() {
        let mut scene = Scene::tavern();
        let moved = scene.move_token("seed-a", 6, 5, 450).expect("moved");
        assert_eq!((moved.col, moved.row, moved.facing), (6, 5, 90));
        assert!(matches!(
            scene.move_token("nobody", 0, 0, 0),
            Err(SceneError::NoToken(_))
        ));
    }

    #[test]
    fn placing_an_entry_mints_a_token_that_remembers_it() {
        let mut scene = Scene::tavern();
        let placed = scene.place(&goblin(), 9, 9).clone();
        assert_eq!(placed.id, "tok-1");
        assert_eq!(placed.label, "GW");
        assert_eq!(placed.name, "Goblin Warrior");
        assert_eq!(
            placed.entry.as_ref().map(EntryId::as_str),
            Some("5e-2024-srd:monster:goblin-warrior")
        );
        assert_eq!(placed.visibility, Visibility::Party);
        assert_eq!(scene.place(&goblin(), 1, 1).id, "tok-2");
        assert_eq!(scene.tokens.len(), 5);
    }

    #[test]
    fn removing_a_token_returns_it_and_leaves_the_rest() {
        let mut scene = Scene::tavern();
        let gone = scene.remove_token("seed-b").expect("removed");
        assert_eq!(gone.label, "B");
        assert_eq!(scene.tokens.len(), 2);
        assert!(scene.remove_token("seed-b").is_err());
    }

    #[test]
    fn initials_take_the_first_two_words() {
        assert_eq!(initials("Goblin Warrior"), "GW");
        assert_eq!(initials("Owl"), "O");
        assert_eq!(initials("Ancient Red Dragon"), "AR");
        assert_eq!(initials("  "), "");
    }

    #[test]
    fn a_scene_round_trips_through_its_file() {
        let dir = std::env::temp_dir().join(format!("tablewright-scene-{}", std::process::id()));
        let path = dir.join("scenes").join("current.json");
        let mut scene = Scene::tavern();
        scene.place(&goblin(), 2, 3);
        scene.save(&path).expect("save");
        let back = Scene::load(&path).expect("load");
        assert_eq!(back, scene);
        // The counter survives too, so ids never repeat after a reload.
        let mut back = back;
        assert_eq!(back.place(&goblin(), 0, 0).id, "tok-2");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
