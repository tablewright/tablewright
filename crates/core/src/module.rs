//! A module on disk: the folder format contributors write and the seeder
//! reads. A `module.json` manifest at the root, then one JSON file per
//! entry in the envelope shape under kind directories. The entry's own
//! `type` and `id` are authoritative; the directory name is for people.
//! Design: docs/design.md §3 "Systems and modules".

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;

use crate::compendium::Entry;

/// The manifest at a module's root, `module.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub system: String,
    #[serde(rename = "systemVersion")]
    pub system_version: String,
    pub version: String,
    pub license: String,
    /// The notice the licence requires; shown in the credits view.
    pub attribution: String,
    /// Free-form provenance: where the content was imported from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upstream: Option<serde_json::Value>,
}

/// A module read from disk and validated.
#[derive(Debug)]
pub struct Module {
    pub root: PathBuf,
    pub manifest: Manifest,
    pub entries: Vec<Entry>,
}

/// Failures of reading a module.
#[derive(Debug, Error)]
pub enum ModuleError {
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
    #[error("{path}: {reason}")]
    Invalid { path: PathBuf, reason: String },
}

/// Read and validate the module rooted at `root`.
///
/// Every entry must name this module as its source, carry an id of the form
/// `<module>:<type>:<file stem>`, and be the only entry with that id.
///
/// # Errors
///
/// Fails on the first unreadable file, malformed JSON, or invalid entry.
pub fn read_module(root: &Path) -> Result<Module, ModuleError> {
    let manifest_path = root.join("module.json");
    let manifest: Manifest = read_json(&manifest_path)?;
    if manifest.id.is_empty() || manifest.id.contains(':') {
        return Err(invalid(
            &manifest_path,
            "module id must be non-empty and free of ':'",
        ));
    }
    let mut entries = Vec::new();
    let mut seen = HashSet::new();
    for directory in sorted_children(root, |path| path.is_dir())? {
        for file in sorted_children(&directory, |path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })? {
            let entry: Entry = read_json(&file)?;
            validate(&manifest, &file, &entry)?;
            if !seen.insert(entry.id.clone()) {
                return Err(invalid(&file, &format!("duplicate id {}", entry.id)));
            }
            entries.push(entry);
        }
    }
    Ok(Module {
        root: root.to_path_buf(),
        manifest,
        entries,
    })
}

