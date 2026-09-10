//! Strokes: what the DM draws over the map picture, and what each stroke
//! means for movement and sight. The strokes are the record; the ground
//! grid, the edges and the elevation field are derived from them in
//! order, on the board for now. Shapes are in cells, so a stroke means
//! the same whatever the picture's pixel size. Design: docs/design.md §5
//! "Topology and measurement".

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::compendium::Visibility;

/// One addition to the map: an ink, its shape, and who may see it. A
/// rules stroke also says whether it paints its texture onto the picture
/// (design.md §5 "Data, and texture too"); height's texture is the scene's
/// display, and free ink is texture and nothing else.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "ink", rename_all = "kebab-case")]
pub enum Stroke {
    /// What can be stood on, and by whom.
    Ground {
        shape: Shape,
        state: GroundState,
        look: Look,
        visibility: Visibility,
    },
    /// An opening in a cell edge: a door, an arch, a window.
    Threshold {
        edge: Edge,
        kind: ThresholdKind,
        state: ThresholdState,
        size: OpeningSize,
        look: Look,
        visibility: Visibility,
    },
    /// Solid edges. Nothing derives walls; the DM draws every one.
    Wall {
        shape: WallShape,
        look: Look,
        visibility: Visibility,
    },
    /// An amount written into the elevation field, in the system's
    /// distance unit.
    Height {
        shape: Shape,
        value: i32,
        visibility: Visibility,
    },
    /// Where a change of height is walked rather than climbed: stairs,
    /// ramps, ladders, lifts.
    LevelChange {
        shape: Shape,
        look: Look,
        visibility: Visibility,
    },
    /// Ink with no rules meaning.
    Free {
        shape: Shape,
        visibility: Visibility,
    },
    /// Everything drawn before this is cleared: a reset that stays in the
    /// history, so taking it back brings the rest back.
    Clear { visibility: Visibility },
}

impl Stroke {
    /// Who may see the stroke.
    pub fn visibility(&self) -> Visibility {
        match self {
            Self::Ground { visibility, .. }
            | Self::Threshold { visibility, .. }
            | Self::Wall { visibility, .. }
            | Self::Height { visibility, .. }
            | Self::LevelChange { visibility, .. }
            | Self::Free { visibility, .. }
            | Self::Clear { visibility } => *visibility,
        }
    }
}

/// What a rules stroke shows as: the data the board reads, alone, or the
/// data and its texture painted onto the picture, for a map whose art
/// does not draw its own walls.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Look {
    Data,
    Both,
}

/// An area drawn in cells: a block of cells, a free shape traced as a
/// polygon, or a brush's dabs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Shape {
    Rect {
        rect: CellRect,
    },
    /// The polygon through these corners, in order.
    Free {
        points: Vec<Point>,
    },
    /// A disc of `radius` cells around each dab.
    Brush {
        points: Vec<Point>,
        radius: f32,
    },
}

/// A wall as drawn: along one run of edges, or the four sides of a rect.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum WallShape {
    Line { edges: Vec<Edge> },
    Rect { rect: CellRect },
}

/// A block of cells, both corners inclusive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CellRect {
    pub col0: i32,
    pub row0: i32,
    pub col1: i32,
    pub row1: i32,
}

/// A point in cell units from the grid's origin: (1.5, 2.5) is the centre
/// of column 1, row 2.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

/// One edge of a cell, named by the cell and the side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub struct Edge {
    pub col: i32,
    pub row: i32,
    pub side: Side,
}

/// The two sides that name every edge once: a cell's east edge is its
/// neighbour's west, its south edge the one below's north.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    East,
    South,
}

/// What a cell of ground is for movement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum GroundState {
    Ground,
    /// Double cost to cross.
    Difficult,
    /// Fliers only: the gap between islands, a floor a spell took.
    Air,
    /// Nobody: outside the scene.
    Void,
}

/// What kind of opening a threshold is. Windows pass sight whatever their
/// state; a frosted one blurs it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ThresholdKind {
    Door,
    Arch,
    Window,
    Frosted,
}

/// A threshold's state. A secret one is the DM's alone until it is found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ThresholdState {
    Open,
    Closed,
    Locked,
    Secret,
}

