//! What the words of a query can mean in this system: the kind nouns and
//! facet names the manifest declares, and the values the catalogue holds
//! (design §3 "Linguistic search and filters"). Built with the catalogue,
//! so "evocation" is a school because the data has one. Phrases are keyed
//! by their stemmed words, so "wands" finds the value "wand".

use std::collections::{BTreeSet, HashMap};

use rust_stemmers::{Algorithm, Stemmer};

use super::normalize::normalize;
use crate::compendium::{EntrySummary, FacetValue};
use crate::system::{ControlSpec, SystemManifest};

/// What a phrase means. A phrase may mean several things ("neutral" is a
/// value on both alignment axes); the parser keeps every reading.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Meaning {
    /// A kind noun: the kinds of the category it names.
    Kinds(Vec<String>),
    /// A facet's name.
    Facet(String),
    /// One value of a facet, as the filter compares it. A value the system
    /// declared by word (an alias, a yes/no fact) is `sure`: it means the
    /// facet wherever it appears. A value found in the data is not: it may
    /// be part of a name, so it filters only once its kind is in play.
    Value {
        facet: String,
        value: String,
        sure: bool,
    },
}

/// The system's words.
#[derive(Debug, Default)]
pub struct Lexicon {
    phrases: HashMap<Vec<String>, Vec<Meaning>>,
    max_words: usize,
    /// Facet name to the kinds that carry it.
    facet_kinds: HashMap<String, Vec<String>>,
    /// Kind to its category.
    kind_category: HashMap<String, String>,
    /// Text facets with an order, from the controls' stops: facet name to
    /// its values in order.
    ordered: HashMap<String, Vec<String>>,
    /// Facet name to every text value the catalogue holds for it.
    values: HashMap<String, BTreeSet<String>>,
}

impl Lexicon {
    /// A lexicon that knows no words: the operator syntax still works.
    pub fn empty() -> Self {
        Self::default()
    }

    /// The words of `system` and the values found in `summaries`.
    pub fn build<'a>(
        system: Option<&SystemManifest>,
        summaries: impl IntoIterator<Item = &'a EntrySummary>,
    ) -> Self {
        let mut lexicon = Self::default();
        if let Some(system) = system {
            let mut category_kinds: HashMap<&str, Vec<String>> = HashMap::new();
            for (kind, spec) in &system.kinds {
                category_kinds
                    .entry(spec.category.as_str())
                    .or_default()
                    .push(kind.clone());
                lexicon
                    .kind_category
                    .insert(kind.clone(), spec.category.clone());
            }
            for spec in system.kinds.values() {
                let kinds = category_kinds[spec.category.as_str()].clone();
                for word in &spec.words {
                    lexicon.add(word, Meaning::Kinds(kinds.clone()));
                }
            }
            for (kind, facets) in &system.facets {
                for (name, spec) in facets {
                    lexicon
                        .facet_kinds
                        .entry(name.clone())
                        .or_default()
                        .push(kind.clone());
                    for word in &spec.words {
                        let meaning = match spec.kind {
                            crate::system::FacetType::Bool => Meaning::Value {
                                facet: name.clone(),
                                value: "true".into(),
                                sure: true,
                            },
                            _ => Meaning::Facet(name.clone()),
                        };
                        lexicon.add(word, meaning);
                    }
                    for (word, value) in &spec.aliases {
                        lexicon.add(
                            word,
                            Meaning::Value {
                                facet: name.clone(),
                                value: filter_text(value),
                                sure: true,
                            },
                        );
                    }
                }
            }
            for controls in system.controls.values() {
                for control in controls {
                    lexicon.note_order(control);
                }
            }
        }
        let mut seen: BTreeSet<(String, String)> = BTreeSet::new();
        for summary in summaries {
            for (facet, value) in &summary.facets {
                if let FacetValue::Text(text) = value {
                    let text = normalize(text);
                    if seen.insert((facet.clone(), text.clone())) {
                        lexicon
                            .values
                            .entry(facet.clone())
                            .or_default()
                            .insert(text.clone());
                        lexicon.add(
                            &text,
                            Meaning::Value {
                                facet: facet.clone(),
                                value: text.clone(),
                                sure: false,
                            },
                        );
                    }
                }
            }
        }
        lexicon
    }

    fn note_order(&mut self, control: &ControlSpec) {
        if let Some(facet) = &control.facet {
            let values: Vec<String> = control
                .stops
                .iter()
                .filter_map(|stop| match &stop.value {
                    FacetValue::Text(text) => Some(normalize(text)),
                    _ => None,
                })
                .collect();
            if !values.is_empty() {
                self.ordered.insert(facet.clone(), values);
            }
        }
        if let Some(beside) = &control.beside {
            self.note_order(beside);
        }
    }

    fn add(&mut self, phrase: &str, meaning: Meaning) {
        let key = stems(phrase);
        if key.is_empty() {
            return;
        }
        self.max_words = self.max_words.max(key.len());
        let meanings = self.phrases.entry(key).or_default();
        if !meanings.contains(&meaning) {
            meanings.push(meaning);
        }
    }

    /// The meanings of a run of stemmed words, if the system has any.
    pub fn lookup(&self, words: &[String]) -> Option<&[Meaning]> {
        self.phrases.get(words).map(Vec::as_slice)
    }

    /// The longest phrase, in words.
    pub fn max_words(&self) -> usize {
        self.max_words
    }

    /// The kinds that carry `facet`.
    pub fn kinds_with(&self, facet: &str) -> &[String] {
        self.facet_kinds.get(facet).map_or(&[], Vec::as_slice)
    }

    /// The category `kind` belongs to.
    pub fn category_of(&self, kind: &str) -> Option<&str> {
        self.kind_category.get(kind).map(String::as_str)
    }

    /// Every text value the catalogue holds, per facet, sorted: what the
    /// tray offers as chips.
    pub fn values(&self) -> std::collections::BTreeMap<String, Vec<String>> {
        self.values
            .iter()
            .map(|(facet, values)| (facet.clone(), values.iter().cloned().collect()))
            .collect()
    }

    /// The values of `facet` in order, when the system gave it one.
    pub fn ordered_values(&self, facet: &str) -> Option<&[String]> {
        self.ordered.get(facet).map(Vec::as_slice)
    }
}

