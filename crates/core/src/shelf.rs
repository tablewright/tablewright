//! The compendium a table reads: the library every campaign on the machine
//! shares, and the campaign's own, as one catalogue. The campaign's
//! manifest names the library modules the table sees; where the campaign's
//! own store holds a thing in a version the library also has, the
//! campaign's wins. Design: docs/design.md §3 "The library, and the
//! campaign's own".

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, PoisonError};

use crate::compendium::{Entry, EntryId, EntrySummary, Visibility};
use crate::module::Manifest;
use crate::search::{Catalogue, identity_of};
use crate::store::{Store, StoreError};
use crate::system::SystemManifest;

/// The two layers of a campaign's compendium, read as one.
pub struct Shelf {
    /// The campaign's own store, when it has one. First in every lookup.
    own: Option<Mutex<Store>>,
    /// The library, when it could be opened.
    library: Option<Mutex<Store>>,
    /// The library modules the campaign's manifest lists.
    modules: Vec<String>,
    catalogue: Catalogue,
    system: Option<SystemManifest>,
}

impl Shelf {
    /// Open the shelf over the stores at `library` and `own`, either of
    /// which may be absent, showing the library's `modules`.
    ///
    /// # Errors
    ///
    /// Fails if a store that is there cannot be opened or read.
    pub fn open(
        library: Option<&Path>,
        own: Option<&Path>,
        modules: &[String],
    ) -> Result<Self, StoreError> {
        let library = library.map(Store::open).transpose()?;
        let own = own.map(Store::open).transpose()?;
        Self::from_stores(library, own, modules)
    }

    /// The shelf over stores already open.
    ///
    /// # Errors
    ///
    /// Fails if a store cannot be read.
    pub fn from_stores(
        library: Option<Store>,
        own: Option<Store>,
        modules: &[String],
    ) -> Result<Self, StoreError> {
        // The campaign's own entries first, then the library's that are
        // listed and not already there as the same thing in the same version.
        let mut summaries = Vec::new();
        let mut taken: HashSet<(String, String)> = HashSet::new();
        if let Some(store) = &own {
            for summary in store.summaries()? {
                taken.insert(key_of(&summary));
                summaries.push(summary);
            }
        }
        if let Some(store) = &library {
            for summary in store.summaries()? {
                if modules
                    .iter()
                    .any(|module| module == module_of(&summary.id))
                    && !taken.contains(&key_of(&summary))
                {
                    summaries.push(summary);
                }
            }
        }
        let system = system_of(own.as_ref(), library.as_ref())?;
        let catalogue = Catalogue::with_system(summaries, system.as_ref());
        Ok(Self {
            own: own.map(Mutex::new),
            library: library.map(Mutex::new),
            modules: modules.to_vec(),
            catalogue,
            system,
        })
    }

    /// Everything the table may search.
    pub fn catalogue(&self) -> &Catalogue {
        &self.catalogue
    }

    /// The system the stores were seeded for, the campaign's own first.
    pub fn system(&self) -> Option<&SystemManifest> {
        self.system.as_ref()
    }

    pub fn len(&self) -> usize {
        self.catalogue.len()
    }

    pub fn is_empty(&self) -> bool {
        self.catalogue.is_empty()
    }

    /// One entry as `viewer` may see it, from the campaign's own store
    /// first, else the library's. Its versions are the shelf's, across
    /// both layers.
    ///
    /// # Errors
    ///
    /// `NotFound` when neither layer has it, or none the viewer may see;
    /// otherwise a read that failed.
    pub fn get(&self, id: &EntryId, viewer: Visibility) -> Result<Entry, StoreError> {
        for layer in self.layers() {
            let store = layer.lock().unwrap_or_else(PoisonError::into_inner);
            match store.get(id, viewer) {
                Ok(mut entry) => {
                    entry.versions = self.catalogue.versions_of(id);
                    return Ok(entry);
                }
                Err(StoreError::NotFound(_)) => {}
                Err(error) => return Err(error),
            }
        }
        Err(StoreError::NotFound(id.clone()))
    }

    /// The id of the same thing as `id` in rule `version`, when the shelf
    /// holds one: the campaign's own when it has it, else the library's.
    pub fn version_of(&self, id: &EntryId, version: &str) -> Option<EntryId> {
        self.catalogue.version_of(id, version)
    }

    /// The manifests of the modules on the shelf: the campaign's own, and
    /// the library's that the campaign lists, each id once.
    ///
    /// # Errors
    ///
    /// Fails if a store cannot be read.
    pub fn modules(&self) -> Result<Vec<Manifest>, StoreError> {
        let mut seen = HashSet::new();
        let mut manifests = Vec::new();
        if let Some(own) = &self.own {
            let store = own.lock().unwrap_or_else(PoisonError::into_inner);
            for manifest in store.modules()? {
                if seen.insert(manifest.id.clone()) {
                    manifests.push(manifest);
                }
            }
        }
        if let Some(library) = &self.library {
            let store = library.lock().unwrap_or_else(PoisonError::into_inner);
            for manifest in store.modules()? {
                if self.modules.contains(&manifest.id) && seen.insert(manifest.id.clone()) {
                    manifests.push(manifest);
                }
            }
        }
        Ok(manifests)
    }

