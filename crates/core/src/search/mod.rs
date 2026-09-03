//! Search over the compendium: the Spotlight-style ranked list of
//! design.md §3. The catalogue is an in-memory copy of every entry's
//! summary, rebuilt from the store when content changes, plus two derived
//! aids that only choose candidates and never change the order: a trigram
//! index for a fresh query, and the previous match set for a query that
//! extends the one before it. Visibility is applied per search, because
//! one DM process answers viewers of different tiers.

mod index;
mod lexer;
mod lexicon;
mod normalize;
mod parse;
mod rank;
mod vocabulary;

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::compendium::{EntryId, EntrySummary, FacetValue, Visibility};
use crate::store::{Store, StoreError};
use crate::system::SystemManifest;
use index::TrigramIndex;
use lexicon::Lexicon;
use rank::Candidate;

pub use normalize::{Compare, Filter, Query, Understood, normalize};
pub use rank::Score;

/// What a search returns: the hits, and what the parser made of the typed
/// text, so the box can show which words it read as filters and which it
/// set aside.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Answer {
    pub hits: Vec<Hit>,
    pub understood: Vec<Understood>,
}

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
    index: TrigramIndex,
    /// The system's words and the values the entries hold, for the parser.
    lexicon: Lexicon,
    /// What the previous search matched in full, so a query that extends
    /// it only rescores those entries.
    last: Mutex<Option<LastSearch>>,
}

struct LastSearch {
    query: Query,
    viewer: Visibility,
    matched: Vec<u32>,
}

// Where a search looks: everything, or a sorted list of candidate ids.
enum Pool {
    All,
    Ids(Vec<u32>),
}

impl Catalogue {
    /// Build a catalogue from entry summaries of any visibility, with no
    /// system words: the operator syntax and plain text still search.
    pub fn new(summaries: impl IntoIterator<Item = EntrySummary>) -> Self {
        Self::with_system(summaries, None)
    }

    /// Build a catalogue that also speaks the system's words.
    pub fn with_system(
        summaries: impl IntoIterator<Item = EntrySummary>,
        system: Option<&SystemManifest>,
    ) -> Self {
        let summaries: Vec<EntrySummary> = summaries.into_iter().collect();
        let lexicon = Lexicon::build(system, &summaries);
        let entries: Vec<(EntrySummary, Candidate)> = summaries
            .into_iter()
            .map(|summary| {
                let candidate = Candidate::new(
                    &summary.name,
                    &summary.kind,
                    &summary.source,
                    &summary.tags,
                    &summary.facets,
                );
                (summary, candidate)
            })
            .collect();
        let index = TrigramIndex::build(entries.iter().enumerate().map(|(id, (_, candidate))| {
            let mut fields = vec![
                candidate.name.as_str(),
                candidate.kind.as_str(),
                candidate.source.as_str(),
            ];
            fields.extend(candidate.tags.iter().map(String::as_str));
            fields.extend(candidate.facets.values().filter_map(|value| match value {
                FacetValue::Text(text) => Some(text.as_str()),
                _ => None,
            }));
            (u32::try_from(id).expect("catalogue fits in u32"), fields)
        }));
        Self {
            entries,
            index,
            lexicon,
            last: Mutex::new(None),
        }
    }

    /// Build a catalogue from everything in `store`, speaking the words of
    /// the system it was seeded for.
    ///
    /// # Errors
    ///
    /// Fails if the store cannot be read.
    pub fn from_store(store: &Store) -> Result<Self, StoreError> {
        let system = store.system()?;
        Ok(Self::with_system(store.summaries()?, system.as_ref()))
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
        self.answer(query, viewer, limit).hits
    }

    /// [`search`](Self::search), with what the parser made of the text.
    pub fn answer(&self, raw: &str, viewer: Visibility, limit: usize) -> Answer {
        let query = self.prepare(raw);
        let understood = query.understood.clone();
        if query.is_empty() {
            return Answer {
                hits: Vec::new(),
                understood,
            };
        }
        let pool = self.pool_for(&query, viewer);
        let (hits, matched) = self.rank(&query, viewer, limit, pool);
        if let Ok(mut last) = self.last.lock() {
            *last = Some(LastSearch {
                query,
                viewer,
                matched,
            });
        }
        Answer { hits, understood }
    }

