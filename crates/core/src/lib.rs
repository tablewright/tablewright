//! Tablewright core: the content model and the compendium store.
//!
//! Domain logic lives here and nowhere else. The apps are shells over it,
//! and every type that crosses to TypeScript is generated from these
//! definitions, never hand-written. Design: docs/design.md §3, §4.

pub mod compendium;
pub mod module;
pub mod search;
pub mod store;

pub use compendium::{Entry, EntryId, EntrySummary, Visibility};
pub use module::{Manifest, Module, ModuleError, read_module};
pub use search::{Catalogue, DEFAULT_LIMIT, Hit};
pub use store::{Store, StoreError};
