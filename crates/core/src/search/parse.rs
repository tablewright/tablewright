//! From classed tokens to a query: the pest grammar reads the shape, and
//! the lowering here gives it meaning (design §3 "Linguistic search and
//! filters"). The grammar runs over one class name per token, so it never
//! sees a word of any language; every token index maps back to the typed
//! text, which is how the query knows what it understood and where.

use std::collections::BTreeSet;

use pest::Parser;
use pest::iterators::Pair;
use pest_derive::Parser;

use super::lexer::{Tag, Token, lex};
use super::lexicon::Lexicon;
use super::normalize::{Compare, Filter, Query, Understood};
use super::vocabulary::Vocabulary;

#[derive(Parser)]
#[grammar = "search/grammar.pest"]
struct Grammar;

/// Parse `raw` with the system's `lexicon`.
pub fn parse(raw: &str, lexicon: &Lexicon) -> Query {
    let tokens = lex(raw, Vocabulary::english(), lexicon);
    lower(&tokens, lexicon)
}

// A value whose facet has an order (a rail, slider or select with stops) is
// an OVALUE, so "large or bigger" can be a bound while "beasts below cr 4"
// leaves its comparator to the bound that follows.
fn class(token: &Token, lexicon: &Lexicon) -> &'static str {
    match &token.tag {
        Tag::Word => "WORD",
        Tag::Num(_) => "NUM",
        Tag::Nth(_) => "NTH",
        Tag::Plus => "PLUS",
        Tag::Cmp(_) => "CMP",
        Tag::Or => "OR",
        Tag::And => "AND",
        Tag::Not => "NOT",
        Tag::Between => "BETWEEN",
        Tag::To => "TO",
        Tag::Dash => "DASH",
        Tag::Kind(_) => "KIND",
        Tag::Facet(_) => "FACET",
        Tag::Value(readings) => {
            if readings
                .iter()
                .any(|reading| lexicon.ordered_values(&reading.facet).is_some())
            {
                "OVALUE"
            } else {
                "VALUE"
            }
        }
        Tag::Filter(_) => "FILTER",
    }
}

fn lower(tokens: &[Token], lexicon: &Lexicon) -> Query {
    let classes: Vec<&str> = tokens.iter().map(|token| class(token, lexicon)).collect();
    let text = classes.join(" ");
    let Ok(mut pairs) = Grammar::parse(Rule::query, &text) else {
        // Cannot happen, since every class is a word; but a query must
        // never fail, so the tokens become plain words.
        let mut query = Query::default();
        for token in tokens {
            query.word((token.start, token.end), &token.text);
        }
        return query;
    };
    let query = pairs.next().expect("the query rule");
    let items: Vec<Item> = query
        .into_inner()
        .filter(|pair| pair.as_rule() == Rule::item)
        .map(|pair| read(pair, &text, tokens))
        .collect();
    let in_play = kinds_in_play(&items, tokens, lexicon);
    let mut query = Query::default();
    for item in items {
        item.lower(tokens, lexicon, &in_play, &mut query);
    }
    query
}

// One item of the query: which rule matched, and the token indices of the
// classes inside it, in order.
struct Item {
    rule: Rule,
    parts: Vec<(Rule, usize)>,
}

fn read(item: Pair<'_, Rule>, text: &str, tokens: &[Token]) -> Item {
    let inner = item.into_inner().next().expect("an item has one form");
    let rule = inner.as_rule();
    let mut parts = Vec::new();
    collect(inner, text, &mut parts);
    debug_assert!(parts.iter().all(|(_, index)| *index < tokens.len()));
    Item { rule, parts }
}

fn collect(pair: Pair<'_, Rule>, text: &str, parts: &mut Vec<(Rule, usize)>) {
    let rule = pair.as_rule();
    if is_class(rule) {
        let index = text[..pair.as_span().start()].matches(' ').count();
        parts.push((rule, index));
        return;
    }
    for inner in pair.into_inner() {
        collect(inner, text, parts);
    }
}

