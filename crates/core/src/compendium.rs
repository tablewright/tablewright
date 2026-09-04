//! The compendium envelope: what every entry shares whatever game system
//! filled it in. Search, browse, links, and sync depend only on this;
//! the per-system statblock rides along as an opaque JSON `data` blob.
//! Design: docs/design.md §3.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// Stable identifier of an entry; links never break because ids never change.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct EntryId(pub String);

impl EntryId {
    /// Wrap an id string.
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// The id as text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for EntryId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Who may see something. Ordered from most open to most restricted, so a
/// viewer sees everything at or below their own tier.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type,
)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    /// Anyone, including a player who has never met the thing.
    World = 0,
    /// The party: players at the table.
    Party = 1,
    /// The DM only.
    Dm = 2,
}

impl Visibility {
    /// Whether something at this tier may be shown to a viewer of `viewer` tier.
    pub fn is_visible_to(self, viewer: Visibility) -> bool {
        self <= viewer
    }

    /// The tier's storage code, stable across versions.
    pub fn code(self) -> i64 {
        self as i64
    }

    /// The tier for a storage code.
    pub fn from_code(code: i64) -> Option<Self> {
        match code {
            0 => Some(Self::World),
            1 => Some(Self::Party),
            2 => Some(Self::Dm),
            _ => None,
        }
    }
}

/// The TypeScript shape of `serde_json::Value`, used only as a type witness
/// through `#[specta(type = JsonValue)]`; the fields themselves stay
/// `serde_json::Value`. The exporter refuses the 64-bit integers inside
/// `serde_json::Number` because JavaScript would truncate them; JSON numbers
/// are JavaScript numbers on that side whatever we say, so this names that
/// truth once. JSON `null` needs no variant: specta renders an untagged enum
/// with `null` in its union.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum JsonValue {
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<JsonValue>),
    Object(std::collections::HashMap<String, JsonValue>),
}

/// One compendium entry: the system-agnostic envelope plus the system's data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Entry {
    pub id: EntryId,
    /// The entry's category within its system: `monster`, `spell`, `item`, and so on.
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    /// Provenance: the book, module, or homebrew collection the entry came from.
    pub source: String,
    pub tags: Vec<String>,
    /// Who may see the entry at all: its name, tags, and body.
    pub visibility: Visibility,
    /// Who may see `data`. A monster can be known by name while its statblock stays DM-only.
    pub data_visibility: Visibility,
    /// Prose body, markdown.
    pub body: String,
    /// The body as HTML, rendered by the core's one renderer as the entry
    /// leaves the store (`render`). Empty on the way in and never stored:
    /// the markdown is the record, the HTML is derived from it.
    #[serde(default)]
    pub html: String,
    /// The per-system structured blob; its schema belongs to the game system, not the envelope.
    #[specta(type = JsonValue)]
    pub data: serde_json::Value,
    /// Filterable facts read from `data` by the system manifest at seed time.
    #[serde(default)]
    pub facets: BTreeMap<String, FacetValue>,
    /// Named parts of `data` read by the system manifest at seed time, so
    /// search can find an entry by a trait, an action, or a feature.
    #[serde(default)]
    pub parts: Vec<Part>,
}

impl Entry {
    /// The entry as a viewer of `viewer` tier may see it, or `None` when they may not see it
    /// at all. Data the viewer may not see is replaced by JSON `null`.
    pub fn as_seen_by(&self, viewer: Visibility) -> Option<Entry> {
        if !self.visibility.is_visible_to(viewer) {
            return None;
        }
        let mut seen = self.clone();
        if !self.data_visibility.is_visible_to(viewer) {
            seen.data = serde_json::Value::Null;
        }
        Some(seen)
    }

    /// The entry without its body and data: what lists and search carry.
    pub fn summary(&self) -> EntrySummary {
        EntrySummary {
            id: self.id.clone(),
            kind: self.kind.clone(),
            name: self.name.clone(),
            source: self.source.clone(),
            tags: self.tags.clone(),
            visibility: self.visibility,
            facets: self.facets.clone(),
            parts: self.parts.clone(),
        }
    }
}

/// A named part of an entry's data: a creature's trait or action, a
/// class's feature. The manifest names the lists that carry them, the
/// seeder stores their names, and search matches them as a field, so
/// "pack tactics" finds its bearers and the tile can say which part hit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Part {
    /// What kind of part, as the system calls it: "Trait", "Action".
    pub label: String,
    pub name: String,
}

/// A facet: one filterable fact about an entry, read from its data by the
/// system's manifest at seed time (`level`, `school`, `cr`, `ritual`), so
/// search can answer `level<=3` without opening the data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum FacetValue {
    Number(f64),
    Text(String),
    Bool(bool),
}

/// The envelope fields that identify and classify an entry, without the
/// body or the system data. Search ranks over these.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct EntrySummary {
    pub id: EntryId,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub source: String,
    pub tags: Vec<String>,
    pub visibility: Visibility,
    #[serde(default)]
    pub facets: BTreeMap<String, FacetValue>,
    /// Named parts of `data` read by the system manifest at seed time, so
    /// search can find an entry by a trait, an action, or a feature.
    #[serde(default)]
    pub parts: Vec<Part>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn goblin() -> Entry {
        Entry {
            id: EntryId::new("srd:monster:goblin"),
            kind: "monster".into(),
            name: "Goblin".into(),
            source: "srd-5e".into(),
            tags: vec!["humanoid".into(), "small".into()],
            visibility: Visibility::Party,
            data_visibility: Visibility::Dm,
            body: "A small, black-hearted humanoid.".into(),
            html: String::new(),
            data: serde_json::json!({ "armor_class": 15, "hit_points": 7 }),
            facets: BTreeMap::new(),
            parts: Vec::new(),
        }
    }

    #[test]
    fn a_viewer_sees_tiers_at_or_below_their_own() {
        assert!(Visibility::World.is_visible_to(Visibility::World));
        assert!(Visibility::Party.is_visible_to(Visibility::Dm));
        assert!(!Visibility::Dm.is_visible_to(Visibility::Party));
        assert!(!Visibility::Party.is_visible_to(Visibility::World));
    }

    #[test]
    fn storage_codes_round_trip() {
        for tier in [Visibility::World, Visibility::Party, Visibility::Dm] {
            assert_eq!(Visibility::from_code(tier.code()), Some(tier));
        }
        assert_eq!(Visibility::from_code(7), None);
    }

    #[test]
    fn the_party_knows_the_goblin_but_not_its_statblock() {
        let seen = goblin()
            .as_seen_by(Visibility::Party)
            .expect("party may see the goblin");
        assert_eq!(seen.name, "Goblin");
        assert_eq!(seen.data, serde_json::Value::Null);
    }

    #[test]
    fn the_dm_sees_everything_and_the_world_sees_nothing_of_it() {
        let dm = goblin().as_seen_by(Visibility::Dm).expect("dm sees all");
        assert_eq!(dm.data["armor_class"], 15);
        assert!(goblin().as_seen_by(Visibility::World).is_none());
    }

    #[test]
    fn the_envelope_serialises_with_the_design_vocabulary() {
        let json = serde_json::to_value(goblin()).expect("serialises");
        assert_eq!(json["type"], "monster");
        assert_eq!(json["visibility"], "party");
        assert_eq!(json["data_visibility"], "dm");
        assert_eq!(json["id"], "srd:monster:goblin");
    }
}
