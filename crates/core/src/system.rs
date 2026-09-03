//! A game system's manifest, `systems/<system>/system.json` (design §3
//! "Systems and modules" and "Linguistic search and filters"): the
//! declarative part of a system, as much of it as the core reads.
//!
//! - `categories` and `kinds` name what the box groups and what a kind is
//!   called, and give each kind its default visibility.
//! - `facets` name, per kind, the facts of an entry's `data` that search
//!   may filter on, as dotted paths. The seeder reads them once and stores
//!   the values on each entry, so a query never opens `data`.
//! - `controls` say how the tray shows those facets: which control, in what
//!   order, with which stops. The UI renders whatever is declared.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use thiserror::Error;

use crate::compendium::{FacetValue, Part, Visibility};
use crate::search::normalize;

/// The system manifest.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SystemManifest {
    pub id: String,
    pub name: String,
    /// Category id to label: the tabs of the box, in this order.
    #[serde(default)]
    pub categories: BTreeMap<String, String>,
    /// Entry kind to what it is called and where it is grouped.
    #[serde(default)]
    pub kinds: BTreeMap<String, KindSpec>,
    /// Per kind, facet name to how it is read from `data`.
    #[serde(default)]
    pub facets: BTreeMap<String, BTreeMap<String, FacetSpec>>,
    /// Per kind, the tray's controls in order.
    #[serde(default)]
    pub controls: BTreeMap<String, Vec<ControlSpec>>,
    /// Per kind, the lists in `data` whose items are named parts.
    #[serde(default)]
    pub parts: BTreeMap<String, Vec<PartSpec>>,
}

/// A list inside `data` whose items carry a name: `traits`, `actions`,
/// a class's `features`. Each item becomes a searchable part.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PartSpec {
    /// Dotted path to the list.
    pub path: String,
    /// What the parts are called: "Trait", "Action", "Feature".
    pub label: String,
    /// The item field holding the name.
    #[serde(default = "name_key")]
    pub key: String,
}

fn name_key() -> String {
    "name".into()
}

/// What a kind is called, where the box groups it, which words mean it,
/// and what an entry of it may be seen by unless the entry says otherwise.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct KindSpec {
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub words: Vec<String>,
    #[serde(default)]
    pub visibility: Option<Visibility>,
    #[serde(default)]
    pub data_visibility: Option<Visibility>,
}

/// How one facet is read from an entry's `data`, and the words that name it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FacetSpec {
    /// Dotted path into `data`.
    pub path: String,
    #[serde(rename = "type")]
    pub kind: FacetType,
    /// Words the parser accepts for the facet's name.
    #[serde(default)]
    pub words: Vec<String>,
    /// Words that stand for one value of the facet (`cantrip` for level 0).
    #[serde(default)]
    pub aliases: BTreeMap<String, FacetValue>,
    /// Text facets only: the value is the first of these words found in the
    /// text at `path`, so one string can feed several facets.
    #[serde(default)]
    pub pick: Vec<String>,
    /// Number facets only: words in another field that stand for a number
    /// beyond any real one (a range of sight).
    #[serde(default)]
    pub sentinels: Option<Sentinels>,
    /// Display unit, never stored with the value.
    #[serde(default)]
    pub unit: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum FacetType {
    Number,
    Text,
    Bool,
}

/// Words at `path` that stand for a number.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Sentinels {
    pub path: String,
    pub values: BTreeMap<String, f64>,
}

/// One control of the tray.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ControlSpec {
    pub control: ControlKind,
    pub label: String,
    /// The facet a rail, slider, chips or select edits.
    #[serde(default)]
    pub facet: Option<String>,
    /// The ordered values of a rail, slider or select. Chips take theirs
    /// from the data.
    #[serde(default)]
    pub stops: Vec<Stop>,
    /// The cells of a switch rail, as rows shown side by side. A manifest
    /// may write one flat row.
    #[serde(default, deserialize_with = "cell_rows")]
    #[specta(type = Vec<Vec<Cell>>)]
    pub cells: Vec<Vec<Cell>>,
    /// A control shown beside this one (the switches beside a range slider).
    #[serde(default)]
    pub beside: Option<Box<ControlSpec>>,
}

