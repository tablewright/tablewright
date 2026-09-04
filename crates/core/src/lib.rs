//! Tablewright core: the content model and the compendium store.
//!
//! Domain logic lives here and nowhere else. The apps are shells over it,
//! and every type that crosses to TypeScript is generated from these
//! definitions, never hand-written. Design: docs/design.md §3, §4.

pub mod compendium;
pub mod module;
pub mod render;
pub mod scene;
pub mod search;
pub mod store;
pub mod system;

pub use compendium::{
    Entry, EntryId, EntrySummary, FacetValue, JsonValue, Part, Section, Visibility,
};
pub use module::{Manifest, Module, ModuleError, read_module};
pub use render::render;
pub use scene::{Grid, MapImage, Scene, SceneError, Token};
pub use search::{Answer, Catalogue, Compare, DEFAULT_LIMIT, Filter, Hit, Understood};
pub use store::{Store, StoreError};
pub use system::{
    Cell, ControlKind, ControlSpec, FacetSpec, FacetType, KindSpec, PartSpec, Sentinels, Stop,
    SystemError, SystemManifest,
};