    // A poisoned lock means a panic mid-read on another thread; the store
    // itself is whole, every call on it being one SQLite statement, so the
    // guard is taken as it is.
    fn layers(&self) -> impl Iterator<Item = &Mutex<Store>> {
        self.own.iter().chain(self.library.iter())
    }
}

// A thing in a version: what the campaign's own store shadows.
fn key_of(summary: &EntrySummary) -> (String, String) {
    (identity_of(summary), summary.version.clone())
}

// The module an entry came from: the first segment of its id,
// `<module>:<kind>:<slug>`.
fn module_of(id: &EntryId) -> &str {
    id.as_str().split(':').next().unwrap_or("")
}

fn system_of(
    own: Option<&Store>,
    library: Option<&Store>,
) -> Result<Option<SystemManifest>, StoreError> {
    if let Some(store) = own {
        if let Some(system) = store.system()? {
            return Ok(Some(system));
        }
    }
    match library {
        Some(store) => store.system(),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::search::Viewer;

    fn entry(id: &str, kind: &str, name: &str, version: &str) -> Entry {
        Entry {
            id: EntryId::new(id),
            kind: kind.into(),
            name: name.into(),
            source: "test".into(),
            version: version.into(),
            versions: Vec::new(),
            tags: Vec::new(),
            visibility: Visibility::World,
            data_visibility: Visibility::Dm,
            body: format!("About {name}."),
            html: String::new(),
            sections: Vec::new(),
            data: serde_json::json!({}),
            facets: BTreeMap::new(),
            parts: Vec::new(),
        }
    }

    fn manifest(id: &str) -> Manifest {
        Manifest {
            id: id.into(),
            name: id.into(),
            system: "5e".into(),
            system_version: "2024".into(),
            version: "1".into(),
            license: "CC-BY-4.0".into(),
            attribution: String::new(),
            upstream: None,
        }
    }

    fn store(entries: &[Entry], modules: &[&str]) -> Store {
        let mut store = Store::open_in_memory().expect("store");
        store.upsert_all(entries).expect("seed");
        for module in modules {
            store.put_module(&manifest(module)).expect("module");
        }
        store
    }

    fn library() -> Store {
        store(
            &[
                entry("srd-2024:spell:fireball", "spell", "Fireball", "2024"),
                entry("srd-2014:spell:fireball", "spell", "Fireball", "2014"),
                entry("srd-2024:monster:goblin", "monster", "Goblin", "2024"),
                entry("book:monster:owlbear", "monster", "Owlbear", "2024"),
            ],
            &["srd-2024", "srd-2014", "book"],
        )
    }

    fn listed(modules: &[&str]) -> Vec<String> {
        modules.iter().map(|module| (*module).to_owned()).collect()
    }

    #[test]
    fn the_manifest_picks_the_library_modules_and_the_campaigns_own_wins() {
        let own = store(
            &[entry(
                "house:spell:fireball",
                "spell",
                "Fireball (house)",
                "2024",
            )],
            &["house"],
        );
        let shelf = Shelf::from_stores(
            Some(library()),
            Some(own),
            &listed(&["srd-2024", "srd-2014"]),
        )
        .expect("shelf");
        // The house Fireball, the 2014 one, and the goblin: the SRD's 2024
        // Fireball is shadowed, and the book is not listed.
        assert_eq!(shelf.len(), 3);
        let hits = shelf
            .catalogue()
            .search("fireball", Viewer::new(Visibility::Dm, "2024"), 10);
        assert_eq!(hits[0].id.as_str(), "house:spell:fireball");
        let house = EntryId::new("house:spell:fireball");
        assert_eq!(
            shelf.get(&house, Visibility::Party).expect("own").versions,
            ["2014", "2024"]
        );
        assert_eq!(
            shelf.version_of(&house, "2014"),
            Some(EntryId::new("srd-2014:spell:fireball"))
        );
        assert_eq!(
            shelf.version_of(&EntryId::new("srd-2014:spell:fireball"), "2024"),
            Some(house)
        );
        assert_eq!(
            shelf
                .get(&EntryId::new("srd-2024:monster:goblin"), Visibility::Party)
                .expect("library")
                .name,
            "Goblin"
        );
        assert!(
            shelf
                .version_of(&EntryId::new("book:monster:owlbear"), "2024")
                .is_none()
        );
        let modules: Vec<String> = shelf
            .modules()
            .expect("modules")
            .into_iter()
            .map(|manifest| manifest.id)
            .collect();
        assert_eq!(modules, ["house", "srd-2014", "srd-2024"]);
    }

    #[test]
    fn a_shelf_with_only_the_library_shows_what_the_manifest_lists() {
        let shelf = Shelf::from_stores(Some(library()), None, &listed(&["book"])).expect("shelf");
        assert_eq!(shelf.len(), 1);
        assert!(shelf.system().is_none());
        assert!(matches!(
            shelf.get(&EntryId::new("nowhere:spell:x"), Visibility::Dm),
            Err(StoreError::NotFound(_))
        ));
        let modules: Vec<String> = shelf
            .modules()
            .expect("modules")
            .into_iter()
            .map(|manifest| manifest.id)
            .collect();
        assert_eq!(modules, ["book"]);
    }

    #[test]
    fn a_shelf_with_no_store_is_empty() {
        let shelf = Shelf::from_stores(None, None, &listed(&["srd-2024"])).expect("shelf");
        assert!(shelf.is_empty());
        assert!(shelf.modules().expect("modules").is_empty());
    }
}
