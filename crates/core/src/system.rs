//! A game system's manifest, `systems/<system>/system.json` (design §3
//! "Systems and modules"): the declarative part of a system. For now that
//! is its facets, the fields of an entry's `data` that search may filter
//! on, named per kind as a dotted path into the JSON. The seeder reads
//! those paths once and stores the values on each entry, so search never
//! opens `data`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::compendium::FacetValue;

/// The system manifest, as much of it as the core reads.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SystemManifest {
    pub id: String,
    pub name: String,
    /// Facet name to dotted path into `data`, per kind.
    #[serde(default)]
    pub facets: BTreeMap<String, BTreeMap<String, String>>,
}

/// Failures of reading a system manifest.
#[derive(Debug, Error)]
pub enum SystemError {
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
}

impl SystemManifest {
    /// Read `system.json`.
    ///
    /// # Errors
    ///
    /// Fails if the file cannot be read or is not a manifest.
    pub fn load(path: &Path) -> Result<Self, SystemError> {
        let text = std::fs::read_to_string(path).map_err(|source| SystemError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        serde_json::from_str(&text).map_err(|source| SystemError::Json {
            path: path.to_path_buf(),
            source,
        })
    }

    /// The facets of an entry of `kind` with `data`, read by the paths the
    /// manifest names for that kind. Missing and null fields yield nothing;
    /// numbers, and strings that are numbers, become numbers; booleans
    /// become the words `true` and `false`.
    pub fn facets_for(&self, kind: &str, data: &serde_json::Value) -> BTreeMap<String, FacetValue> {
        let Some(paths) = self.facets.get(kind) else {
            return BTreeMap::new();
        };
        paths
            .iter()
            .filter_map(|(name, path)| facet_at(data, path).map(|value| (name.clone(), value)))
            .collect()
    }
}

fn facet_at(data: &serde_json::Value, path: &str) -> Option<FacetValue> {
    let mut value = data;
    for step in path.split('.') {
        value = value.get(step)?;
    }
    match value {
        serde_json::Value::Number(number) => number.as_f64().map(FacetValue::Number),
        serde_json::Value::String(text) => Some(
            text.trim()
                .parse::<f64>()
                .map_or_else(|_| FacetValue::Text(text.clone()), FacetValue::Number),
        ),
        serde_json::Value::Bool(flag) => Some(FacetValue::Text(flag.to_string())),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest() -> SystemManifest {
        serde_json::from_value(serde_json::json!({
            "id": "5e",
            "name": "5e",
            "facets": {
                "spell": { "level": "level", "school": "school.key", "ritual": "ritual" },
                "monster": { "cr": "challenge_rating", "size": "size.key" }
            }
        }))
        .expect("manifest")
    }

    #[test]
    fn facets_follow_dotted_paths_into_the_data() {
        let facets = manifest().facets_for(
            "spell",
            &serde_json::json!({ "level": 3, "school": { "key": "evocation" }, "ritual": false }),
        );
        assert_eq!(facets.get("level"), Some(&FacetValue::Number(3.0)));
        assert_eq!(
            facets.get("school"),
            Some(&FacetValue::Text("evocation".into()))
        );
        assert_eq!(
            facets.get("ritual"),
            Some(&FacetValue::Text("false".into()))
        );
    }

    #[test]
    fn numeric_strings_become_numbers_and_missing_fields_yield_nothing() {
        let facets = manifest().facets_for(
            "monster",
            &serde_json::json!({ "challenge_rating": "0.25", "size": null }),
        );
        assert_eq!(facets.get("cr"), Some(&FacetValue::Number(0.25)));
        assert!(!facets.contains_key("size"));
        assert!(
            manifest()
                .facets_for("item", &serde_json::json!({}))
                .is_empty()
        );
    }

    #[test]
    fn a_manifest_without_facets_still_loads() {
        let manifest: SystemManifest =
            serde_json::from_str(r#"{"id":"x","name":"X"}"#).expect("manifest");
        assert!(manifest.facets.is_empty());
    }
}
