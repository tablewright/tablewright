//! Rule 1 of the search rules (design.md §3): text normalisation, the
//! filter language, and the parsed query. Everything the ranker compares
//! has been through [`normalize`], so the ranker never thinks about case,
//! accents, or spacing. The parse itself lives in `parse`; this module
//! owns what a parse produces.

use std::fmt;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::lexicon::Lexicon;

/// Lowercase, fold Latin diacritics to their base letters, drop combining
/// marks, and collapse runs of whitespace to a single space.
pub fn normalize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut pending_space = false;
    for c in text.chars().flat_map(char::to_lowercase) {
        if c.is_whitespace() {
            pending_space = !out.is_empty();
            continue;
        }
        if pending_space {
            out.push(' ');
            pending_space = false;
        }
        fold(c, &mut out);
    }
    out
}

// Latin-script folding by table, applied after lowercasing so only lowercase
// forms appear. Full Unicode normalisation would need a crate; compendium
// names are Latin script, and this covers Latin-1 and Latin Extended-A.
fn fold(c: char, out: &mut String) {
    let folded = match c {
        '\u{0300}'..='\u{036f}' => "",
        'à'..='å' | 'ā' | 'ă' | 'ą' => "a",
        'æ' => "ae",
        'ç' | 'ć' | 'ĉ' | 'ċ' | 'č' => "c",
        'ð' | 'ď' | 'đ' => "d",
        'è'..='ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' => "e",
        'ĝ' | 'ğ' | 'ġ' | 'ģ' => "g",
        'ĥ' | 'ħ' => "h",
        'ì'..='ï' | 'ĩ' | 'ī' | 'ĭ' | 'į' | 'ı' => "i",
        'ĳ' => "ij",
        'ĵ' => "j",
        'ķ' | 'ĸ' => "k",
        'ĺ' | 'ļ' | 'ľ' | 'ŀ' | 'ł' => "l",
        'ñ' | 'ń' | 'ņ' | 'ň' | 'ŉ' | 'ŋ' => "n",
        'ò'..='ö' | 'ø' | 'ō' | 'ŏ' | 'ő' => "o",
        'œ' => "oe",
        'ŕ' | 'ŗ' | 'ř' => "r",
        'ś' | 'ŝ' | 'ş' | 'š' | 'ſ' => "s",
        'ß' => "ss",
        'ţ' | 'ť' | 'ŧ' => "t",
        'þ' => "th",
        'ù'..='ü' | 'ũ' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' => "u",
        'ŵ' => "w",
        'ý' | 'ÿ' | 'ŷ' => "y",
        'ź' | 'ż' | 'ž' => "z",
        _ => {
            out.push(c);
            return;
        }
    };
    out.push_str(folded);
}

/// A parsed query: the tokens that score, where they sat in the typed
/// text, the filters that gate, and what the parser made of each stretch
/// of the text.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Query {
    pub tokens: Vec<String>,
    /// One char span per token, in the typed text.
    pub spans: Vec<(u32, u32)>,
    /// All of these must pass.
    pub filters: Vec<Filter>,
    pub understood: Vec<Understood>,
}

/// A filter: what an entry must satisfy to be listed at all. Values are
/// normalised like everything else. A list of filters is a conjunction;
/// `Any` and `Not` give it the rest of the shapes a phrase can take.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "filter", rename_all = "kebab-case")]
pub enum Filter {
    Kind {
        value: String,
    },
    Tag {
        value: String,
    },
    Source {
        value: String,
    },
    /// A facet of the entry's data: `level<=3`, `school:evocation`.
    Facet {
        name: String,
        compare: Compare,
        value: String,
    },
    /// At least one of these passes.
    Any {
        items: Vec<Filter>,
    },
    /// This one does not pass.
    Not {
        item: Box<Filter>,
    },
}

/// How a facet filter compares.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Compare {
    Eq,
    Lt,
    Le,
    Gt,
    Ge,
}

/// A stretch of the typed query the parser dealt with: the filter it
/// became, or nothing when the stretch was set aside as meaning nothing
/// here (a connective on its own, a word no entry has).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Understood {
    /// Char offsets into the typed text.
    pub start: u32,
    pub end: u32,
    pub filter: Option<Filter>,
}

impl Understood {
    pub fn ignored(start: usize, end: usize) -> Self {
        Self {
            start: start as u32,
            end: end as u32,
            filter: None,
        }
    }
}

impl Filter {
    pub fn kind(value: &str) -> Self {
        Self::Kind {
            value: value.to_owned(),
        }
    }

