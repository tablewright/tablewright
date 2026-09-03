//! Rules 2 to 5 of the search rules (design.md §3): how one candidate scores
//! against a parsed query. Pure functions over normalised text; the catalogue
//! in `super` decides who is a candidate and orders the result (rule 6).

use std::collections::BTreeMap;

use super::normalize::{Compare, Filter, Query, normalize};
use crate::compendium::FacetValue;

/// A pre-normalised entry, ready to be scored against many queries.
#[derive(Debug, Clone)]
pub struct Candidate {
    pub name: String,
    /// The name's length in chars, for rule 4 and the rule 6 tie-break.
    pub name_chars: u32,
    /// The name split into words, for rule 5.
    pub words: Vec<String>,
    pub kind: String,
    pub source: String,
    pub tags: Vec<String>,
    /// Text facets are normalised; numbers stay numbers.
    pub facets: BTreeMap<String, FacetValue>,
}

impl Candidate {
    pub fn new(
        name: &str,
        kind: &str,
        source: &str,
        tags: &[String],
        facets: &BTreeMap<String, FacetValue>,
    ) -> Self {
        let name = normalize(name);
        let words = name
            .split(|c: char| !c.is_alphanumeric())
            .filter(|word| !word.is_empty())
            .map(str::to_owned)
            .collect();
        Self {
            name_chars: count_chars(&name),
            words,
            name,
            kind: normalize(kind),
            source: normalize(source),
            tags: tags.iter().map(|tag| normalize(tag)).collect(),
            facets: facets
                .iter()
                .map(|(name, value)| {
                    let value = match value {
                        FacetValue::Text(text) => FacetValue::Text(normalize(text)),
                        other => other.clone(),
                    };
                    (name.clone(), value)
                })
                .collect(),
        }
    }
}

/// A candidate's score. `rank` carries the rule 3 rungs less the rule 5
/// bonus; `penalty` carries the rule 4 separators. The pair orders
/// lexicographically, so no number of penalties can overturn a rung.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Score {
    pub rank: i32,
    pub penalty: u32,
}

/// Rule 3: rungs a tag match sits above a name match.
const TAG_RUNGS: i32 = 4;
/// Rule 3: rungs a type or source match sits above a name match.
const TYPE_SOURCE_RUNGS: i32 = 8;
/// Rule 5: rungs earned per pair of tokens that reads as a phrase in the name.
const PHRASE_BONUS: i32 = 1;

/// Score `candidate` against `query`, or `None` when it fails a filter
/// (rule 1) or leaves a token unmatched (rule 2).
pub fn score(candidate: &Candidate, query: &Query) -> Option<Score> {
    if !passes_filters(candidate, &query.filters) {
        return None;
    }
    let mut rank = 0;
    let mut penalty = 0;
    for token in &query.tokens {
        let hit = best_hit(candidate, token)?;
        rank += hit.rank;
        penalty += hit.offset;
    }
    rank -= phrase_pairs(&candidate.words, &query.tokens) * PHRASE_BONUS;
    let query_chars = u32::try_from(query.scoring_len()).unwrap_or(u32::MAX);
    penalty += candidate.name_chars.saturating_sub(query_chars);
    Some(Score { rank, penalty })
}

fn passes_filters(candidate: &Candidate, filters: &[Filter]) -> bool {
    filters.iter().all(|filter| match filter {
        Filter::Kind(value) => candidate.kind == *value,
        Filter::Source(value) => candidate.source == *value,
        Filter::Tag(value) => candidate.tags.iter().any(|tag| tag == value),
        Filter::Facet {
            name,
            compare,
            value,
        } => candidate
            .facets
            .get(name)
            .is_some_and(|facet| facet_passes(facet, *compare, value)),
    })
}

// A number compares as a number, against `3`, `0.25` or `1/4` alike; text
// only ever compares equal. An entry without the facet never passes.
fn facet_passes(facet: &FacetValue, compare: Compare, value: &str) -> bool {
    match facet {
        FacetValue::Number(have) => number(value).is_some_and(|want| match compare {
            Compare::Eq => (have - want).abs() < f64::EPSILON,
            Compare::Lt => *have < want,
            Compare::Le => *have <= want,
            Compare::Gt => *have > want,
            Compare::Ge => *have >= want,
        }),
        FacetValue::Text(have) => compare == Compare::Eq && have == value,
        FacetValue::Bool(have) => compare == Compare::Eq && truth(value) == Some(*have),
    }
}

