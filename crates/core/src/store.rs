//! The compendium store: one SQLite file per compendium, which is also the
//! module format people share. The store holds the record; every index is
//! derived from it and can be rebuilt. Visibility is applied here, at the
//! query, so no caller can forget it.
//! Design: docs/design.md §3.

use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};
use thiserror::Error;

use crate::compendium::{Entry, EntryId, Visibility};

/// Schema version this build writes and reads; bumped with every migration.
const SCHEMA_VERSION: i64 = 1;

/// Failures of the compendium store.
#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("stored JSON is not valid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("no entry with id {0}")]
    NotFound(EntryId),
    #[error("stored visibility code {0} is unknown")]
    UnknownVisibility(i64),
    #[error("compendium schema version {found} is newer than this build supports ({supported})")]
    SchemaTooNew { found: i64, supported: i64 },
}

/// An open compendium.
pub struct Store {
    connection: Connection,
}

impl Store {
    /// Open or create the compendium file at `path` and bring its schema up to date.
    ///
    /// # Errors
    ///
    /// Fails if the file cannot be opened or written, or if it was written by a newer
    /// build than this one.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        let connection = Connection::open(path)?;
        // WAL keeps readers unblocked by writes; NORMAL sync is safe under WAL.
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "NORMAL")?;
        Self::prepare(connection)
    }

    /// A store that lives only in memory, for tests and scratch work.
    ///
    /// # Errors
    ///
    /// Fails only if SQLite itself cannot allocate the database.
    pub fn open_in_memory() -> Result<Self, StoreError> {
        Self::prepare(Connection::open_in_memory()?)
    }

    fn prepare(connection: Connection) -> Result<Self, StoreError> {
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let found: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if found > SCHEMA_VERSION {
            return Err(StoreError::SchemaTooNew {
                found,
                supported: SCHEMA_VERSION,
            });
        }
        if found < 1 {
            connection.execute_batch(
                "CREATE TABLE IF NOT EXISTS entries (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    name TEXT NOT NULL,
                    source TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    visibility INTEGER NOT NULL,
                    data_visibility INTEGER NOT NULL,
                    body TEXT NOT NULL,
                    data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS entries_kind ON entries (kind, name);",
            )?;
            connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }
        Ok(Self { connection })
    }

    /// Insert an entry, or replace the one with the same id.
    ///
    /// # Errors
    ///
    /// Fails if the write fails or the entry's data cannot be serialised.
    pub fn upsert(&self, entry: &Entry) -> Result<(), StoreError> {
        self.connection.execute(
            "INSERT OR REPLACE INTO entries
                (id, kind, name, source, tags, visibility, data_visibility, body, data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                entry.id.as_str(),
                entry.kind,
                entry.name,
                entry.source,
                serde_json::to_string(&entry.tags)?,
                entry.visibility.code(),
                entry.data_visibility.code(),
                entry.body,
                serde_json::to_string(&entry.data)?,
            ],
        )?;
        Ok(())
    }

    /// Insert or replace many entries in one transaction.
    ///
    /// # Errors
    ///
    /// Fails on the first entry that cannot be written; nothing is kept from the batch.
    pub fn upsert_all<'a>(
        &mut self,
        entries: impl IntoIterator<Item = &'a Entry>,
    ) -> Result<usize, StoreError> {
        let transaction = self.connection.transaction()?;
        let mut count = 0;
        {
            let mut statement = transaction.prepare(
                "INSERT OR REPLACE INTO entries
                    (id, kind, name, source, tags, visibility, data_visibility, body, data)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            for entry in entries {
                statement.execute(params![
                    entry.id.as_str(),
                    entry.kind,
                    entry.name,
                    entry.source,
                    serde_json::to_string(&entry.tags)?,
                    entry.visibility.code(),
                    entry.data_visibility.code(),
                    entry.body,
                    serde_json::to_string(&entry.data)?,
                ])?;
                count += 1;
            }
        }
        transaction.commit()?;
        Ok(count)
    }

    /// The entry with `id` as `viewer` may see it.
    ///
    /// # Errors
    ///
    /// `NotFound` when there is no such entry, or when there is one the viewer may not
    /// see: a viewer learns nothing from the difference.
    pub fn get(&self, id: &EntryId, viewer: Visibility) -> Result<Entry, StoreError> {
        let entry = self
            .connection
            .query_row(
                "SELECT id, kind, name, source, tags, visibility, data_visibility, body, data
                 FROM entries WHERE id = ?1",
                params![id.as_str()],
                read_entry,
            )
            .optional()?
            .transpose()?;
        entry
            .and_then(|entry| entry.as_seen_by(viewer))
            .ok_or_else(|| StoreError::NotFound(id.clone()))
    }

    /// Every entry `viewer` may see, optionally of one `kind`, ordered by name.
    ///
    /// # Errors
    ///
    /// Fails if the read fails or a stored row is corrupt.
    pub fn list(&self, kind: Option<&str>, viewer: Visibility) -> Result<Vec<Entry>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT id, kind, name, source, tags, visibility, data_visibility, body, data
             FROM entries
             WHERE visibility <= ?1 AND (?2 IS NULL OR kind = ?2)
             ORDER BY name, id",
        )?;
        let rows = statement.query_map(params![viewer.code(), kind], read_entry)?;
        let mut entries = Vec::new();
        for row in rows {
            let entry = row??;
            if let Some(seen) = entry.as_seen_by(viewer) {
                entries.push(seen);
            }
        }
        Ok(entries)
    }

    /// How many entries the store holds, regardless of visibility.
    ///
    /// # Errors
    ///
    /// Fails if the read fails.
    pub fn count(&self) -> Result<usize, StoreError> {
        let count: i64 = self
            .connection
            .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))?;
        Ok(usize::try_from(count).unwrap_or(0))
    }
}