    pub fn facet(name: &str, compare: Compare, value: &str) -> Self {
        Self::Facet {
            name: name.to_owned(),
            compare,
            value: value.to_owned(),
        }
    }

    /// Any of `items`; one item is itself.
    pub fn any(mut items: Vec<Filter>) -> Self {
        if items.len() == 1 {
            return items.pop().expect("one item");
        }
        Self::Any { items }
    }

    pub fn negated(item: Filter) -> Self {
        Self::Not {
            item: Box::new(item),
        }
    }

    /// The kinds this filter names outright, so the parser knows what is
    /// in play.
    pub fn kinds_named(&self) -> Vec<String> {
        match self {
            Self::Kind { value } => vec![value.clone()],
            Self::Any { items } => items.iter().flat_map(Filter::kinds_named).collect(),
            _ => Vec::new(),
        }
    }
}

impl fmt::Display for Filter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Kind { value } => write!(f, "type:{value}"),
            Self::Tag { value } => write!(f, "tag:{value}"),
            Self::Source { value } => write!(f, "source:{value}"),
            Self::Facet {
                name,
                compare,
                value,
            } => {
                let op = match compare {
                    Compare::Eq => "=",
                    Compare::Lt => "<",
                    Compare::Le => "<=",
                    Compare::Gt => ">",
                    Compare::Ge => ">=",
                };
                write!(f, "{name}{op}{value}")
            }
            Self::Any { items } => {
                let parts: Vec<String> = items.iter().map(Filter::to_string).collect();
                write!(f, "({})", parts.join(" | "))
            }
            Self::Not { item } => write!(f, "!{item}"),
        }
    }
}

impl Query {
    /// Parse `raw` with no system words: the operator syntax and the
    /// language's structure only.
    pub fn parse(raw: &str) -> Self {
        super::parse::parse(raw, &Lexicon::empty())
    }

    /// Parse `raw` with a system's words.
    pub fn parse_with(raw: &str, lexicon: &Lexicon) -> Self {
        super::parse::parse(raw, lexicon)
    }

    /// Record a filter read from the text at `span`.
    pub fn understand(&mut self, span: (usize, usize), filter: Filter) {
        self.understood.push(Understood {
            start: span.0 as u32,
            end: span.1 as u32,
            filter: Some(filter.clone()),
        });
        self.filters.push(filter);
    }

    /// Record a scoring token from the text at `span`.
    pub fn word(&mut self, span: (usize, usize), text: &str) {
        self.tokens.push(text.to_owned());
        self.spans.push((span.0 as u32, span.1 as u32));
    }

    /// Whether every match of `previous` is still a candidate for this query,
    /// so a search may rescore only what `previous` matched: the filters are
    /// the same and each earlier token has only grown at its end. Filters are
    /// exact, so a changed one is never an extension.
    pub fn extends(&self, previous: &Query) -> bool {
        self.filters == previous.filters
            && self.tokens.len() >= previous.tokens.len()
            && previous
                .tokens
                .iter()
                .zip(&self.tokens)
                .all(|(before, now)| now.starts_with(before.as_str()))
    }

    /// Whether there is anything to search for at all.
    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty() && self.filters.is_empty()
    }

    /// The scoring text's length in chars, as if the tokens were typed with
    /// single spaces; rule 4 compares the name's length against it.
    pub fn scoring_len(&self) -> usize {
        let letters: usize = self.tokens.iter().map(|token| token.chars().count()).sum();
        letters + self.tokens.len().saturating_sub(1)
    }

    /// The query in one line, `filters ; tokens`, as the corpus writes it.
    pub fn describe(&self) -> String {
        let filters: Vec<String> = self.filters.iter().map(Filter::to_string).collect();
        format!("{} ; {}", filters.join(" "), self.tokens.join(" "))
            .trim()
            .to_owned()
    }
}