    // Parse with the system's words, then set aside every token no entry
    // could match: a filler word must not empty the list (rule 2, as the
    // linguistic layer amends it). Single letters say nothing to the index
    // and stay, so a first keystroke still narrows.
    fn prepare(&self, raw: &str) -> Query {
        let mut query = Query::parse_with(raw, &self.lexicon);
        let mut tokens = Vec::with_capacity(query.tokens.len());
        let mut spans = Vec::with_capacity(query.spans.len());
        for (token, span) in query.tokens.iter().zip(&query.spans) {
            let dead = self
                .index
                .candidates(std::slice::from_ref(token))
                .is_some_and(|ids| ids.is_empty());
            if dead {
                query
                    .understood
                    .push(Understood::ignored(span.0 as usize, span.1 as usize));
            } else {
                tokens.push(token.clone());
                spans.push(*span);
            }
        }
        query.tokens = tokens;
        query.spans = spans;
        query
    }

    // The smallest set that is still a superset of the answer: what the index
    // allows, cut down by the previous match set when this query only narrows
    // it; everything only when neither can say anything.
    fn pool_for(&self, query: &Query, viewer: Visibility) -> Pool {
        let indexed = self.index.candidates(&query.tokens);
        if let Ok(last) = self.last.lock()
            && let Some(last) = last.as_ref()
            && last.viewer == viewer
            && query.extends(&last.query)
        {
            return Pool::Ids(match indexed {
                Some(ids) => index::intersect(&last.matched, &ids),
                None => last.matched.clone(),
            });
        }
        match indexed {
            Some(ids) => Pool::Ids(ids),
            None => Pool::All,
        }
    }

    // Scores the pool, keeps every id that matched (in id order, for the next
    // narrowing), and returns the top `limit` in rule 6 order.
    fn rank(
        &self,
        query: &Query,
        viewer: Visibility,
        limit: usize,
        pool: Pool,
    ) -> (Vec<Hit>, Vec<u32>) {
        let mut scored: Vec<(Score, u32)> = Vec::new();
        let mut consider = |id: u32| {
            let (summary, candidate) = &self.entries[id as usize];
            if summary.visibility.is_visible_to(viewer)
                && let Some(score) = rank::score(candidate, query)
            {
                scored.push((score, id));
            }
        };
        match pool {
            Pool::All => (0..self.entries.len()).for_each(|id| consider(id as u32)),
            Pool::Ids(ids) => ids.into_iter().for_each(consider),
        }
        let matched: Vec<u32> = scored.iter().map(|(_, id)| *id).collect();
        // Rule 6: score, then name length, then name, then id as a last resort.
        let by_rule_6 = |a: &(Score, u32), b: &(Score, u32)| {
            let (left, right) = (&self.entries[a.1 as usize], &self.entries[b.1 as usize]);
            a.0.cmp(&b.0)
                .then_with(|| left.1.name_chars.cmp(&right.1.name_chars))
                .then_with(|| left.1.name.cmp(&right.1.name))
                .then_with(|| left.0.id.cmp(&right.0.id))
        };
        // Only the top `limit` need ordering: a broad query matches thousands
        // and shows fifty, so the rest are partitioned off, not sorted.
        if limit == 0 {
            scored.clear();
        } else if scored.len() > limit {
            scored.select_nth_unstable_by(limit - 1, by_rule_6);
            scored.truncate(limit);
        }
        scored.sort_by(by_rule_6);
        let hits = scored
            .into_iter()
            .map(|(score, id)| {
                let summary = &self.entries[id as usize].0;
                Hit {
                    id: summary.id.clone(),
                    kind: summary.kind.clone(),
                    name: summary.name.clone(),
                    source: summary.source.clone(),
                    tags: summary.tags.clone(),
                    rank: score.rank,
                    penalty: score.penalty,
                }
            })
            .collect();
        (hits, matched)
    }

