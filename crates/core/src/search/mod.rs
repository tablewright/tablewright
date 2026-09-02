//! Search over the compendium: the Spotlight-style ranked list of
//! design.md §3. The catalogue is an in-memory copy of every entry's
//! summary, rebuilt from the store when content changes; a few thousand
//! names scan in microseconds, so there is no index to keep in step.
//! Visibility is applied per search, because one DM process answers
//! viewers of different tiers.

mod normalize;
mod rank;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::compendium::{EntryId, EntrySummary, Visibility};
use crate::store::{Store, StoreError};
use rank::Candidate;

pub use normalize::{Filter, Query, normalize};
pub use rank::Score;

/// Rule 6: the longest list a search returns.
pub const DEFAULT_LIMIT: usize = 50;

/// One row of a search result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Hit {
    pub id: EntryId,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub source: String,
    pub tags: Vec<String>,
    /// Rule 3 rungs less the rule 5 bonus; lower is better. Comparable only
    /// within one result list.
    pub rank: i32,
    /// Rule 4 penalties; lower is better.
    pub penalty: u32,
}

/// Every searchable entry, normalised once.
pub struct Catalogue {
    entries: Vec<(EntrySummary, Candidate)>,
}

impl Catalogue {
    /// Build a catalogue from entry summaries of any visibility.
    pub fn new(summaries: impl IntoIterator<Item = EntrySummary>) -> Self {
        let entries = summaries
            .into_iter()
            .map(|summary| {
                let candidate =
                    Candidate::new(&summary.name, &summary.kind, &summary.source, &summary.tags);
                (summary, candidate)
            })
            .collect();
        Self { entries }
    }