/// The five controls of the tray. `Rail` paints spans over an ordered
/// scale; `Switch` is the same strip with each cell its own switch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ControlKind {
    Rail,
    Switch,
    Slider,
    Chips,
    Select,
}

/// One value on a rail, slider or select, with the label it shows when
/// the value itself will not do.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct Stop {
    pub value: FacetValue,
    #[serde(default)]
    pub label: Option<String>,
}

// A manifest writes a stop as a bare value or as `{ value, label }`.
impl<'de> Deserialize<'de> for Stop {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Form {
            Bare(FacetValue),
            Labelled {
                value: FacetValue,
                #[serde(default)]
                label: Option<String>,
            },
        }
        Ok(match Form::deserialize(deserializer)? {
            Form::Bare(value) => Self { value, label: None },
            Form::Labelled { value, label } => Self { value, label },
        })
    }
}

/// One cell of a switch rail: the facet and value it stands for. A cell
/// without a value stands for a yes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Cell {
    pub facet: String,
    #[serde(default = "yes")]
    pub value: FacetValue,
    pub label: String,
}

fn yes() -> FacetValue {
    FacetValue::Bool(true)
}

fn cell_rows<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<Vec<Cell>>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Form {
        Flat(Vec<Cell>),
        Rows(Vec<Vec<Cell>>),
    }
    Ok(match Form::deserialize(deserializer)? {
        Form::Flat(row) if row.is_empty() => Vec::new(),
        Form::Flat(row) => vec![row],
        Form::Rows(rows) => rows,
    })
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

    /// The facets of an entry of `kind` with `data`, read by the specs the
    /// manifest declares for that kind. A field that is missing, null, or
    /// not of the facet's type yields nothing.
    pub fn facets_for(&self, kind: &str, data: &serde_json::Value) -> BTreeMap<String, FacetValue> {
        let Some(specs) = self.facets.get(kind) else {
            return BTreeMap::new();
        };
        specs
            .iter()
            .filter_map(|(name, spec)| spec.read(data).map(|value| (name.clone(), value)))
            .collect()
    }

    /// The named parts of an entry of `kind` with `data`, in the order the
    /// manifest lists them and the data holds them.
    pub fn parts_for(&self, kind: &str, data: &serde_json::Value) -> Vec<Part> {
        let Some(specs) = self.parts.get(kind) else {
            return Vec::new();
        };
        let mut parts = Vec::new();
        for spec in specs {
            let Some(items) = at(data, &spec.path).and_then(serde_json::Value::as_array) else {
                continue;
            };
            for item in items {
                if let Some(name) = item.get(&spec.key).and_then(serde_json::Value::as_str)
                    && !name.trim().is_empty()
                {
                    parts.push(Part {
                        label: spec.label.clone(),
                        name: name.trim().to_owned(),
                    });
                }
            }
        }
        parts
    }

    /// What an entry of `kind` may be seen by when the entry does not say:
    /// the kind's defaults, else the world.
    pub fn kind_visibility(&self, kind: &str) -> (Visibility, Visibility) {
        let spec = self.kinds.get(kind);
        (
            spec.and_then(|spec| spec.visibility)
                .unwrap_or(Visibility::World),
            spec.and_then(|spec| spec.data_visibility)
                .unwrap_or(Visibility::World),
        )
    }
}

impl FacetSpec {
    fn read(&self, data: &serde_json::Value) -> Option<FacetValue> {
        match self.kind {
            FacetType::Number => {
                if let Some(sentinels) = &self.sentinels
                    && let Some(text) =
                        at(data, &sentinels.path).and_then(serde_json::Value::as_str)
                    && let Some(number) = sentinels.values.get(&normalize(text))
                {
                    return Some(FacetValue::Number(*number));
                }
                number_of(at(data, &self.path)?)
            }
            FacetType::Text => {
                let text = text_of(at(data, &self.path)?)?;
                if self.pick.is_empty() {
                    return Some(FacetValue::Text(text));
                }
                let normalised = normalize(&text);
                let words: Vec<&str> = normalised
                    .split(|c: char| !c.is_alphanumeric())
                    .filter(|word| !word.is_empty())
                    .collect();
                self.pick
                    .iter()
                    .find(|word| words.contains(&word.as_str()))
                    .map(|word| FacetValue::Text(word.clone()))
            }
            FacetType::Bool => match at(data, &self.path)? {
                serde_json::Value::Bool(flag) => Some(FacetValue::Bool(*flag)),
                serde_json::Value::String(text) => {
                    match text.trim().to_ascii_lowercase().as_str() {
                        "true" | "yes" => Some(FacetValue::Bool(true)),
                        "false" | "no" => Some(FacetValue::Bool(false)),
                        _ => None,
                    }
                }
                _ => None,
            },
        }
    }
}