fn validate(manifest: &Manifest, file: &Path, entry: &Entry) -> Result<(), ModuleError> {
    if entry.source != manifest.id {
        return Err(invalid(
            file,
            &format!(
                "source {:?} is not this module ({:?})",
                entry.source, manifest.id
            ),
        ));
    }
    if entry.kind.is_empty() || entry.name.is_empty() {
        return Err(invalid(file, "type and name must be non-empty"));
    }
    let stem = file
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("");
    let expected = format!("{}:{}:{}", manifest.id, entry.kind, stem);
    if entry.id.as_str() != expected {
        return Err(invalid(
            file,
            &format!("id {} should be {expected}", entry.id),
        ));
    }
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, ModuleError> {
    let text = std::fs::read_to_string(path).map_err(|source| ModuleError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    serde_json::from_str(&text).map_err(|source| ModuleError::Json {
        path: path.to_path_buf(),
        source,
    })
}

// Directory listing order is not stable across platforms; sorting keeps the
// read order, and so every downstream artefact, deterministic.
fn sorted_children(
    directory: &Path,
    keep: impl Fn(&Path) -> bool,
) -> Result<Vec<PathBuf>, ModuleError> {
    let listing = std::fs::read_dir(directory).map_err(|source| ModuleError::Io {
        path: directory.to_path_buf(),
        source,
    })?;
    let mut children = Vec::new();
    for child in listing {
        let child = child.map_err(|source| ModuleError::Io {
            path: directory.to_path_buf(),
            source,
        })?;
        let path = child.path();
        if keep(&path) {
            children.push(path);
        }
    }
    children.sort();
    Ok(children)
}

fn invalid(path: &Path, reason: &str) -> ModuleError {
    ModuleError::Invalid {
        path: path.to_path_buf(),
        reason: reason.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT: AtomicUsize = AtomicUsize::new(0);

    const MANIFEST: &str = r#"{
        "id": "test-mod", "name": "Test", "system": "5e", "systemVersion": "2024",
        "version": "1", "license": "CC-BY-4.0", "attribution": "Test notice",
        "upstream": { "name": "hand" }
    }"#;

    fn entry_json(id: &str, kind: &str, source: &str) -> String {
        format!(
            r#"{{"id":"{id}","type":"{kind}","name":"Thing","source":"{source}","tags":["a"],
            "visibility":"world","data_visibility":"world","body":"","data":{{"n":1}}}}"#
        )
    }

    // A fresh module directory per test, removed by the returned guard.
    fn module_dir(files: &[(&str, &str)]) -> (PathBuf, Cleanup) {
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let root =
            std::env::temp_dir().join(format!("tablewright-module-{}-{n}", std::process::id()));
        for (relative, text) in files {
            let path = root.join(relative);
            std::fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
            std::fs::write(&path, text).expect("write");
        }
        (root.clone(), Cleanup(root))
    }

    struct Cleanup(PathBuf);

    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_a_module_with_its_manifest_and_entries() {
        let (root, _guard) = module_dir(&[
            ("module.json", MANIFEST),
            (
                "spells/fire-bolt.json",
                &entry_json("test-mod:spell:fire-bolt", "spell", "test-mod"),
            ),
            (
                "monsters/goblin.json",
                &entry_json("test-mod:monster:goblin", "monster", "test-mod"),
            ),
            ("monsters/README.md", "not an entry"),
        ]);
        let module = read_module(&root).expect("module");
        assert_eq!(module.manifest.id, "test-mod");
        assert_eq!(module.manifest.attribution, "Test notice");
        assert_eq!(
            module.manifest.upstream.as_ref().map(|u| u["name"].clone()),
            Some("hand".into())
        );
        let ids: Vec<&str> = module.entries.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["test-mod:monster:goblin", "test-mod:spell:fire-bolt"]
        );
        assert_eq!(module.entries[0].data["n"], 1);
    }

    #[test]
    fn rejects_an_entry_from_another_source() {
        let (root, _guard) = module_dir(&[
            ("module.json", MANIFEST),
            (
                "spells/fire-bolt.json",
                &entry_json("test-mod:spell:fire-bolt", "spell", "other"),
            ),
        ]);
        let error = read_module(&root).expect_err("foreign source");
        assert!(matches!(error, ModuleError::Invalid { .. }), "{error}");
        assert!(error.to_string().contains("not this module"), "{error}");
    }

    #[test]
    fn rejects_an_id_that_does_not_match_its_file() {
        let (root, _guard) = module_dir(&[
            ("module.json", MANIFEST),
            (
                "spells/fire-bolt.json",
                &entry_json("test-mod:spell:firebolt", "spell", "test-mod"),
            ),
        ]);
        let error = read_module(&root).expect_err("mismatched id");
        assert!(
            error
                .to_string()
                .contains("should be test-mod:spell:fire-bolt"),
            "{error}"
        );
    }

    #[test]
    fn rejects_duplicate_ids_across_directories() {
        let (root, _guard) = module_dir(&[
            ("module.json", MANIFEST),
            (
                "spells/zap.json",
                &entry_json("test-mod:spell:zap", "spell", "test-mod"),
            ),
            (
                "more/zap.json",
                &entry_json("test-mod:spell:zap", "spell", "test-mod"),
            ),
        ]);
        let error = read_module(&root).expect_err("duplicate");
        assert!(error.to_string().contains("duplicate id"), "{error}");
    }

    #[test]
    fn a_missing_manifest_is_an_io_error_naming_the_path() {
        let (root, _guard) = module_dir(&[("spells/zap.json", "{}")]);
        let error = read_module(&root).expect_err("no manifest");
        assert!(matches!(error, ModuleError::Io { .. }), "{error}");
        assert!(error.to_string().contains("module.json"), "{error}");
    }

    #[test]
    fn malformed_json_is_reported_with_its_path() {
        let (root, _guard) =
            module_dir(&[("module.json", MANIFEST), ("spells/bad.json", "{ nope")]);
        let error = read_module(&root).expect_err("bad json");
        assert!(matches!(error, ModuleError::Json { .. }), "{error}");
        assert!(error.to_string().contains("bad.json"), "{error}");
    }
}
