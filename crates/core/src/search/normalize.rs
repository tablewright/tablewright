//! Rule 1 of the search rules (design.md §3): text normalisation and query
//! parsing. Everything the ranker compares has been through [`normalize`],
//! so the ranker never thinks about case, accents, or spacing.

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

/// A parsed query: the tokens that score and the filters that gate.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Query {
    pub tokens: Vec<String>,
    pub filters: Vec<Filter>,
}

/// A `field:value` token. Values are normalised like everything else.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Filter {
    Kind(String),
    Tag(String),
    Source(String),
}

impl Query {
    /// Split a raw query into scoring tokens and filters. A token is a filter
    /// only when its field is one search knows; `12:30` stays a token.
    pub fn parse(raw: &str) -> Self {
        let mut query = Query::default();
        for token in normalize(raw).split(' ').filter(|token| !token.is_empty()) {
            match token.split_once(':') {
                Some(("type", value)) if !value.is_empty() => {
                    query.filters.push(Filter::Kind(value.to_owned()));
                }
                Some(("tag" | "tags", value)) if !value.is_empty() => {
                    query.filters.push(Filter::Tag(value.to_owned()));
                }
                Some(("source", value)) if !value.is_empty() => {
                    query.filters.push(Filter::Source(value.to_owned()));
                }
                _ => query.tokens.push(token.to_owned()),
            }
        }
        query
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
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(
            query.filters,
            vec![
                Filter::Kind("spell".into()),
                Filter::Tag("evocation".into()),
                Filter::Source("srd-5e".into()),
            ]
        );
        assert_eq!(query.scoring_len(), "fire bolt".len());
    }

    #[test]
    fn rule_1_unknown_fields_and_empty_values_stay_tokens() {
        let query = Query::parse("12:30 tag: level:3");
        assert_eq!(query.tokens, vec!["12:30", "tag:", "level:3"]);
        assert!(query.filters.is_empty());
        assert!(Query::parse("   ").is_empty());
    }
}
