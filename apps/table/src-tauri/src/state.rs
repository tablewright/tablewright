//! What the shell holds for the lifetime of the app: the compendium store
//! and the search catalogue built from it, opened once at start and shared
//! by every command through Tauri's managed state.

use std::path::Path;
use std::sync::Mutex;

use tablewright_core::{Catalogue, Store, StoreError};

/// An open compendium and its catalogue.
pub struct Compendium {
    /// SQLite connections are not `Sync`; the mutex makes the state shareable.
    pub store: Mutex<Store>,
    pub catalogue: Catalogue,
}

impl Compendium {
    /// Open the compendium at `path` and build its catalogue.
    ///
    /// # Errors
    ///
    /// Fails if the file cannot be opened or read.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        let store = Store::open(path)?;
        let catalogue = Catalogue::from_store(&store)?;
        Ok(Self {
            store: Mutex::new(store),
            catalogue,
        })
    }
}

/// The managed state. `None` when no compendium could be installed; commands
/// then answer with a named error rather than a crash.
pub struct AppState {
    pub compendium: Option<Compendium>,
}