fn at<'a>(data: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
    let mut value = data;
    for step in path.split('.') {
        value = value.get(step)?;
    }
    (!value.is_null()).then_some(value)
}

fn number_of(value: &serde_json::Value) -> Option<FacetValue> {
    match value {
        serde_json::Value::Number(number) => number.as_f64().map(FacetValue::Number),
        serde_json::Value::String(text) => text.trim().parse().ok().map(FacetValue::Number),
        _ => None,
    }
}

fn text_of(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => Some(text.clone()),
        serde_json::Value::Number(number) => Some(number.to_string()),
        serde_json::Value::Bool(flag) => Some(flag.to_string()),
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
            "categories": { "spells": "Spells", "bestiary": "Bestiary" },
            "kinds": {
                "spell": { "name": "Spell", "category": "spells", "words": ["spell", "spells"] },
                "monster": { "name": "Creature", "category": "bestiary",
                             "visibility": "dm", "data_visibility": "dm" }
            },
            "facets": {
                "spell": {
                    "level": { "path": "level", "type": "number", "aliases": { "cantrip": 0 } },
                    "school": { "path": "school.key", "type": "text" },
                    "ritual": { "path": "ritual", "type": "bool" },
                    "range_kind": { "path": "range_text", "type": "text", "pick": ["self", "touch"] },
                    "range": { "path": "range", "type": "number",
                               "sentinels": { "path": "range_text", "values": { "sight": 1e7 } } }
                },
                "monster": {
                    "cr": { "path": "challenge_rating", "type": "number" },
                    "law": { "path": "alignment", "type": "text", "pick": ["lawful", "chaotic", "neutral"] },
                    "moral": { "path": "alignment", "type": "text", "pick": ["good", "evil", "neutral"] }
                }
            },
            "controls": {
                "spell": [
                    { "control": "rail", "label": "Level", "facet": "level",
                      "stops": [{ "value": 0, "label": "Cantrip" }, 1, 2] },
                    { "control": "switch", "label": "Casting",
                      "cells": [{ "facet": "ritual", "label": "Ritual" }] },
                    { "control": "slider", "label": "Range", "facet": "range", "stops": [5, 30],
                      "beside": { "control": "switch", "label": "",
                                  "cells": [[{ "facet": "range_kind", "value": "self", "label": "Self" }],
                                            [{ "facet": "range_kind", "value": "touch", "label": "Touch" }]] } }
                ]
            }
        }))
        .expect("manifest")
    }

    #[test]
    fn facets_follow_dotted_paths_and_keep_their_types() {
        let facets = manifest().facets_for(
            "spell",
            &serde_json::json!({ "level": 3, "school": { "key": "evocation" }, "ritual": false,
                                 "range": 150, "range_text": "150 feet" }),
        );
        assert_eq!(facets.get("level"), Some(&FacetValue::Number(3.0)));
        assert_eq!(
            facets.get("school"),
            Some(&FacetValue::Text("evocation".into()))
        );
        assert_eq!(facets.get("ritual"), Some(&FacetValue::Bool(false)));
        assert_eq!(facets.get("range"), Some(&FacetValue::Number(150.0)));
        assert!(
            !facets.contains_key("range_kind"),
            "no pick word in a distance"
        );
    }

    #[test]
    fn pick_reads_one_word_out_of_a_longer_text() {
        let facets = manifest().facets_for(
            "monster",
            &serde_json::json!({ "challenge_rating": "0.25", "alignment": "Neutral Evil" }),
        );
        assert_eq!(facets.get("cr"), Some(&FacetValue::Number(0.25)));
        assert_eq!(facets.get("law"), Some(&FacetValue::Text("neutral".into())));
        assert_eq!(facets.get("moral"), Some(&FacetValue::Text("evil".into())));
        let unaligned =
            manifest().facets_for("monster", &serde_json::json!({ "alignment": "unaligned" }));
        assert!(!unaligned.contains_key("law"));
    }

    #[test]
    fn sentinel_words_stand_for_numbers_and_self_and_touch_are_picked() {
        let facets = manifest().facets_for(
            "spell",
            &serde_json::json!({ "range": 0, "range_text": "Sight" }),
        );
        assert_eq!(facets.get("range"), Some(&FacetValue::Number(1e7)));
        let touch = manifest().facets_for(
            "spell",
            &serde_json::json!({ "range": 0, "range_text": "Touch" }),
        );
        assert_eq!(touch.get("range"), Some(&FacetValue::Number(0.0)));
        assert_eq!(
            touch.get("range_kind"),
            Some(&FacetValue::Text("touch".into()))
        );
    }

    #[test]
    fn parts_are_read_from_the_named_lists() {
        let manifest: SystemManifest = serde_json::from_value(serde_json::json!({
            "id": "5e", "name": "5e",
            "parts": { "monster": [
                { "path": "traits", "label": "Trait" },
                { "path": "actions", "label": "Action" }
            ] }
        }))
        .expect("manifest");
        let parts = manifest.parts_for(
            "monster",
            &serde_json::json!({
                "traits": [{ "name": "Pack Tactics", "desc": "..." }, { "name": " " }],
                "actions": [{ "name": "Scimitar" }, { "desc": "no name" }]
            }),
        );
        let names: Vec<(&str, &str)> = parts
            .iter()
            .map(|part| (part.label.as_str(), part.name.as_str()))
            .collect();
        assert_eq!(
            names,
            vec![("Trait", "Pack Tactics"), ("Action", "Scimitar")]
        );
        assert!(
            manifest
                .parts_for("spell", &serde_json::json!({}))
                .is_empty()
        );
    }

    #[test]
    fn kinds_give_the_default_visibility() {
        let manifest = manifest();
        assert_eq!(
            manifest.kind_visibility("monster"),
            (Visibility::Dm, Visibility::Dm)
        );
        assert_eq!(
            manifest.kind_visibility("spell"),
            (Visibility::World, Visibility::World)
        );
        assert_eq!(
            manifest.kind_visibility("lore"),
            (Visibility::World, Visibility::World)
        );
    }

    #[test]
    fn stops_and_cells_take_both_forms() {
        let manifest = manifest();
        let controls = &manifest.controls["spell"];
        assert_eq!(controls[0].stops[0].label.as_deref(), Some("Cantrip"));
        assert_eq!(controls[0].stops[1].value, FacetValue::Number(1.0));
        assert_eq!(controls[0].stops[1].label, None);
        assert_eq!(
            controls[1].cells,
            vec![vec![Cell {
                facet: "ritual".into(),
                value: FacetValue::Bool(true),
                label: "Ritual".into(),
            }]]
        );
        let beside = controls[2]
            .beside
            .as_ref()
            .expect("switches beside the slider");
        assert_eq!(beside.control, ControlKind::Switch);
        assert_eq!(beside.cells.len(), 2);
        assert_eq!(beside.cells[1][0].value, FacetValue::Text("touch".into()));
        let json = serde_json::to_string(&manifest).expect("json");
        let again: SystemManifest = serde_json::from_str(&json).expect("round trip");
        assert_eq!(again, manifest);
    }

    #[test]
    fn a_manifest_without_facets_still_loads() {
        let manifest: SystemManifest =
            serde_json::from_str(r#"{"id":"x","name":"X"}"#).expect("manifest");
        assert!(manifest.facets.is_empty());
        assert!(
            manifest
                .facets_for("spell", &serde_json::json!({}))
                .is_empty()
        );
    }
}