// Rows are read in the column order every SELECT above uses.
fn read_entry(row: &Row<'_>) -> rusqlite::Result<Result<Entry, StoreError>> {
    let id: String = row.get(0)?;
    let kind: String = row.get(1)?;
    let name: String = row.get(2)?;
    let source: String = row.get(3)?;
    let tags: String = row.get(4)?;
    let visibility: i64 = row.get(5)?;
    let data_visibility: i64 = row.get(6)?;
    let body: String = row.get(7)?;
    let data: String = row.get(8)?;
    Ok(build_entry(
        id,
        kind,
        name,
        source,
        &tags,
        visibility,
        data_visibility,
        body,
        &data,
    ))
}

#[allow(clippy::too_many_arguments)]
fn build_entry(
    id: String,
    kind: String,
    name: String,
    source: String,
    tags: &str,
    visibility: i64,
    data_visibility: i64,
    body: String,
    data: &str,
) -> Result<Entry, StoreError> {
    Ok(Entry {
        id: EntryId::new(id),
        kind,
        name,
        source,
        tags: serde_json::from_str(tags)?,
        visibility: Visibility::from_code(visibility)
            .ok_or(StoreError::UnknownVisibility(visibility))?,
        data_visibility: Visibility::from_code(data_visibility)
            .ok_or(StoreError::UnknownVisibility(data_visibility))?,
        body,
        data: serde_json::from_str(data)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, kind: &str, name: &str, visibility: Visibility) -> Entry {
        Entry {
            id: EntryId::new(id),
            kind: kind.into(),
            name: name.into(),
            source: "srd-5e".into(),
            tags: vec!["test".into()],
            visibility,
            data_visibility: Visibility::Dm,
            body: format!("About {name}."),
            data: serde_json::json!({ "name": name }),
        }
    }

    fn seeded() -> Store {
        let mut store = Store::open_in_memory().expect("memory store");
        store
            .upsert_all(&[
                entry("m:goblin", "monster", "Goblin", Visibility::Party),
                entry("m:lich", "monster", "Lich", Visibility::Dm),
                entry("s:fire-bolt", "spell", "Fire Bolt", Visibility::World),
            ])
            .expect("seed");
        store
    }

    #[test]
    fn a_fresh_store_carries_the_schema_version() {
        let store = Store::open_in_memory().expect("memory store");
        let version: i64 = store
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version");
        assert_eq!(version, SCHEMA_VERSION);
        assert_eq!(store.count().expect("count"), 0);
    }

    #[test]
    fn an_entry_round_trips_with_its_data_and_tags() {
        let store = seeded();
        let goblin = store
            .get(&EntryId::new("m:goblin"), Visibility::Dm)
            .expect("goblin");
        assert_eq!(goblin.name, "Goblin");
        assert_eq!(goblin.tags, vec!["test".to_string()]);
        assert_eq!(goblin.data["name"], "Goblin");
        assert_eq!(goblin.body, "About Goblin.");
    }

    #[test]
    fn upsert_replaces_by_id() {
        let store = seeded();
        let mut renamed = entry("m:goblin", "monster", "Goblin Boss", Visibility::Party);
        renamed.tags = vec!["leader".into()];
        store.upsert(&renamed).expect("replace");
        assert_eq!(store.count().expect("count"), 3);
        let seen = store
            .get(&EntryId::new("m:goblin"), Visibility::Dm)
            .expect("boss");
        assert_eq!(seen.name, "Goblin Boss");
        assert_eq!(seen.tags, vec!["leader".to_string()]);
    }

    #[test]
    fn listing_filters_by_kind_and_orders_by_name() {
        let store = seeded();
        let monsters = store.list(Some("monster"), Visibility::Dm).expect("list");
        let names: Vec<&str> = monsters.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["Goblin", "Lich"]);
        assert_eq!(store.list(None, Visibility::Dm).expect("all").len(), 3);
    }

    #[test]
    fn the_party_never_receives_dm_only_entries_or_statblocks() {
        let store = seeded();
        let party = store.list(None, Visibility::Party).expect("party list");
        let names: Vec<&str> = party.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["Fire Bolt", "Goblin"]);
        assert!(party.iter().all(|e| e.data.is_null()));
        let lich = store.get(&EntryId::new("m:lich"), Visibility::Party);
        assert!(matches!(lich, Err(StoreError::NotFound(_))));
    }

    #[test]
    fn a_missing_id_is_not_found() {
        let store = seeded();
        let missing = store.get(&EntryId::new("m:nothing"), Visibility::Dm);
        assert!(matches!(missing, Err(StoreError::NotFound(_))));
    }

    #[test]
    fn a_file_store_persists_across_opens() {
        let dir = std::env::temp_dir().join(format!("tablewright-store-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("compendium.sqlite");
        {
            let store = Store::open(&path).expect("open");
            store
                .upsert(&entry("m:goblin", "monster", "Goblin", Visibility::Party))
                .expect("write");
        }
        let reopened = Store::open(&path).expect("reopen");
        assert_eq!(reopened.count().expect("count"), 1);
        drop(reopened);
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