/// What a threshold became in play: opened, shut, locked, or smashed
/// through. Play state is kept apart from the strokes; a stroke says what
/// was drawn, this says what the table did with it since.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PlayState {
    Open,
    Closed,
    Locked,
    /// A large window forced: glass gone, the way through open.
    Smashed,
}

/// A threshold's state in play, by the edge it sits on. A secret door with
/// one is revealed: everyone sees the door in that state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ThresholdPlay {
    pub edge: Edge,
    pub state: PlayState,
}

/// A window's size: a large one is forcible in play, dived through open or
/// smashed shut; a small one is sight only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum OpeningSize {
    Small,
    Large,
}

/// How a scene shows height over its picture.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct HeightDisplay {
    pub mode: HeightMode,
    /// The overlay's opacity, 0 to 100.
    pub strength: u8,
}

impl Default for HeightDisplay {
    // Shaded at 80 read well over every map style tried; the DM turns it
    // down per scene.
    fn default() -> Self {
        Self {
            mode: HeightMode::Shaded,
            strength: 80,
        }
    }
}

/// The ways height can show: a soft shadow on the low side, a tint per
/// band, a hairline with edge tags, or nothing but the numbers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum HeightMode {
    Shaded,
    Washed,
    Marked,
    Data,
}

#[cfg(test)]
mod tests {
    use super::*;

    // The JSON is the wire the board's derivation reads; its tags are part
    // of the contract.
    #[test]
    fn a_stroke_is_written_flat_with_its_ink_and_shape_named() {
        let stroke = Stroke::Threshold {
            edge: Edge {
                col: 10,
                row: 7,
                side: Side::East,
            },
            kind: ThresholdKind::Window,
            state: ThresholdState::Closed,
            size: OpeningSize::Large,
            look: Look::Both,
            visibility: Visibility::Party,
        };
        let json = serde_json::to_value(&stroke).expect("json");
        assert_eq!(
            json,
            serde_json::json!({
                "ink": "threshold",
                "edge": { "col": 10, "row": 7, "side": "east" },
                "kind": "window",
                "state": "closed",
                "size": "large",
                "look": "both",
                "visibility": "party",
            })
        );
        let level = Stroke::LevelChange {
            shape: Shape::Brush {
                points: vec![Point { x: 1.5, y: 2.5 }],
                radius: 0.6,
            },
            look: Look::Data,
            visibility: Visibility::Dm,
        };
        let json = serde_json::to_value(&level).expect("json");
        assert_eq!(json["ink"], "level-change");
        assert_eq!(json["shape"]["kind"], "brush");
        assert_eq!(json["shape"]["radius"], 0.6_f32);
        let reset = serde_json::to_value(Stroke::Clear {
            visibility: Visibility::Party,
        })
        .expect("json");
        assert_eq!(
            reset,
            serde_json::json!({ "ink": "clear", "visibility": "party" })
        );
    }

    #[test]
    fn every_ink_carries_its_visibility() {
        let shape = Shape::Rect {
            rect: CellRect {
                col0: 0,
                row0: 0,
                col1: 1,
                row1: 1,
            },
        };
        let strokes = [
            Stroke::Ground {
                shape: shape.clone(),
                state: GroundState::Ground,
                look: Look::Data,
                visibility: Visibility::World,
            },
            Stroke::Wall {
                shape: WallShape::Line { edges: Vec::new() },
                look: Look::Both,
                visibility: Visibility::Party,
            },
            Stroke::Height {
                shape: shape.clone(),
                value: 10,
                visibility: Visibility::Dm,
            },
            Stroke::Free {
                shape,
                visibility: Visibility::Party,
            },
        ];
        let seen: Vec<Visibility> = strokes.iter().map(Stroke::visibility).collect();
        assert_eq!(
            seen,
            [
                Visibility::World,
                Visibility::Party,
                Visibility::Dm,
                Visibility::Party
            ]
        );
    }

    #[test]
    fn the_display_starts_shaded_at_eighty() {
        assert_eq!(
            HeightDisplay::default(),
            HeightDisplay {
                mode: HeightMode::Shaded,
                strength: 80
            }
        );
    }
}