fn is_class(rule: Rule) -> bool {
    matches!(
        rule,
        Rule::FILTER
            | Rule::KIND
            | Rule::FACET
            | Rule::VALUE
            | Rule::OVALUE
            | Rule::NUM
            | Rule::NTH
            | Rule::PLUS
            | Rule::CMP
            | Rule::OR
            | Rule::AND
            | Rule::NOT
            | Rule::BETWEEN
            | Rule::TO
            | Rule::DASH
            | Rule::WORD
    )
}

// The kinds the query has put in play: named by a kind noun or by the
// operator syntax, or implied by a bound on a facet only some kinds carry.
// A value word becomes a filter only when its facet's kinds are in play;
// otherwise it stays search text, and the facet field ranks it (rule 3).
fn kinds_in_play(items: &[Item], tokens: &[Token], lexicon: &Lexicon) -> BTreeSet<String> {
    let mut kinds = BTreeSet::new();
    for item in items {
        for (rule, index) in &item.parts {
            match (&tokens[*index].tag, rule) {
                (Tag::Kind(names), _) => kinds.extend(names.iter().cloned()),
                (Tag::Filter(filter), _) => kinds.extend(filter.kinds_named()),
                (Tag::Facet(name), _) if item.rule != Rule::word => {
                    kinds.extend(lexicon.kinds_with(name).iter().cloned());
                }
                (Tag::Value(readings), _) => {
                    for reading in readings.iter().filter(|reading| reading.sure) {
                        kinds.extend(lexicon.kinds_with(&reading.facet).iter().cloned());
                    }
                }
                _ => {}
            }
        }
    }
    kinds
}

impl Item {
    fn lower(
        &self,
        tokens: &[Token],
        lexicon: &Lexicon,
        in_play: &BTreeSet<String>,
        query: &mut Query,
    ) {
        let span = self.span(tokens);
        match self.rule {
            Rule::filter => {
                if let Tag::Filter(filter) = &tokens[self.parts[0].1].tag {
                    query.understand(span, filter.clone());
                }
            }
            Rule::kind => {
                if let Tag::Kind(kinds) = &tokens[self.parts[0].1].tag {
                    query.understand(
                        span,
                        Filter::any(kinds.iter().map(|kind| Filter::kind(kind)).collect()),
                    );
                }
            }
            Rule::bound => self.lower_bound(tokens, query),
            Rule::range => self.lower_range(tokens, query),
            Rule::value_bound => self.lower_value_bound(tokens, lexicon, in_play, query),
            Rule::alternation => self.lower_alternation(tokens, lexicon, in_play, query),
            _ => {
                for (_, index) in &self.parts {
                    let token = &tokens[*index];
                    query.word((token.start, token.end), &token.text);
                }
            }
        }
    }

    fn span(&self, tokens: &[Token]) -> (usize, usize) {
        let first = tokens[self.parts[0].1].start;
        let last = tokens[self.parts[self.parts.len() - 1].1].end;
        (first, last)
    }

    fn facet(&self, tokens: &[Token]) -> Option<String> {
        self.parts
            .iter()
            .find_map(|(_, index)| match &tokens[*index].tag {
                Tag::Facet(name) => Some(name.clone()),
                _ => None,
            })
    }

    fn numbers(&self, tokens: &[Token]) -> Vec<String> {
        self.parts
            .iter()
            .filter_map(|(_, index)| match &tokens[*index].tag {
                Tag::Num(text) | Tag::Nth(text) => Some(text.clone()),
                _ => None,
            })
            .collect()
    }

    fn compare(&self, tokens: &[Token]) -> Option<Compare> {
        self.parts
            .iter()
            .find_map(|(_, index)| match &tokens[*index].tag {
                Tag::Cmp(compare) => Some(*compare),
                Tag::Plus => Some(Compare::Ge),
                _ => None,
            })
    }