fn truth(value: &str) -> Option<bool> {
    match value {
        "true" | "yes" | "1" => Some(true),
        "false" | "no" | "0" => Some(false),
        _ => None,
    }
}

fn number(value: &str) -> Option<f64> {
    if let Some((numerator, denominator)) = value.split_once('/') {
        let (numerator, denominator) = (
            numerator.parse::<f64>().ok()?,
            denominator.parse::<f64>().ok()?,
        );
        return (denominator != 0.0).then(|| numerator / denominator);
    }
    value.parse().ok()
}

struct Hit {
    rank: i32,
    offset: u32,
}

// Rule 3: the best field match for one token, name first, tags next, then
// type and source.
fn best_hit(candidate: &Candidate, token: &str) -> Option<Hit> {
    let mut best = None;
    consider(&mut best, rung(&candidate.name, token), 0);
    for tag in &candidate.tags {
        consider(&mut best, rung(tag, token), TAG_RUNGS);
    }
    consider(&mut best, rung(&candidate.kind, token), TYPE_SOURCE_RUNGS);
    consider(&mut best, rung(&candidate.source, token), TYPE_SOURCE_RUNGS);
    best
}

fn consider(best: &mut Option<Hit>, found: Option<(i32, u32)>, field_rungs: i32) {
    let Some((rung, offset)) = found else {
        return;
    };
    let hit = Hit {
        rank: rung + field_rungs,
        offset,
    };
    if best
        .as_ref()
        .is_none_or(|current| (hit.rank, hit.offset) < (current.rank, current.offset))
    {
        *best = Some(hit);
    }
}

// The rule 3 ladder within one field: exact 0, prefix 1, start of a later
// word 2, substring 3; with the match's char offset for rule 4.
fn rung(field: &str, token: &str) -> Option<(i32, u32)> {
    if field == token {
        return Some((0, 0));
    }
    if field.starts_with(token) {
        return Some((1, 0));
    }
    let mut first = None;
    for (index, _) in field.match_indices(token) {
        if starts_word(field, index) {
            return Some((2, count_chars(&field[..index])));
        }
        first.get_or_insert(index);
    }
    first.map(|index| (3, count_chars(&field[..index])))
}

// A word starts after any character that is not a letter or digit.
fn starts_word(field: &str, index: usize) -> bool {
    field[..index]
        .chars()
        .next_back()
        .is_some_and(|c| !c.is_alphanumeric())
}

// Rule 5: adjacent tokens that begin adjacent words of the name, in order.
fn phrase_pairs(words: &[String], tokens: &[String]) -> i32 {
    let mut pairs = 0;
    for pair in tokens.windows(2) {
        let found = words
            .windows(2)
            .any(|adjacent| adjacent[0].starts_with(&pair[0]) && adjacent[1].starts_with(&pair[1]));
        if found {
            pairs += PHRASE_BONUS;
        }
    }
    pairs
}

