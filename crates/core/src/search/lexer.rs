//! From typed text to classed tokens with spans (design §3 "Linguistic
//! search and filters"). The raw query is cut at whitespace, each piece
//! normalised on its own so every token still knows where it sat in what
//! was typed; numbers, ordinals and the operator syntax are recognised by
//! shape, then runs of words are matched against the system's lexicon and
//! the language's vocabulary, longest phrase first.

use super::lexicon::{Lexicon, Meaning, stems};
use super::normalize::{Compare, Filter, normalize, operator_filter};
use super::vocabulary::{Vocabulary, Word};

/// What a token is, once the lexer has read it.
#[derive(Debug, Clone, PartialEq)]
pub enum Tag {
    /// Plain search text.
    Word,
    /// A number, with the text the filter will compare (`3`, `1/4`, `0.25`).
    Num(String),
    /// An ordinal: `3rd`, `third`.
    Nth(String),
    /// The `+` of `5+`.
    Plus,
    Cmp(Compare),
    Or,
    And,
    Not,
    Between,
    To,
    /// The dash of `1-3`.
    Dash,
    /// A kind noun: the kinds it names.
    Kind(Vec<String>),
    /// A facet's name.
    Facet(String),
    /// A value word, with every facet it may be a value of.
    Value(Vec<Reading>),
    /// The operator syntax, already a filter.
    Filter(Filter),
}

/// One way to read a value word.
#[derive(Debug, Clone, PartialEq)]
pub struct Reading {
    pub facet: String,
    pub value: String,
    /// Declared by the system, so it means this wherever it appears.
    pub sure: bool,
}

/// One token: where it sat in the typed query, in chars, and what it is.
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub start: usize,
    pub end: usize,
    /// Normalised text, as the ranker would compare it.
    pub text: String,
    pub tag: Tag,
}

/// Read `raw` into tokens.
pub fn lex(raw: &str, vocabulary: &Vocabulary, lexicon: &Lexicon) -> Vec<Token> {
    let pieces = split(raw);
    let mut tokens: Vec<Token> = Vec::new();
    for piece in pieces {
        tokens.extend(shape(piece));
    }
    phrase(tokens, vocabulary, lexicon)
}

// Whitespace-separated pieces with their char offsets.
fn split(raw: &str) -> Vec<Token> {
    let mut pieces = Vec::new();
    let mut start = None;
    let mut text = String::new();
    for (index, c) in raw.chars().enumerate() {
        if c.is_whitespace() {
            if let Some(begin) = start.take() {
                pieces.push(piece(begin, index, &text));
                text.clear();
            }
        } else {
            start.get_or_insert(index);
            text.push(c);
        }
    }
    if let Some(begin) = start {
        pieces.push(piece(begin, raw.chars().count(), &text));
    }
    pieces
}

fn piece(start: usize, end: usize, text: &str) -> Token {
    Token {
        start,
        end,
        text: normalize(text),
        tag: Tag::Word,
    }
}

// One piece becomes one or more tokens by its shape: the operator syntax,
// `1-3`, `5+`, `3rd`, a number, or a word.
fn shape(piece: Token) -> Vec<Token> {
    if let Some(filter) = operator_filter(&piece.text) {
        return vec![Token {
            tag: Tag::Filter(filter),
            ..piece
        }];
    }
    if let Some((left, right)) = piece.text.split_once('-')
        && is_number(left)
        && is_number(right)
    {
        let dash = piece.start + left.chars().count();
        return vec![
            Token {
                start: piece.start,
                end: dash,
                text: left.to_owned(),
                tag: Tag::Num(left.to_owned()),
            },
            Token {
                start: dash,
                end: dash + 1,
                text: "-".into(),
                tag: Tag::Dash,
            },
            Token {
                start: dash + 1,
                end: piece.end,
                text: right.to_owned(),
                tag: Tag::Num(right.to_owned()),
            },
        ];
    }
    if let Some(number) = piece.text.strip_suffix('+')
        && is_number(number)
    {
        return vec![
            Token {
                start: piece.start,
                end: piece.end - 1,
                text: number.to_owned(),
                tag: Tag::Num(number.to_owned()),
            },
            Token {
                start: piece.end - 1,
                end: piece.end,
                text: "+".into(),
                tag: Tag::Plus,
            },
        ];
    }
    if let Some(number) = ordinal(&piece.text) {
        return vec![Token {
            tag: Tag::Nth(number),
            ..piece
        }];
    }
    if is_number(&piece.text) {
        let text = piece.text.clone();
        return vec![Token {
            tag: Tag::Num(text),
            ..piece
        }];
    }
    vec![piece]
}

// `3`, `0.25`, `1/4`.
fn is_number(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    if let Some((numerator, denominator)) = text.split_once('/') {
        return is_number(numerator) && is_number(denominator);
    }
    let mut dots = 0;
    text.chars().all(|c| {
        if c == '.' {
            dots += 1;
            dots == 1
        } else {
            c.is_ascii_digit()
        }
    }) && text.chars().any(|c| c.is_ascii_digit())
}