    fn lower_bound(&self, tokens: &[Token], query: &mut Query) {
        let (Some(facet), numbers) = (self.facet(tokens), self.numbers(tokens)) else {
            return;
        };
        let compare = self.compare(tokens).unwrap_or(Compare::Eq);
        let filter = if numbers.len() > 1 && compare == Compare::Eq {
            Filter::any(
                numbers
                    .iter()
                    .map(|number| Filter::facet(&facet, Compare::Eq, number))
                    .collect(),
            )
        } else {
            Filter::facet(&facet, compare, &numbers[0])
        };
        query.understand(self.span(tokens), filter);
    }

    fn lower_range(&self, tokens: &[Token], query: &mut Query) {
        let (Some(facet), numbers) = (self.facet(tokens), self.numbers(tokens)) else {
            return;
        };
        let span = self.span(tokens);
        query.understand(span, Filter::facet(&facet, Compare::Ge, &numbers[0]));
        query.understand(span, Filter::facet(&facet, Compare::Le, &numbers[1]));
    }

    // "large or bigger": every value of the facet from that one on, in the
    // order the system gave it. Without an order, or out of play, the
    // words are search text.
    fn lower_value_bound(
        &self,
        tokens: &[Token],
        lexicon: &Lexicon,
        in_play: &BTreeSet<String>,
        query: &mut Query,
    ) {
        let value_index = self
            .parts
            .iter()
            .find(|(rule, _)| matches!(rule, Rule::VALUE | Rule::OVALUE))
            .map(|(_, index)| *index);
        let (Some(index), Some(compare)) = (value_index, self.compare(tokens)) else {
            return self.as_words(tokens, query);
        };
        let Tag::Value(values) = &tokens[index].tag else {
            return self.as_words(tokens, query);
        };
        let choices: Vec<Filter> = values
            .iter()
            .filter(|reading| reading.sure || plays(lexicon, &reading.facet, in_play))
            .filter_map(|reading| {
                let facet = &reading.facet;
                let order = lexicon.ordered_values(facet)?;
                let at = order.iter().position(|known| *known == reading.value)?;
                let picked = order.iter().enumerate().filter(|(i, _)| match compare {
                    Compare::Eq => *i == at,
                    Compare::Lt => *i < at,
                    Compare::Le => *i <= at,
                    Compare::Gt => *i > at,
                    Compare::Ge => *i >= at,
                });
                Some(Filter::any(
                    picked
                        .map(|(_, known)| Filter::facet(facet, Compare::Eq, known))
                        .collect(),
                ))
            })
            .collect();
        if choices.is_empty() {
            return self.as_words(tokens, query);
        }
        query.understand(self.span(tokens), Filter::any(choices));
    }

    // "evocation", "not undead", "wands or staffs": each value word is the
    // facets it may belong to; several words join with any; "not" flips
    // the word after it.
    fn lower_alternation(
        &self,
        tokens: &[Token],
        lexicon: &Lexicon,
        in_play: &BTreeSet<String>,
        query: &mut Query,
    ) {
        let mut choices = Vec::new();
        let mut negate = false;
        for (rule, index) in &self.parts {
            match (&tokens[*index].tag, rule) {
                (Tag::Not, _) => negate = true,
                (Tag::Value(values), _) => {
                    let readings: Vec<Filter> = values
                        .iter()
                        .filter(|reading| reading.sure || plays(lexicon, &reading.facet, in_play))
                        .map(|reading| Filter::facet(&reading.facet, Compare::Eq, &reading.value))
                        .collect();
                    if readings.is_empty() {
                        // Not this word: the whole run stays search text.
                        return self.as_words(tokens, query);
                    }
                    let filter = Filter::any(readings);
                    choices.push(if negate {
                        Filter::negated(filter)
                    } else {
                        filter
                    });
                    negate = false;
                }
                _ => {}
            }
        }
        if choices.is_empty() {
            return self.as_words(tokens, query);
        }
        query.understand(self.span(tokens), Filter::any(choices));
    }