/// A facet value as a filter compares it: numbers and booleans as text.
pub fn filter_text(value: &FacetValue) -> String {
    match value {
        FacetValue::Number(number) => number.to_string(),
        FacetValue::Text(text) => normalize(text),
        FacetValue::Bool(flag) => flag.to_string(),
    }
}

/// The stemmed words of a phrase: normalised, split on anything that is
/// not a letter or digit, each word reduced to its stem.
pub fn stems(phrase: &str) -> Vec<String> {
    let normalised = normalize(phrase);
    normalised
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(stem)
        .collect()
}

/// One word's stem. Numbers stem to themselves.
pub fn stem(word: &str) -> String {
    if word.chars().all(|c| c.is_ascii_digit()) {
        return word.to_owned();
    }
    Stemmer::create(Algorithm::English).stem(word).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compendium::{EntryId, Visibility};
    use std::collections::BTreeMap;

    fn system() -> SystemManifest {
        serde_json::from_value(serde_json::json!({
            "id": "5e", "name": "5e",
            "categories": { "spells": "Spells", "items": "Items" },
            "kinds": {
                "spell": { "name": "Spell", "category": "spells", "words": ["spell", "spells"] },
                "item": { "name": "Item", "category": "items", "words": ["item", "items"] },
                "magic-item": { "name": "Magic item", "category": "items", "words": ["magic item"] }
            },
            "facets": {
                "spell": {
                    "level": { "path": "level", "type": "number", "words": ["level"], "aliases": { "cantrip": 0 } },
                    "ritual": { "path": "ritual", "type": "bool", "words": ["ritual"] },
                    "school": { "path": "school.key", "type": "text", "words": ["school"] }
                },
                "magic-item": {
                    "rarity": { "path": "rarity.key", "type": "text" }
                }
            },
            "controls": {
                "magic-item": [
                    { "control": "rail", "label": "Rarity", "facet": "rarity",
                      "stops": ["common", "uncommon", "rare", { "value": "very-rare", "label": "Very rare" }] }
                ]
            }
        }))
        .expect("system")
    }

    fn summary(kind: &str, facets: &[(&str, &str)]) -> EntrySummary {
        EntrySummary {
            id: EntryId::new(format!("t:{kind}:{}", facets.len())),
            kind: kind.into(),
            name: "Thing".into(),
            source: "t".into(),
            version: String::new(),
            tags: Vec::new(),
            visibility: Visibility::World,
            facets: facets
                .iter()
                .map(|(name, value)| ((*name).to_owned(), FacetValue::Text((*value).to_owned())))
                .collect::<BTreeMap<_, _>>(),
            parts: Vec::new(),
        }
    }

    #[test]
    fn stems_fold_plurals_and_keep_numbers() {
        assert_eq!(stems("Wands"), vec!["wand"]);
        assert_eq!(stems("very-rare"), stems("Very Rare"));
        assert_eq!(stems("level 3"), vec!["level", "3"]);
        assert_eq!(stems("creatures"), stems("creature"));
        assert!(stems("  ").is_empty());
    }

    #[test]
    fn kind_nouns_name_their_whole_category() {
        let lexicon = Lexicon::build(Some(&system()), &[]);
        let items = Meaning::Kinds(vec!["item".into(), "magic-item".into()]);
        assert_eq!(lexicon.lookup(&stems("items")), Some(&[items.clone()][..]));
        assert_eq!(lexicon.lookup(&stems("magic items")), Some(&[items][..]));
        assert_eq!(
            lexicon.lookup(&stems("spell")),
            Some(&[Meaning::Kinds(vec!["spell".into()])][..])
        );
        assert_eq!(lexicon.category_of("magic-item"), Some("items"));
    }

    #[test]
    fn facet_words_aliases_and_data_values_are_all_phrases() {
        let entries = [
            summary("spell", &[("school", "Evocation")]),
            summary("magic-item", &[("rarity", "very-rare")]),
        ];
        let lexicon = Lexicon::build(Some(&system()), &entries);
        assert_eq!(
            lexicon.lookup(&stems("level")),
            Some(&[Meaning::Facet("level".into())][..])
        );
        let value = |facet: &str, value: &str, sure: bool| Meaning::Value {
            facet: facet.into(),
            value: value.into(),
            sure,
        };
        assert_eq!(
            lexicon.lookup(&stems("cantrips")),
            Some(&[value("level", "0", true)][..])
        );
        assert_eq!(
            lexicon.lookup(&stems("ritual")),
            Some(&[value("ritual", "true", true)][..])
        );
        assert_eq!(
            lexicon.lookup(&stems("evocation")),
            Some(&[value("school", "evocation", false)][..])
        );
        assert_eq!(
            lexicon.lookup(&stems("very rare")),
            Some(&[value("rarity", "very-rare", false)][..])
        );
        assert_eq!(lexicon.kinds_with("school"), ["spell"]);
        assert_eq!(
            lexicon.ordered_values("rarity"),
            Some(
                &[
                    "common".to_owned(),
                    "uncommon".into(),
                    "rare".into(),
                    "very-rare".into()
                ][..]
            )
        );
        assert!(lexicon.max_words() >= 2);
        assert!(Lexicon::empty().lookup(&stems("level")).is_none());
    }
}