// `1st`, `2nd`, `3rd`, `4th`.
fn ordinal(text: &str) -> Option<String> {
    let digits = text
        .strip_suffix("st")
        .or_else(|| text.strip_suffix("nd"))
        .or_else(|| text.strip_suffix("rd"))
        .or_else(|| text.strip_suffix("th"))?;
    (!digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit())).then(|| digits.to_owned())
}

// Runs of words (and the numbers inside phrases like "1 minute") are
// matched against the lexicon and the vocabulary, longest phrase first.
// A system's word wins over the language's at the same length, so a
// value called "second" would beat the ordinal.
fn phrase(tokens: Vec<Token>, vocabulary: &Vocabulary, lexicon: &Lexicon) -> Vec<Token> {
    let longest = lexicon.max_words().max(vocabulary.max_words()).max(1);
    let mut out = Vec::with_capacity(tokens.len());
    let mut i = 0;
    while i < tokens.len() {
        let mut matched = None;
        for length in (1..=longest.min(tokens.len() - i)).rev() {
            let window = &tokens[i..i + length];
            if !window
                .iter()
                .all(|token| matches!(token.tag, Tag::Word | Tag::Num(_)))
            {
                continue;
            }
            // A lone number is a number, never a phrase.
            if length == 1 && matches!(window[0].tag, Tag::Num(_)) {
                continue;
            }
            let words: Vec<String> = window.iter().flat_map(|token| stems(&token.text)).collect();
            if words.is_empty() {
                continue;
            }
            if let Some(meanings) = lexicon.lookup(&words) {
                matched = Some((length, meanings_tag(meanings)));
                break;
            }
            if let Some(word) = vocabulary.lookup(&words) {
                matched = Some((length, word_tag(word)));
                break;
            }
        }
        match matched {
            Some((length, tag)) => {
                let first = &tokens[i];
                let last = &tokens[i + length - 1];
                let text = tokens[i..i + length]
                    .iter()
                    .map(|token| token.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");
                out.push(Token {
                    start: first.start,
                    end: last.end,
                    text,
                    tag,
                });
                i += length;
            }
            None => {
                out.push(tokens[i].clone());
                i += 1;
            }
        }
    }
    out
}

fn meanings_tag(meanings: &[Meaning]) -> Tag {
    let mut values = Vec::new();
    for meaning in meanings {
        match meaning {
            Meaning::Kinds(kinds) => return Tag::Kind(kinds.clone()),
            Meaning::Facet(name) => return Tag::Facet(name.clone()),
            Meaning::Value { facet, value, sure } => values.push(Reading {
                facet: facet.clone(),
                value: value.clone(),
                sure: *sure,
            }),
        }
    }
    Tag::Value(values)
}

fn word_tag(word: Word) -> Tag {
    match word {
        Word::Cmp(compare) => Tag::Cmp(compare),
        Word::And => Tag::And,
        Word::Or => Tag::Or,
        Word::Not => Tag::Not,
        Word::Between => Tag::Between,
        Word::To => Tag::To,
        Word::Number(number) => Tag::Num(number_text(number)),
        Word::Ordinal(number) => Tag::Nth(number_text(number)),
    }
}

fn number_text(number: f64) -> String {
    number.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(raw: &str) -> Vec<Tag> {
        lex(raw, Vocabulary::english(), &Lexicon::empty())
            .into_iter()
            .map(|token| token.tag)
            .collect()
    }

    #[test]
    fn shapes_are_read_from_the_text_itself() {
        assert_eq!(
            tags("level<=3 5+ 1-3 3rd 1/4 0.25 fire"),
            vec![
                Tag::Filter(Filter::facet("level", Compare::Le, "3")),
                Tag::Num("5".into()),
                Tag::Plus,
                Tag::Num("1".into()),
                Tag::Dash,
                Tag::Num("3".into()),
                Tag::Nth("3".into()),
                Tag::Num("1/4".into()),
                Tag::Num("0.25".into()),
                Tag::Word,
            ]
        );
    }

    #[test]
    fn tokens_keep_their_place_in_the_typed_text() {
        let tokens = lex("  Fire   bolt 5+", Vocabulary::english(), &Lexicon::empty());
        let spans: Vec<(usize, usize, &str)> = tokens
            .iter()
            .map(|token| (token.start, token.end, token.text.as_str()))
            .collect();
        assert_eq!(
            spans,
            vec![
                (2, 6, "fire"),
                (9, 13, "bolt"),
                (14, 15, "5"),
                (15, 16, "+")
            ]
        );
    }

    #[test]
    fn language_phrases_join_into_one_token() {
        assert_eq!(
            tags("below level three or lower"),
            vec![
                Tag::Cmp(Compare::Lt),
                Tag::Word,
                Tag::Num("3".into()),
                Tag::Cmp(Compare::Le),
            ]
        );
        let tokens = lex("at least 5", Vocabulary::english(), &Lexicon::empty());
        assert_eq!(tokens[0].text, "at least");
        assert_eq!((tokens[0].start, tokens[0].end), (0, 8));
    }
}
