//! What the shell holds for the lifetime of the app: the compendium store
//! with the search catalogue built from it, and the scene library with
//! the scene the board shows. Both are opened once at start and shared
//! by every command through Tauri's managed state.

use std::path::Path;
use std::sync::Mutex;

use tablewright_core::{Catalogue, Scenes, Store, StoreError, SystemManifest};

/// An open compendium, its catalogue, and the system it was seeded for.
pub struct Compendium {
    /// SQLite connections are not `Sync`; the mutex makes the state shareable.
    pub store: Mutex<Store>,
    pub catalogue: Catalogue,
    /// The manifest the seeder was given, if any: kinds, facets, controls.
    pub system: Option<SystemManifest>,
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
        let system = store.system()?;
        Ok(Self {
            store: Mutex::new(store),
            catalogue,
            system,
        })
    }
}

/// The managed state. `compendium` is `None` when none could be installed;
/// commands then answer with a named error rather than a crash.
pub struct AppState {
    pub compendium: Option<Compendium>,
    /// The scene library and the scene open; every change is saved at once.
    pub scenes: Mutex<Scenes>,
}