    /// Build a catalogue from everything in `store`.
    ///
    /// # Errors
    ///
    /// Fails if the store cannot be read.
    pub fn from_store(store: &Store) -> Result<Self, StoreError> {
        Ok(Self::new(store.summaries()?))
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Rank every entry `viewer` may see against `query` and return at most
    /// `limit` hits. An empty query finds nothing; a query of only filters
    /// lists everything that passes them.
    pub fn search(&self, query: &str, viewer: Visibility, limit: usize) -> Vec<Hit> {
        let query = Query::parse(query);
        if query.is_empty() {
            return Vec::new();
        }
        let mut hits: Vec<(Score, &EntrySummary, &Candidate)> = self
            .entries
            .iter()
            .filter(|(summary, _)| summary.visibility.is_visible_to(viewer))
            .filter_map(|(summary, candidate)| {
                rank::score(candidate, &query).map(|score| (score, summary, candidate))
            })
            .collect();
        // Rule 6: score, then name length, then name, then id as a last resort.
        hits.sort_by(|a, b| {
            a.0.cmp(&b.0)
                .then_with(|| a.2.name_chars.cmp(&b.2.name_chars))
                .then_with(|| a.2.name.cmp(&b.2.name))
                .then_with(|| a.1.id.cmp(&b.1.id))
        });
        hits.truncate(limit);
        hits.into_iter()
            .map(|(score, summary, _)| Hit {
                id: summary.id.clone(),
                kind: summary.kind.clone(),
                name: summary.name.clone(),
                source: summary.source.clone(),
                tags: summary.tags.clone(),
                rank: score.rank,
                penalty: score.penalty,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary(id: &str, kind: &str, name: &str, visibility: Visibility) -> EntrySummary {
        EntrySummary {
            id: EntryId::new(id),
            kind: kind.into(),
            name: name.into(),
            source: "srd-5e".into(),
            tags: Vec::new(),
            visibility,
        }
    }

    fn spells(names: &[&str]) -> Catalogue {
        Catalogue::new(names.iter().map(|name| {
            summary(
                &format!("s:{}", normalize(name).replace(' ', "-")),
                "spell",
                name,
                Visibility::World,
            )
        }))
    }

    fn names(hits: &[Hit]) -> Vec<&str> {
        hits.iter().map(|hit| hit.name.as_str()).collect()
    }

    #[test]
    fn rule_6_orders_by_score_then_name_length_then_name() {
        let catalogue = spells(&["Arrow", "Arm", "Ar", "Arc", "Bar"]);
        let hits = catalogue.search("ar", Visibility::World, DEFAULT_LIMIT);
        assert_eq!(names(&hits), vec!["Ar", "Arc", "Arm", "Arrow", "Bar"]);
    }

    #[test]
    fn rule_6_breaks_identical_names_by_id_and_caps_the_list() {
        let catalogue = Catalogue::new([
            summary("b:arc", "spell", "Arc", Visibility::World),
            summary("a:arc", "item", "Arc", Visibility::World),
        ]);
        let hits = catalogue.search("arc", Visibility::World, DEFAULT_LIMIT);
        let ids: Vec<&str> = hits.iter().map(|hit| hit.id.as_str()).collect();
        assert_eq!(ids, vec!["a:arc", "b:arc"]);
        assert_eq!(hits[0].kind, "item", "each row carries its type badge");

        let many: Vec<String> = (1..=60).map(|n| format!("Arrow {n}")).collect();
        let refs: Vec<&str> = many.iter().map(String::as_str).collect();
        let hits = spells(&refs).search("arrow", Visibility::World, DEFAULT_LIMIT);
        assert_eq!(hits.len(), 50);
    }

    #[test]
    fn a_viewer_only_finds_what_their_tier_may_see() {
        let catalogue = Catalogue::new([
            summary("m:goblin", "monster", "Goblin", Visibility::Party),
            summary("m:lich", "monster", "Lich", Visibility::Dm),
            summary("m:owl", "monster", "Owl", Visibility::World),
        ]);
        let all =
            |viewer| names(&catalogue.search("type:monster", viewer, DEFAULT_LIMIT)).join(",");
        assert_eq!(all(Visibility::World), "Owl");
        assert_eq!(all(Visibility::Party), "Owl,Goblin");
        assert_eq!(all(Visibility::Dm), "Owl,Lich,Goblin");
    }

    #[test]
    fn an_empty_query_finds_nothing_and_a_filter_alone_lists_its_kind() {
        let catalogue = Catalogue::new([
            summary("s:fire-bolt", "spell", "Fire Bolt", Visibility::World),
            summary("m:goblin", "monster", "Goblin", Visibility::World),
        ]);
        assert!(
            catalogue
                .search("   ", Visibility::Dm, DEFAULT_LIMIT)
                .is_empty()
        );
        let spells = catalogue.search("type:spell", Visibility::Dm, DEFAULT_LIMIT);
        assert_eq!(names(&spells), vec!["Fire Bolt"]);
        assert_eq!(catalogue.len(), 2);
    }

    #[test]
    fn the_catalogue_reads_from_a_store() {
        let store = Store::open_in_memory().expect("store");
        store
            .upsert(&crate::compendium::Entry {
                id: EntryId::new("s:fire-bolt"),
                kind: "spell".into(),
                name: "Fire Bolt".into(),
                source: "srd-5e".into(),
                tags: vec!["evocation".into()],
                visibility: Visibility::World,
                data_visibility: Visibility::World,
                body: String::new(),
                data: serde_json::Value::Null,
            })
            .expect("write");
        let catalogue = Catalogue::from_store(&store).expect("catalogue");
        let hits = catalogue.search("tag:evocation bolt", Visibility::World, DEFAULT_LIMIT);
        assert_eq!(names(&hits), vec!["Fire Bolt"]);
    }

    // Run by hand: cargo test -p tablewright-core -- --ignored --nocapture
    #[test]
    #[ignore = "timing report, not an assertion"]
    fn scan_time_for_five_thousand_names() {
        let stems = [
            "Fire", "Ice", "Storm", "Shadow", "Iron", "Silver", "Wild", "Holy",
        ];
        let nouns = [
            "Bolt", "Wall", "Blade", "Ward", "Hound", "Golem", "Sigil", "Crown",
        ];
        let many: Vec<EntrySummary> = (0..5000)
            .map(|n| {
                let name = format!("{} {} {}", stems[n % 8], nouns[(n / 8) % 8], n);
                summary(&format!("x:{n}"), "spell", &name, Visibility::World)
            })
            .collect();
        let catalogue = Catalogue::new(many);
        let started = std::time::Instant::now();
        let rounds = 200;
        let mut found = 0;
        for _ in 0..rounds {
            found += catalogue
                .search("fire bo", Visibility::World, DEFAULT_LIMIT)
                .len();
        }
        let per_search = started.elapsed() / rounds;
        println!(
            "5000 names, query 'fire bo': {per_search:?} per search, {} hits",
            found / rounds as usize
        );
    }
}