fn count_chars(text: &str) -> u32 {
    u32::try_from(text.chars().count()).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spell(name: &str) -> Candidate {
        Candidate::new(name, "spell", "srd-5e", &[], &BTreeMap::new())
    }

    fn tagged(name: &str, tags: &[&str]) -> Candidate {
        let tags: Vec<String> = tags.iter().map(|tag| (*tag).to_owned()).collect();
        Candidate::new(name, "spell", "srd-5e", &tags, &BTreeMap::new())
    }

    fn faceted(name: &str, kind: &str, facets: &[(&str, FacetValue)]) -> Candidate {
        let facets: BTreeMap<String, FacetValue> = facets
            .iter()
            .map(|(key, value)| ((*key).to_owned(), value.clone()))
            .collect();
        Candidate::new(name, kind, "srd-5e", &[], &facets)
    }

    #[test]
    fn facet_filters_compare_numbers_and_match_text_exactly() {
        let fireball = faceted(
            "Fireball",
            "spell",
            &[
                ("level", FacetValue::Number(3.0)),
                ("school", FacetValue::Text("Evocation".into())),
            ],
        );
        let goblin = faceted("Goblin", "monster", &[("cr", FacetValue::Number(0.25))]);
        assert!(rank_of(&fireball, "level<=3").is_some());
        assert!(rank_of(&fireball, "level<3").is_none());
        assert!(rank_of(&fireball, "level>=3 level=3").is_some());
        assert!(
            rank_of(&fireball, "school:evocation").is_some(),
            "text is normalised"
        );
        assert!(rank_of(&fireball, "school:abjuration").is_none());
        assert!(
            rank_of(&fireball, "school<evocation").is_none(),
            "text has no order"
        );
        assert!(rank_of(&goblin, "cr<=1/4").is_some());
        assert!(rank_of(&goblin, "cr>0.25").is_none());
        assert!(
            rank_of(&goblin, "level<=3").is_none(),
            "a missing facet never passes"
        );
        assert!(
            rank_of(&goblin, "cr<=x").is_none(),
            "a value that is not a number passes nothing"
        );
    }

    fn rank_of(candidate: &Candidate, query: &str) -> Option<i32> {
        score(candidate, &Query::parse(query)).map(|score| score.rank)
    }

    fn penalty_of(candidate: &Candidate, query: &str) -> Option<u32> {
        score(candidate, &Query::parse(query)).map(|score| score.penalty)
    }

    #[test]
    fn rule_2_every_token_must_match_some_field() {
        assert!(rank_of(&spell("Fire Bolt"), "fire bolt").is_some());
        assert!(rank_of(&spell("Fireball"), "fire bolt").is_none());
        assert!(rank_of(&tagged("Burning Hands", &["fire"]), "fire hands").is_some());
        assert!(rank_of(&spell("Fire Bolt"), "type:spell fire").is_some());
        assert!(rank_of(&spell("Fire Bolt"), "type:monster fire").is_none());
        assert!(rank_of(&spell("Fire Bolt"), "source:homebrew").is_none());
    }

    #[test]
    fn rule_3_the_name_ladder_is_exact_prefix_word_substring() {
        assert_eq!(rank_of(&spell("Bolt"), "bolt"), Some(0));
        assert_eq!(rank_of(&spell("Boltcaster"), "bolt"), Some(1));
        assert_eq!(rank_of(&spell("Fire Bolt"), "bolt"), Some(2));
        assert_eq!(rank_of(&spell("Thunderbolt"), "bolt"), Some(3));
        assert_eq!(rank_of(&spell("Tenser's Bolt"), "bolt"), Some(2));
    }

    #[test]
    fn rule_3_name_beats_tag_beats_type_and_source() {
        let name_substring = rank_of(&spell("Wildfire"), "fire").expect("substring");
        let tag_exact = rank_of(&tagged("Burning Hands", &["fire"]), "fire").expect("tag");
        let tag_substring = rank_of(&tagged("Burning Hands", &["wildfire"]), "fire").expect("tag");
        let kind_exact = rank_of(&spell("Burning Hands"), "spell").expect("kind");
        let source_prefix = rank_of(&spell("Burning Hands"), "srd").expect("source");
        assert_eq!((name_substring, tag_exact, tag_substring), (3, 4, 7));
        assert_eq!((kind_exact, source_prefix), (8, 9));
        assert!(name_substring < tag_exact && tag_substring < kind_exact);
    }

    #[test]
    fn rule_4_offset_and_extra_length_are_small_penalties() {
        assert_eq!(penalty_of(&spell("Fire Bolt"), "bolt"), Some(5 + 5));
        assert_eq!(penalty_of(&spell("Lightning Bolt"), "bolt"), Some(10 + 10));
        assert_eq!(penalty_of(&spell("Fire Bolt"), "fire"), Some(5));
        assert_eq!(penalty_of(&spell("Fire Storm"), "fire"), Some(6));
        assert_eq!(penalty_of(&spell("Fire"), "fire"), Some(0));
        let word = score(&spell("Fire Bolt"), &Query::parse("bolt")).expect("word");
        let substring = score(&spell("Thunderbolt"), &Query::parse("bolt")).expect("substring");
        assert!(word < substring, "a rung is never overturned by penalties");
    }

    #[test]
    fn rule_5_tokens_in_name_order_earn_a_phrase_bonus() {
        assert_eq!(rank_of(&spell("Fire Bolt"), "fire bolt"), Some(1 + 2 - 1));
        assert_eq!(rank_of(&spell("Fire Bolt"), "fir bo"), Some(1 + 2 - 1));
        assert_eq!(rank_of(&spell("Bolt of Fire"), "fire bolt"), Some(2 + 1));
        assert_eq!(
            rank_of(&spell("Wall of Fire and Bolt"), "fire bolt"),
            Some(2 + 2)
        );
        assert_eq!(
            rank_of(&spell("Great Fire Bolt Storm"), "great fire bolt"),
            Some(1 + 2 + 2 - 2)
        );
    }
}