/// The operator syntax, one token: `type:`, `tag:` and `source:` are the
/// envelope's own filters; any other word followed by `:`, `=`, `<`, `<=`,
/// `>` or `>=` and a value is a facet filter. `12:30` is not one, since a
/// facet name is a word, and neither is `level<` with nothing after it.
pub fn operator_filter(token: &str) -> Option<Filter> {
    match token.split_once(':') {
        Some(("type", value)) if !value.is_empty() => {
            return Some(Filter::Kind {
                value: value.to_owned(),
            });
        }
        Some(("tag" | "tags", value)) if !value.is_empty() => {
            return Some(Filter::Tag {
                value: value.to_owned(),
            });
        }
        Some(("source", value)) if !value.is_empty() => {
            return Some(Filter::Source {
                value: value.to_owned(),
            });
        }
        _ => {}
    }
    // The longest operator is tried first so `<=` is never read as `<`
    // followed by `=value`.
    const OPERATORS: [(&str, Compare); 6] = [
        ("<=", Compare::Le),
        (">=", Compare::Ge),
        ("<", Compare::Lt),
        (">", Compare::Gt),
        ("=", Compare::Eq),
        (":", Compare::Eq),
    ];
    let at = token.find(['<', '>', '=', ':'])?;
    let (name, rest) = token.split_at(at);
    let (symbol, compare) = OPERATORS
        .iter()
        .find(|(symbol, _)| rest.starts_with(symbol))?;
    let value = &rest[symbol.len()..];
    let is_word = !name.is_empty() && name.chars().all(|c| c.is_alphabetic() || c == '_');
    if !is_word || value.is_empty() {
        return None;
    }
    Some(Filter::facet(name, *compare, value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rule_1_facet_tokens_carry_their_comparison() {
        let query = Query::parse("type:spell level<=3 school:evocation cr>=1/4 hp>100 size=large");
        assert!(query.tokens.is_empty());
        assert_eq!(
            query.filters,
            vec![
                Filter::kind("spell"),
                Filter::facet("level", Compare::Le, "3"),
                Filter::facet("school", Compare::Eq, "evocation"),
                Filter::facet("cr", Compare::Ge, "1/4"),
                Filter::facet("hp", Compare::Gt, "100"),
                Filter::facet("size", Compare::Eq, "large"),
            ]
        );
        assert_eq!(
            query.describe(),
            "type:spell level<=3 school=evocation cr>=1/4 hp>100 size=large ;"
        );
    }

    #[test]
    fn a_query_extends_another_when_filters_match_and_tokens_only_grow() {
        let q = |text: &str| Query::parse(text);
        assert!(q("fire bo").extends(&q("fire b")));
        assert!(q("fire bolt x").extends(&q("fir")));
        assert!(q("fire").extends(&q("fire")));
        assert!(q("type:spell fireb").extends(&q("type:spell fire")));
        assert!(!q("fire").extends(&q("fire b")));
        assert!(!q("bolt fire").extends(&q("fire")));
        assert!(!q("type:spell").extends(&q("type:s")));
        assert!(!q("fire type:spell").extends(&q("fire")));
    }

    #[test]
    fn rule_1_normalises_case_diacritics_and_whitespace() {
        assert_eq!(normalize("  Éldritch \t BLAST  "), "eldritch blast");
        assert_eq!(normalize("Ñoño Straße Œil"), "nono strasse oeil");
        assert_eq!(normalize("naïve cafe\u{301}"), "naive cafe");
        assert_eq!(normalize(""), "");
    }

    #[test]
    fn rule_1_field_tokens_are_filters_not_scoring_tokens() {
        let query = Query::parse("Type:Spell fire tag:Evocation source:srd-5e bolt");
        assert_eq!(query.tokens, vec!["fire", "bolt"]);
        assert_eq!(query.spans, vec![(11, 15), (44, 48)]);
        assert_eq!(
            query.filters,
            vec![
                Filter::kind("spell"),
                Filter::Tag {
                    value: "evocation".into()
                },
                Filter::Source {
                    value: "srd-5e".into()
                },
            ]
        );
        assert_eq!(query.scoring_len(), "fire bolt".len());
    }

    #[test]
    fn rule_1_numbers_before_a_colon_and_empty_values_stay_tokens() {
        let query = Query::parse("12:30 tag: level< a=");
        assert_eq!(query.tokens, vec!["12:30", "tag:", "level<", "a="]);
        assert!(query.filters.is_empty());
        assert!(Query::parse("   ").is_empty());
    }

    #[test]
    fn filters_print_as_the_corpus_writes_them() {
        let any = Filter::any(vec![Filter::kind("item"), Filter::kind("magic-item")]);
        assert_eq!(any.to_string(), "(type:item | type:magic-item)");
        assert_eq!(
            Filter::negated(Filter::facet("school", Compare::Eq, "evocation")).to_string(),
            "!school=evocation"
        );
        assert_eq!(
            Filter::any(vec![Filter::kind("spell")]),
            Filter::kind("spell")
        );
        assert_eq!(any.kinds_named(), vec!["item", "magic-item"]);
    }
}
