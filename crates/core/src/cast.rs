//! The cast of the stand-in: what the core answers for a short list of
//! things, for the page served without Tauri to read in place of a core.
//! It is read off a shelf as a new campaign has it, every module and no
//! store of the campaign's own, for the DM and for the party alike, with
//! the fields search reads, the system manifest and the facet values. The
//! seed writes it out as JSON; the page reads the file.
//! Design: docs/design.md §3 "The stand-in's cast".

use std::collections::BTreeMap;

use serde::Serialize;
use specta::Type;
use thiserror::Error;

use crate::compendium::{Entry, EntrySummary, Visibility};
use crate::search::identity_of;
use crate::shelf::Shelf;
use crate::store::{Store, StoreError};
use crate::system::SystemManifest;

/// What the stand-in reads: the cast, with what the whole compendium says
/// about its system and its facets.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Cast {
    /// The system the compendium was seeded for.
    pub system: Option<SystemManifest>,
    /// The text values each facet holds across the whole compendium.
    pub facet_values: BTreeMap<String, Vec<String>>,
    /// Every version of every thing asked for, in the order asked.
    pub entries: Vec<CastEntry>,
}

/// One version of one thing in the cast.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct CastEntry {
    /// The fields search reads.
    pub summary: EntrySummary,
    /// The entry as the DM gets it.
    pub dm: Entry,
    /// As a player at the party tier gets it; nothing when the thing is
    /// the DM's alone.
    pub party: Option<Entry>,
}

/// Why the cast could not be read.
#[derive(Debug, Error)]
pub enum CastError {
    /// A thing asked for that the compendium does not hold.
    #[error("no {0} in the compendium")]
    Missing(String),
    #[error(transparent)]
    Store(#[from] StoreError),
}

impl Cast {
    /// Read `things`, each `<kind>:<slug>`, off `store` as a new campaign's
    /// shelf: every module it holds, no store of the campaign's own. Each
    /// thing comes in every version the shelf holds, oldest first.
    ///
    /// # Errors
    ///
    /// `Missing` for a thing the compendium lacks; otherwise a read that
    /// failed.
    pub fn read(store: Store, things: &[String]) -> Result<Self, CastError> {
        let modules: Vec<String> = store
            .modules()?
            .into_iter()
            .map(|manifest| manifest.id)
            .collect();
        let mut by_thing: BTreeMap<String, Vec<EntrySummary>> = BTreeMap::new();
        for summary in store.summaries()? {
            by_thing
                .entry(identity_of(&summary))
                .or_default()
                .push(summary);
        }
        let shelf = Shelf::from_stores(Some(store), None, &modules)?;
        let mut entries = Vec::new();
        for thing in things {
            let versions = by_thing
                .get_mut(thing)
                .ok_or_else(|| CastError::Missing(thing.clone()))?;
            versions.sort_by(|a, b| a.version.cmp(&b.version).then_with(|| a.id.cmp(&b.id)));
            for summary in versions.iter() {
                let dm = shelf.get(&summary.id, Visibility::Dm)?;
                let party = match shelf.get(&summary.id, Visibility::Party) {
                    Ok(entry) => Some(entry),
                    Err(StoreError::NotFound(_)) => None,
                    Err(error) => return Err(error.into()),
                };
                entries.push(CastEntry {
                    summary: summary.clone(),
                    dm,
                    party,
                });
            }
        }
        Ok(Self {
            system: shelf.system().cloned(),
            facet_values: shelf.catalogue().facet_values(),
            entries,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compendium::EntryId;
    use crate::module::Manifest;

    fn entry(id: &str, kind: &str, name: &str, version: &str, visibility: Visibility) -> Entry {
        Entry {
            id: EntryId::new(id),
            kind: kind.into(),
            name: name.into(),
            source: "test".into(),
            version: version.into(),
            versions: Vec::new(),
            tags: Vec::new(),
            visibility,
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

    fn store() -> Store {
        let mut store = Store::open_in_memory().expect("store");
        store
            .upsert_all(&[
                entry(
                    "srd-2024:spell:fireball",
                    "spell",
                    "Fireball",
                    "2024",
                    Visibility::World,
                ),
                entry(
                    "srd-2014:spell:fireball",
                    "spell",
                    "Fireball",
                    "2014",
                    Visibility::World,
                ),
                entry(
                    "srd-2024:monster:goblin",
                    "monster",
                    "Goblin",
                    "2024",
                    Visibility::Dm,
                ),
            ])
            .expect("seed");
        store.put_module(&manifest("srd-2024")).expect("module");
        store.put_module(&manifest("srd-2014")).expect("module");
        store
    }

    #[test]
    fn every_version_of_each_thing_for_the_dm_and_for_the_party() {
        let cast =
            Cast::read(store(), &["spell:fireball".into(), "monster:goblin".into()]).expect("cast");
        let ids: Vec<&str> = cast
            .entries
            .iter()
            .map(|entry| entry.summary.id.as_str())
            .collect();
        assert_eq!(
            ids,
            [
                "srd-2014:spell:fireball",
                "srd-2024:spell:fireball",
                "srd-2024:monster:goblin"
            ]
        );
        // The spell is everyone's, in both versions; the goblin is the DM's alone.
        assert_eq!(cast.entries[0].dm.versions, ["2014", "2024"]);
        assert!(cast.entries[0].party.is_some());
        assert_eq!(cast.entries[2].dm.versions, ["2024"]);
        assert!(cast.entries[2].party.is_none());
        assert!(cast.system.is_none());
    }

    #[test]
    fn a_thing_the_compendium_lacks_is_an_error() {
        let result = Cast::read(store(), &["spell:nothing".into()]);
        assert!(matches!(result, Err(CastError::Missing(thing)) if thing == "spell:nothing"));
    }
}
