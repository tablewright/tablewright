//! The compendium store: one SQLite file per compendium, which is also the
//! module format people share. The store holds the record; every index is
//! derived from it and can be rebuilt. Visibility is applied here, at the
//! query, so no caller can forget it.
//! Design: docs/design.md §3.

use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};
use thiserror::Error;

use crate::compendium::{Entry, EntryId, EntrySummary, Visibility};
use crate::module::Manifest;
use crate::render;
use crate::system::SystemManifest;

/// Schema version this build writes and reads; bumped with every migration.
const SCHEMA_VERSION: i64 = 5;

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
        // Each version adds its own step, so a file from any earlier build is
        // carried forward rather than rebuilt.
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
                CREATE INDEX IF NOT EXISTS entries_kind ON entries (kind, name);
                CREATE TABLE IF NOT EXISTS modules (
                    id TEXT PRIMARY KEY,
                    manifest TEXT NOT NULL
                );",
            )?;
        }
        if found < 2 {
            // Version 2: facets, the filterable facts read from data at seed time.
            connection.execute_batch(
                "ALTER TABLE entries ADD COLUMN facets TEXT NOT NULL DEFAULT '{}';",
            )?;
        }
        if found < 3 {
            // Version 3: the system manifest the content was seeded for, so
            // the app reads kinds, facets and controls from the store.
            connection.execute_batch(
                "CREATE TABLE IF NOT EXISTS systems (
                    id TEXT PRIMARY KEY,
                    manifest TEXT NOT NULL
                );",
            )?;
        }
        if found < 4 {
            // Version 4: parts, the named pieces of data search finds an
            // entry by (traits, actions, features).
            connection.execute_batch(
                "ALTER TABLE entries ADD COLUMN parts TEXT NOT NULL DEFAULT '[]';",
            )?;
        }
        if found < 5 {
            // Version 5: the rule version each entry belongs to, its
            // module's, so one file holds the 2014 and 2024 text side by side.
            connection.execute_batch(
                "ALTER TABLE entries ADD COLUMN version TEXT NOT NULL DEFAULT '';",
            )?;
        }
        if found < SCHEMA_VERSION {
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
                (id, kind, name, source, tags, visibility, data_visibility, body, data, facets, parts,
                 version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                serde_json::to_string(&entry.facets)?,
                serde_json::to_string(&entry.parts)?,
                entry.version,
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
                    (id, kind, name, source, tags, visibility, data_visibility, body, data, facets,
                     parts, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                    serde_json::to_string(&entry.facets)?,
                    serde_json::to_string(&entry.parts)?,
                    entry.version,
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
                "SELECT id, kind, name, source, tags, visibility, data_visibility, body, data, facets,
                        parts, version
                 FROM entries WHERE id = ?1",
                params![id.as_str()],
                read_entry,
            )
            .optional()?
            .transpose()?;
        let seen = entry
            .and_then(|entry| entry.as_seen_by(viewer))
            .ok_or_else(|| StoreError::NotFound(id.clone()))?;
        Ok(dress(seen, self.system()?.as_ref()))
    }

    /// Every entry `viewer` may see, optionally of one `kind`, ordered by name.
    ///
    /// # Errors
    ///
    /// Fails if the read fails or a stored row is corrupt.
    pub fn list(&self, kind: Option<&str>, viewer: Visibility) -> Result<Vec<Entry>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT id, kind, name, source, tags, visibility, data_visibility, body, data, facets,
                    parts, version
             FROM entries
             WHERE visibility <= ?1 AND (?2 IS NULL OR kind = ?2)
             ORDER BY name, id",
        )?;
        let rows = statement.query_map(params![viewer.code(), kind], read_entry)?;
        let system = self.system()?;
        let mut entries = Vec::new();
        for row in rows {
            let entry = row??;
            if let Some(seen) = entry.as_seen_by(viewer) {
                entries.push(dress(seen, system.as_ref()));
            }
        }
        Ok(entries)
    }

    /// Every entry's summary whatever its visibility: the raw material of the
    /// search catalogue, which applies the viewer's tier itself. This list
    /// never leaves the DM's process.
    ///
    /// # Errors
    ///
    /// Fails if the read fails or a stored row is corrupt.
    pub fn summaries(&self) -> Result<Vec<EntrySummary>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT id, kind, name, source, tags, visibility, facets, parts, version
             FROM entries ORDER BY id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })?;
        let mut summaries = Vec::new();
        for row in rows {
            let (id, kind, name, source, tags, visibility, facets, parts, version) = row?;
            summaries.push(EntrySummary {
                id: EntryId::new(id),
                kind,
                name,
                source,
                version,
                tags: serde_json::from_str(&tags)?,
                visibility: Visibility::from_code(visibility)
                    .ok_or(StoreError::UnknownVisibility(visibility))?,
                facets: serde_json::from_str(&facets)?,
                parts: serde_json::from_str(&parts)?,
            });
        }
        Ok(summaries)
    }

    /// Record the manifest of a module whose entries this store holds.
    ///
    /// # Errors
    ///
    /// Fails if the write fails.
    pub fn put_module(&self, manifest: &Manifest) -> Result<(), StoreError> {
        self.connection.execute(
            "INSERT OR REPLACE INTO modules (id, manifest) VALUES (?1, ?2)",
            params![manifest.id, serde_json::to_string(manifest)?],
        )?;
        Ok(())
    }

    /// The manifests of every module in this store, by id.
    ///
    /// # Errors
    ///
    /// Fails if the read fails or a stored manifest is corrupt.
    pub fn modules(&self) -> Result<Vec<Manifest>, StoreError> {
        let mut statement = self
            .connection
            .prepare("SELECT manifest FROM modules ORDER BY id")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        let mut manifests = Vec::new();
        for row in rows {
            manifests.push(serde_json::from_str(&row?)?);
        }
        Ok(manifests)
    }

    /// Record the system the content was seeded for.
    ///
    /// # Errors
    ///
    /// Fails if the manifest cannot be written.
    pub fn put_system(&self, system: &SystemManifest) -> Result<(), StoreError> {
        self.connection.execute(
            "INSERT OR REPLACE INTO systems (id, manifest) VALUES (?1, ?2)",
            params![system.id, serde_json::to_string(system)?],
        )?;
        Ok(())
    }

    /// The system the content was seeded for, if the seeder was given one.
    ///
    /// # Errors
    ///
    /// Fails if the store cannot be read or the manifest no longer parses.
    pub fn system(&self) -> Result<Option<SystemManifest>, StoreError> {
        let mut statement = self
            .connection
            .prepare("SELECT manifest FROM systems ORDER BY id LIMIT 1")?;
        let mut rows = statement.query([])?;
        match rows.next()? {
            Some(row) => Ok(Some(serde_json::from_str(&row.get::<_, String>(0)?)?)),
            None => Ok(None),
        }
    }

    /// Leave the file self-contained for shipping: checkpoint and drop the
    /// write-ahead log, switch to the rollback journal, and vacuum. Opening
    /// the file again turns the write-ahead log back on.
    ///
    /// # Errors
    ///
    /// Fails if the checkpoint or vacuum fails.
    pub fn seal(&self) -> Result<(), StoreError> {
        self.connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        self.connection
            .pragma_update(None, "journal_mode", "DELETE")?;
        self.connection.execute_batch("VACUUM;")?;
        Ok(())
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
    let facets: String = row.get(9)?;
    let parts: String = row.get(10)?;
    let version: String = row.get(11)?;
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
        &facets,
        &parts,
        version,
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
    facets: &str,
    parts: &str,
    version: String,
) -> Result<Entry, StoreError> {
    Ok(Entry {
        id: EntryId::new(id),
        kind,
        name,
        source,
        version,
        tags: serde_json::from_str(tags)?,
        visibility: Visibility::from_code(visibility)
            .ok_or(StoreError::UnknownVisibility(visibility))?,
        data_visibility: Visibility::from_code(data_visibility)
            .ok_or(StoreError::UnknownVisibility(data_visibility))?,
        body,
        html: String::new(),
        sections: Vec::new(),
        data: serde_json::from_str(data)?,
        facets: serde_json::from_str(facets)?,
        parts: serde_json::from_str(parts)?,
    })
}