    fn as_words(&self, tokens: &[Token], query: &mut Query) {
        for (_, index) in &self.parts {
            let token = &tokens[*index];
            match token.tag {
                // The connectives of a run that meant nothing carry no
                // search text of their own.
                Tag::Or | Tag::Not | Tag::And | Tag::Cmp(_) => {
                    query
                        .understood
                        .push(Understood::ignored(token.start, token.end));
                }
                _ => query.word((token.start, token.end), &token.text),
            }
        }
    }
}

// A facet is in play when a kind carrying it is, or when nothing is in
// play and the facet belongs to every kind there is (a system without
// kinds declared).
fn plays(lexicon: &Lexicon, facet: &str, in_play: &BTreeSet<String>) -> bool {
    lexicon
        .kinds_with(facet)
        .iter()
        .any(|kind| in_play.contains(kind))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compendium::{EntryId, EntrySummary, FacetValue, Visibility};
    use crate::system::SystemManifest;
    use std::collections::BTreeMap;

    fn system() -> SystemManifest {
        SystemManifest::load(std::path::Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../systems/5e/system.json"
        )))
        .expect("the 5e manifest")
    }

    fn entry(kind: &str, facets: &[(&str, FacetValue)]) -> EntrySummary {
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
                .map(|(name, value)| ((*name).to_owned(), value.clone()))
                .collect::<BTreeMap<_, _>>(),
            parts: Vec::new(),
        }
    }

    fn lexicon() -> Lexicon {
        let text = |value: &str| FacetValue::Text(value.into());
        let entries = [
            entry("spell", &[("school", text("evocation"))]),
            entry(
                "spell",
                &[
                    ("school", text("necromancy")),
                    ("duration", text("1 minute")),
                ],
            ),
            entry(
                "monster",
                &[
                    ("creature", text("undead")),
                    ("size", text("large")),
                    ("law", text("neutral")),
                    ("moral", text("neutral")),
                ],
            ),
            entry(
                "monster",
                &[("creature", text("giant")), ("size", text("huge"))],
            ),
            entry(
                "monster",
                &[("creature", text("beast")), ("size", text("small"))],
            ),
            entry("monster", &[("creature", text("fiend"))]),
            entry(
                "magic-item",
                &[("category", text("wand")), ("rarity", text("rare"))],
            ),
            entry(
                "magic-item",
                &[("category", text("staff")), ("rarity", text("very-rare"))],
            ),
            entry("item", &[("category", text("weapon"))]),
        ];
        Lexicon::build(Some(&system()), &entries)
    }

    /// The corpus: one phrasing per line, `query => filters ; tokens`.
    #[test]
    fn the_corpus_of_phrasings_parses_as_written() {
        let lexicon = lexicon();
        let mut failures = Vec::new();
        for line in include_str!("phrasings.txt").lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let (raw, expected) = line.split_once("=>").expect("query => expectation");
            let query = parse(raw.trim(), &lexicon);
            let got = query.describe();
            if got != expected.trim() {
                failures.push(format!(
                    "{}\n    expected: {}\n    got:      {got}",
                    raw.trim(),
                    expected.trim()
                ));
            }
        }
        assert!(failures.is_empty(), "\n{}", failures.join("\n"));
    }

    #[test]
    fn understood_spans_point_into_the_typed_text() {
        let query = parse("  Evocation spells  below level 3 fire", &lexicon());
        let spans: Vec<(usize, usize, bool)> = query
            .understood
            .iter()
            .map(|u| (u.start as usize, u.end as usize, u.filter.is_some()))
            .collect();
        assert_eq!(spans, vec![(2, 11, true), (12, 18, true), (20, 33, true)]);
        assert_eq!(query.tokens, vec!["fire"]);
    }

    #[test]
    fn the_operator_syntax_still_works_without_a_lexicon() {
        let query = parse("type:spell level<=3 fire", &Lexicon::empty());
        assert_eq!(query.describe(), "type:spell level<=3 ; fire");
        let query = parse("below level 3", &Lexicon::empty());
        assert_eq!(query.describe(), "; below level 3");
    }
}
