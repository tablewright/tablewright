//! The scene document: one map, its grid, and what stands on it
//! (design.md §5). The board is a view of this document; every change
//! goes through it, so the DM's process is the record and a player's
//! client can only ask. Saved as JSON; lights and emitters join this
//! type in later stages.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;

use crate::compendium::{EntryId, EntrySummary, Visibility};
use crate::stroke::{Edge, HeightDisplay, PlayState, Stroke, ThresholdPlay, ThresholdState};

/// A scene as the board shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub grid: Grid,
    pub map: Option<MapImage>,
    pub tokens: Vec<Token>,
    /// What the DM drew over the picture, in the order drawn. This is the
    /// record; the board derives the ground, the edges and the field from
    /// it.
    pub strokes: Vec<Stroke>,
    /// How this scene shows height over its picture.
    pub display: HeightDisplay,
    /// What changed in play and is not a stroke: thresholds worked, by edge.
    pub play: Vec<ThresholdPlay>,
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
    #[error("no stroke {0} in the scene")]
    NoStroke(usize),
    #[error("no scene {0} in the library")]
    NoScene(String),
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
            strokes: Vec::new(),
            display: HeightDisplay::default(),
            play: Vec::new(),
            next_token: 1,
        }
    }

    /// A scene with nothing on it but `strokes`, drawn as if added one by
    /// one, on the tavern's grid: what the DM creates from the scene tab,
    /// or a reference drawing as a scene.
    pub fn blank(id: &str, name: &str, strokes: Vec<Stroke>) -> Self {
        let mut scene = Self {
            id: id.into(),
            name: name.into(),
            grid: Grid {
                cell_size: 50,
                origin_x: 0,
                origin_y: 0,
                cols: 20,
                rows: 15,
            },
            map: None,
            tokens: Vec::new(),
            strokes: Vec::with_capacity(strokes.len()),
            display: HeightDisplay::default(),
            play: Vec::new(),
            next_token: 1,
        };
        for stroke in strokes {
            scene.add_stroke(stroke);
        }
        scene
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

    /// Mark who may see a token: the party, or the DM keeping it back.
    ///
    /// # Errors
    ///
    /// `NoToken` when no token has that id.
    pub fn set_token_visibility(
        &mut self,
        id: &str,
        visibility: Visibility,
    ) -> Result<&Token, SceneError> {
        let token = self
            .tokens
            .iter_mut()
            .find(|token| token.id == id)
            .ok_or_else(|| SceneError::NoToken(id.to_owned()))?;
        token.visibility = visibility;
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
            // The party's, whatever the entry's own tier is: looking a
            // goblin up and seeing one on the table are different
            // questions, and putting it down is showing it. A DM who
            // wants it out of sight says so (`scene:hide`).
            visibility: Visibility::Party,
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

    /// Add a stroke to the end of the record. A secret threshold is the
    /// DM's whatever it was drawn with: it stays unseen until it is found.
    pub fn add_stroke(&mut self, mut stroke: Stroke) -> &Stroke {
        if let Stroke::Threshold {
            state: ThresholdState::Secret,
            visibility,
            ..
        } = &mut stroke
        {
            *visibility = Visibility::Dm;
        }
        self.strokes.push(stroke);
        self.strokes.last().expect("just pushed")
    }

    /// Take one stroke out of the record; the rest keep their order.
    ///
    /// # Errors
    ///
    /// `NoStroke` when the record has no stroke at `index`.
    pub fn remove_stroke(&mut self, index: usize) -> Result<Stroke, SceneError> {
        if index >= self.strokes.len() {
            return Err(SceneError::NoStroke(index));
        }
        Ok(self.strokes.remove(index))
    }

    /// Take back the last stroke drawn, or `None` when there is none.
    pub fn undo_stroke(&mut self) -> Option<Stroke> {
        self.strokes.pop()
    }

    /// Choose how this scene shows height over its picture.
    pub fn set_display(&mut self, display: HeightDisplay) {
        self.display = display;
    }

    /// Give the scene its picture, or take it away. The url is kept as the
    /// table gave it: a path on this machine, or an address the page loads.
    pub fn set_map(&mut self, map: Option<MapImage>) {
        self.map = map;
    }

    /// Record what a threshold became in play: a door opened, a window
    /// smashed, a secret door revealed. One state per edge, the latest.
    pub fn set_threshold_state(&mut self, edge: Edge, state: PlayState) -> &ThresholdPlay {
        let index = match self.play.iter().position(|entry| entry.edge == edge) {
            Some(index) => {
                self.play[index].state = state;
                index
            }
            None => {
                self.play.push(ThresholdPlay { edge, state });
                self.play.len() - 1
            }
        };
        &self.play[index]
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
    use crate::stroke::{
        CellRect, Edge, GroundState, HeightMode, Look, OpeningSize, Point, Shape, Side,
        ThresholdKind, WallShape,
    };

    #[test]
    fn a_token_put_down_is_the_party_s_however_the_entry_is_kept() {
        let mut scene = Scene::tavern();
        let mut secret = goblin();
        secret.visibility = Visibility::Dm;
        let token = scene.place(&secret, 3, 3).clone();
        assert_eq!(
            token.visibility,
            Visibility::Party,
            "putting a thing on the table is showing it"
        );
    }

    #[test]
    fn a_token_is_kept_back_and_given_again() {
        let mut scene = Scene::tavern();
        let token = scene.place(&goblin(), 3, 3).id.clone();
        let kept = scene
            .set_token_visibility(&token, Visibility::Dm)
            .expect("the token");
        assert_eq!(kept.visibility, Visibility::Dm);
        let shown = scene
            .set_token_visibility(&token, Visibility::Party)
            .expect("the token");
        assert_eq!(shown.visibility, Visibility::Party);
        assert!(scene.set_token_visibility("nobody", Visibility::Dm).is_err());
    }

    fn goblin() -> EntrySummary {

        EntrySummary {
            id: EntryId::new("5e-2024-srd:monster:goblin-warrior"),
            kind: "monster".into(),
            name: "Goblin Warrior".into(),
            source: "5e-2024-srd".into(),
            version: "2024".into(),
            tags: vec!["fey".into()],
            visibility: Visibility::Party,
            facets: std::collections::BTreeMap::new(),
            parts: Vec::new(),
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

    fn rect(col0: i32, row0: i32, col1: i32, row1: i32) -> Shape {
        Shape::Rect {
            rect: CellRect {
                col0,
                row0,
                col1,
                row1,
            },
        }
    }

    fn door(col: i32, row: i32, state: ThresholdState) -> Stroke {
        Stroke::Threshold {
            edge: Edge {
                col,
                row,
                side: Side::East,
            },
            kind: ThresholdKind::Door,
            state,
            size: OpeningSize::Small,
            tall: 7,
            look: Look::Data,
            visibility: Visibility::Party,
        }
    }

    // A stroke of every ink and shape, so the file format is tried whole.
    fn drawing_room() -> Vec<Stroke> {
        vec![
            Stroke::Ground {
                shape: rect(1, 1, 12, 13),
                state: GroundState::Ground,
                height: Some(10),
                look: Look::Data,
                visibility: Visibility::Party,
            },
            Stroke::Ground {
                shape: Shape::Free {
                    points: vec![
                        Point { x: 3.0, y: 3.0 },
                        Point { x: 7.5, y: 2.5 },
                        Point { x: 6.0, y: 8.0 },
                    ],
                },
                state: GroundState::Difficult,
                height: None,
                look: Look::Data,
                visibility: Visibility::Party,
            },
            Stroke::Wall {
                shape: WallShape::Rect {
                    rect: CellRect {
                        col0: 1,
                        row0: 1,
                        col1: 10,
                        row1: 2,
                    },
                },
                tall: 20,
                look: Look::Data,
                visibility: Visibility::Party,
            },
            Stroke::Wall {
                shape: WallShape::Line {
                    edges: vec![
                        Edge {
                            col: 4,
                            row: 4,
                            side: Side::South,
                        },
                        Edge {
                            col: 5,
                            row: 4,
                            side: Side::South,
                        },
                    ],
                },
                tall: 10,
                look: Look::Data,
                visibility: Visibility::Party,
            },
            door(10, 7, ThresholdState::Open),
            Stroke::Height {
                shape: Shape::Brush {
                    points: vec![Point { x: 8.5, y: 9.5 }, Point { x: 9.0, y: 9.5 }],
                    radius: 0.6,
                },
                value: 10,
                visibility: Visibility::Party,
            },
            Stroke::LevelChange {
                shape: Shape::Brush {
                    points: vec![Point { x: 7.5, y: 9.5 }],
                    radius: 0.6,
                },
                look: Look::Data,
                visibility: Visibility::Party,
            },
            Stroke::Free {
                shape: Shape::Brush {
                    points: vec![Point { x: 2.0, y: 2.0 }, Point { x: 2.2, y: 2.4 }],
                    radius: 0.3,
                },
                height: None,
                visibility: Visibility::Dm,
            },
        ]
    }

    #[test]
    fn strokes_join_the_record_in_the_order_drawn() {
        let mut scene = Scene::tavern();
        for stroke in drawing_room() {
            scene.add_stroke(stroke);
        }
        assert_eq!(scene.strokes, drawing_room());
    }

    #[test]
    fn a_secret_threshold_is_the_dms_whatever_it_was_drawn_with() {
        let mut scene = Scene::tavern();
        let added = scene.add_stroke(door(3, 3, ThresholdState::Secret));
        assert_eq!(added.visibility(), Visibility::Dm);
        let added = scene.add_stroke(door(3, 4, ThresholdState::Locked));
        assert_eq!(added.visibility(), Visibility::Party);
    }

    #[test]
    fn removing_a_stroke_keeps_the_others_in_order() {
        let mut scene = Scene::tavern();
        for stroke in drawing_room() {
            scene.add_stroke(stroke);
        }
        let gone = scene.remove_stroke(4).expect("removed");
        assert_eq!(gone, door(10, 7, ThresholdState::Open));
        let mut expected = drawing_room();
        expected.remove(4);
        assert_eq!(scene.strokes, expected);
        assert!(matches!(
            scene.remove_stroke(7),
            Err(SceneError::NoStroke(7))
        ));
    }

    #[test]
    fn undo_takes_the_last_stroke_until_there_is_none() {
        let mut scene = Scene::tavern();
        scene.add_stroke(door(1, 1, ThresholdState::Open));
        scene.add_stroke(door(2, 2, ThresholdState::Closed));
        assert_eq!(
            scene.undo_stroke(),
            Some(door(2, 2, ThresholdState::Closed))
        );
        assert_eq!(scene.undo_stroke(), Some(door(1, 1, ThresholdState::Open)));
        assert_eq!(scene.undo_stroke(), None);
    }

    #[test]
    fn the_display_is_shaded_until_the_dm_chooses() {
        let mut scene = Scene::tavern();
        assert_eq!(scene.display, HeightDisplay::default());
        let washed = HeightDisplay {
            mode: HeightMode::Washed,
            strength: 45,
        };
        scene.set_display(washed);
        assert_eq!(scene.display, washed);
    }

    #[test]
    fn a_scene_takes_a_picture_and_gives_it_up() {
        let mut scene = Scene::tavern();
        let picture = MapImage {
            url: "C:\\maps\\mansion.png".into(),
            width: 1000,
            height: 750,
        };
        scene.set_map(Some(picture.clone()));
        assert_eq!(scene.map, Some(picture));
        scene.set_map(None);
        assert_eq!(scene.map, None);
    }

    #[test]
    fn a_threshold_keeps_one_play_state_per_edge_the_latest() {
        let mut scene = Scene::tavern();
        let door = Edge {
            col: 15,
            row: 6,
            side: Side::South,
        };
        assert_eq!(
            scene.set_threshold_state(door, PlayState::Open).state,
            PlayState::Open
        );
        assert_eq!(
            scene.set_threshold_state(door, PlayState::Closed).state,
            PlayState::Closed
        );
        let window = Edge {
            col: 18,
            row: 2,
            side: Side::East,
        };
        scene.set_threshold_state(window, PlayState::Smashed);
        assert_eq!(
            scene.play,
            vec![
                ThresholdPlay {
                    edge: door,
                    state: PlayState::Closed
                },
                ThresholdPlay {
                    edge: window,
                    state: PlayState::Smashed
                },
            ]
        );
    }

    #[test]
    fn a_drawn_scene_round_trips_through_its_file() {
        let dir = std::env::temp_dir().join(format!("tablewright-drawn-{}", std::process::id()));
        let path = dir.join("current.json");
        let mut scene = Scene::tavern();
        for stroke in drawing_room() {
            scene.add_stroke(stroke);
        }
        scene.set_display(HeightDisplay {
            mode: HeightMode::Marked,
            strength: 60,
        });
        scene.save(&path).expect("save");
        assert_eq!(Scene::load(&path).expect("load"), scene);
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    // The stage's target is 500 strokes saved and loaded in under 5 ms;
    // the time is printed for `cargo test -- --nocapture`, not asserted,
    // since a busy runner would make a flake of it.
    #[test]
    fn five_hundred_strokes_round_trip_through_their_file() {
        let dir =
            std::env::temp_dir().join(format!("tablewright-five-hundred-{}", std::process::id()));
        let path = dir.join("current.json");
        let mut scene = Scene::tavern();
        let room = drawing_room();
        for i in 0..500 {
            scene.add_stroke(room[i % room.len()].clone());
        }
        assert_eq!(scene.strokes.len(), 500);
        let started = std::time::Instant::now();
        scene.save(&path).expect("save");
        let saved = started.elapsed();
        let started = std::time::Instant::now();
        let back = Scene::load(&path).expect("load");
        let loaded = started.elapsed();
        println!("500 strokes saved in {saved:?} and loaded in {loaded:?}");
        assert_eq!(back, scene);
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