// What an entry carries only on the way out, after the viewer's tier has
// been applied: its body as HTML, and its parts as sections read out of
// whatever `data` the viewer may see. Rendered now, never stored.
fn dress(mut entry: Entry, system: Option<&SystemManifest>) -> Entry {
    entry.html = render(&entry.body);
    if let Some(system) = system {
        entry.sections = system.sections_for(&entry.kind, &entry.data);
    }
    entry
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_manifest_is_kept_with_the_content() {
        let store = Store::open_in_memory().expect("store");
        assert_eq!(store.system().expect("read"), None);
        let system: SystemManifest = serde_json::from_str(
            r#"{"id":"5e","name":"5e","categories":{"spells":"Spells"},
                "kinds":{"spell":{"name":"Spell","category":"spells"}}}"#,
        )
        .expect("manifest");
        store.put_system(&system).expect("write");
        assert_eq!(store.system().expect("read"), Some(system));
    }

    fn entry(id: &str, kind: &str, name: &str, visibility: Visibility) -> Entry {
        Entry {
            id: EntryId::new(id),
            kind: kind.into(),
            name: name.into(),
            source: "srd-5e".into(),
            version: "2024".into(),
            tags: vec!["test".into()],
            visibility,
            data_visibility: Visibility::Dm,
            body: format!("About {name}."),
            html: String::new(),
            sections: Vec::new(),
            data: serde_json::json!({ "name": name }),
            facets: std::collections::BTreeMap::new(),
            parts: Vec::new(),
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
        assert_eq!(goblin.version, "2024");
        assert_eq!(goblin.html, "<p>About Goblin.</p>\n");
        assert!(goblin.sections.is_empty(), "no manifest, no sections");
    }

    #[test]
    fn sections_come_from_the_manifest_and_only_with_the_data() {
        let store = seeded();
        let system: SystemManifest = serde_json::from_str(
            r#"{"id":"5e","name":"5e",
                "parts":{"monster":[{"path":"actions","label":"Actions"}]}}"#,
        )
        .expect("manifest");
        store.put_system(&system).expect("write");
        let mut goblin = entry("m:goblin", "monster", "Goblin", Visibility::Party);
        goblin.data = serde_json::json!({ "actions": [
            { "name": "Scimitar", "desc": "*Melee Attack Roll:* +4, reach 5 ft." }
        ] });
        store.upsert(&goblin).expect("replace");
        let id = EntryId::new("m:goblin");
        let dm = store.get(&id, Visibility::Dm).expect("dm");
        assert_eq!(dm.sections.len(), 1);
        assert_eq!(dm.sections[0].label, "Actions");
        assert_eq!(dm.sections[0].name, "Scimitar");
        assert_eq!(
            dm.sections[0].html,
            "<p><em>Melee Attack Roll:</em> +4, reach 5 ft.</p>\n"
        );
        // The party may know the goblin but not its statblock: no data, no
        // sections read out of it.
        let party = store.get(&id, Visibility::Party).expect("party");
        assert_eq!(party.data, serde_json::Value::Null);
        assert!(party.sections.is_empty());
        let listed = store.list(Some("monster"), Visibility::Dm).expect("list");
        assert_eq!(listed[0].sections.len(), 1);
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
    fn a_sealed_file_store_has_no_write_ahead_log() {
        let dir = std::env::temp_dir().join(format!("tablewright-seal-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("compendium.sqlite");
        {
            let store = Store::open(&path).expect("open");
            store
                .upsert(&entry("m:goblin", "monster", "Goblin", Visibility::Party))
                .expect("write");
            store.seal().expect("seal");
            let mode: String = store
                .connection
                .pragma_query_value(None, "journal_mode", |row| row.get(0))
                .expect("mode");
            assert_eq!(mode, "delete");
        }
        assert!(!dir.join("compendium.sqlite-wal").exists());
        let reopened = Store::open(&path).expect("reopen");
        assert_eq!(reopened.count().expect("count"), 1);
        drop(reopened);
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_module_manifest_round_trips() {
        let store = Store::open_in_memory().expect("memory store");
        let manifest = Manifest {
            id: "test-mod".into(),
            name: "Test".into(),
            system: "5e".into(),
            system_version: "2024".into(),
            version: "1".into(),
            license: "CC-BY-4.0".into(),
            attribution: "Notice".into(),
            upstream: Some(serde_json::json!({ "name": "hand" })),
        };
        store.put_module(&manifest).expect("put");
        store.put_module(&manifest).expect("put again replaces");
        assert_eq!(store.modules().expect("modules"), vec![manifest]);
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