    /// The same search over every entry, with no index and no narrowing:
    /// the reference the aids are checked against.
    #[cfg(test)]
    fn search_scanning(&self, query: &str, viewer: Visibility, limit: usize) -> Vec<Hit> {
        let query = self.prepare(query);
        if query.is_empty() {
            return Vec::new();
        }
        self.rank(&query, viewer, limit, Pool::All).0
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::compendium::FacetValue;

    fn summary(id: &str, kind: &str, name: &str, visibility: Visibility) -> EntrySummary {
        EntrySummary {
            id: EntryId::new(id),
            kind: kind.into(),
            name: name.into(),
            source: "srd-5e".into(),
            tags: Vec::new(),
            visibility,
            facets: BTreeMap::new(),
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

    // A varied catalogue: every kind, tags, and names that share trigrams.
    fn varied() -> Catalogue {
        let stems = [
            "Fire", "Ice", "Storm", "Shadow", "Iron", "Silver", "Wild", "Holy",
        ];
        let nouns = [
            "Bolt", "Wall", "Blade", "Ward", "Hound", "Golem", "Sigil", "Crown",
        ];
        let kinds = ["spell", "monster", "item", "magic-item"];
        let tiers = [Visibility::World, Visibility::Party, Visibility::Dm];
        Catalogue::new((0..256).map(|n| {
            let mut entry = summary(
                &format!("x:{n}"),
                kinds[n % 4],
                &format!("{} {} {}", stems[n % 8], nouns[(n / 8) % 8], n),
                tiers[n % 3],
            );
            entry.tags = vec![stems[(n / 3) % 8].to_lowercase(), format!("cr-{}", n % 5)];
            entry.facets = BTreeMap::from([
                ("level".to_owned(), FacetValue::Number((n % 9) as f64)),
                (
                    "school".to_owned(),
                    FacetValue::Text(stems[(n / 5) % 8].to_owned()),
                ),
            ]);
            entry
        }))
    }

    const QUERIES: &[&str] = &[
        "fire",
        "fire bo",
        "fire bolt",
        "bolt",
        "ol",
        "f",
        "storm hound",
        "type:spell fire",
        "tag:ice",
        "type:monster",
        "silver crown 7",
        "zzz",
        "fir bl",
        "e b",
        "level<=3",
        "school:fire type:spell",
        "level>=4 fire",
        "cr<=1/4",
    ];

    #[test]
    fn facet_filters_narrow_by_the_data_read_at_seed_time() {
        let catalogue = varied();
        let low = catalogue.search("level<=2", Visibility::Dm, 1000);
        assert!(!low.is_empty());
        for hit in &low {
            let n: usize = hit.id.as_str()[2..].parse().expect("synthetic id");
            assert!(n % 9 <= 2, "{} has level {}", hit.name, n % 9);
        }
        let fire = catalogue.search("school:fire", Visibility::Dm, 1000);
        assert!(fire.iter().all(|hit| {
            let n: usize = hit.id.as_str()[2..].parse().expect("synthetic id");
            (n / 5) % 8 == 0
        }));
        assert!(catalogue.search("level<0", Visibility::Dm, 1000).is_empty());
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
                facets: BTreeMap::new(),
            })
            .expect("write");
        let catalogue = Catalogue::from_store(&store).expect("catalogue");
        let hits = catalogue.search("tag:evocation bolt", Visibility::World, DEFAULT_LIMIT);
        assert_eq!(names(&hits), vec!["Fire Bolt"]);
    }

    #[test]
    fn the_index_never_changes_an_answer() {
        let catalogue = varied();
        for viewer in [Visibility::World, Visibility::Party, Visibility::Dm] {
            for query in QUERIES {
                // A fresh catalogue each time, so no narrowing is in play.
                let fresh = varied();
                assert_eq!(
                    fresh.search(query, viewer, DEFAULT_LIMIT),
                    catalogue.search_scanning(query, viewer, DEFAULT_LIMIT),
                    "query {query:?} for {viewer:?}"
                );
            }
        }
    }

    #[test]
    fn narrowing_while_typing_never_changes_an_answer() {
        let typed = varied();
        let reference = varied();
        let keystrokes = [
            "f",
            "fi",
            "fir",
            "fire",
            "fire ",
            "fire b",
            "fire bo",
            "fire bolt",
        ];
        for query in keystrokes {
            assert_eq!(
                typed.search(query, Visibility::Dm, DEFAULT_LIMIT),
                reference.search_scanning(query, Visibility::Dm, DEFAULT_LIMIT),
                "query {query:?}"
            );
        }
        // Backspacing, a new viewer, and a changed filter all start fresh.
        for (query, viewer) in [
            ("fire bo", Visibility::Dm),
            ("fire bo", Visibility::Party),
            ("type:s", Visibility::Party),
            ("type:spell", Visibility::Party),
            ("type:spell fire", Visibility::Party),
        ] {
            assert_eq!(
                typed.search(query, viewer, DEFAULT_LIMIT),
                reference.search_scanning(query, viewer, DEFAULT_LIMIT),
                "query {query:?} for {viewer:?}"
            );
        }
    }

    // Run by hand: cargo test --release -p tablewright-core -- --ignored --nocapture
    #[test]
    #[ignore = "timing report, not an assertion"]
    fn scan_time_for_thirty_thousand_names() {
        let stems = [
            "Fire", "Ice", "Storm", "Shadow", "Iron", "Silver", "Wild", "Holy",
        ];
        let nouns = [
            "Bolt", "Wall", "Blade", "Ward", "Hound", "Golem", "Sigil", "Crown",
        ];
        let many: Vec<EntrySummary> = (0..30_000)
            .map(|n| {
                let mut entry = summary(
                    &format!("x:{n}"),
                    "spell",
                    &format!("{} {} {}", stems[n % 8], nouns[(n / 8) % 8], n),
                    Visibility::World,
                );
                entry.tags = vec!["evocation".into(), format!("level-{}", n % 9)];
                entry
            })
            .collect();
        let built = std::time::Instant::now();
        let catalogue = Catalogue::new(many);
        println!("30000 names: index built in {:?}", built.elapsed());
        let rounds: u32 = 200;
        // `prepare` runs untimed before every timed `run`, to set the state a
        // real keystroke would find.
        let time = |label: &str, prepare: &dyn Fn(), run: &dyn Fn() -> usize| {
            let mut elapsed = std::time::Duration::ZERO;
            let mut hits = 0;
            for _ in 0..rounds {
                prepare();
                let started = std::time::Instant::now();
                hits += run();
                elapsed += started.elapsed();
            }
            println!(
                "  {label}: {:?} per search, {} hits",
                elapsed / rounds,
                hits / rounds as usize
            );
        };
        let world = Visibility::World;
        time("scan, fire bo", &|| {}, &|| {
            catalogue
                .search_scanning("fire bo", world, DEFAULT_LIMIT)
                .len()
        });
        time(
            "fresh, fire bo",
            &|| {
                catalogue.search("zzz", world, DEFAULT_LIMIT);
            },
            &|| catalogue.search("fire bo", world, DEFAULT_LIMIT).len(),
        );
        time(
            "extended, fire b -> fire bo",
            &|| {
                catalogue.search("fire b", world, DEFAULT_LIMIT);
            },
            &|| catalogue.search("fire bo", world, DEFAULT_LIMIT).len(),
        );
        time("scan, fi", &|| {}, &|| {
            catalogue.search_scanning("fi", world, DEFAULT_LIMIT).len()
        });
        time(
            "extended, fi -> fir",
            &|| {
                catalogue.search("fi", world, DEFAULT_LIMIT);
            },
            &|| catalogue.search("fir", world, DEFAULT_LIMIT).len(),
        );
    }
}
