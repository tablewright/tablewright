//! The words of a language that the query grammar rests on: comparator
//! phrases, the connectives, and number and ordinal words. One JSON file
//! per language beside this module; English for now. Everything a system
//! contributes (facet names, values, kind nouns) is the lexicon's, not the
//! vocabulary's, so this file knows nothing about games.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

use super::lexicon::stems;
use super::normalize::Compare;

/// What a vocabulary phrase means.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Word {
    Cmp(Compare),
    And,
    Or,
    Not,
    Between,
    To,
    Number(f64),
    Ordinal(f64),
}

/// A language's phrases, keyed by their stemmed words.
pub struct Vocabulary {
    phrases: HashMap<Vec<String>, Word>,
    max_words: usize,
}

#[derive(Deserialize)]
struct File {
    comparators: HashMap<String, String>,
    connectives: HashMap<String, String>,
    numbers: HashMap<String, f64>,
    ordinals: HashMap<String, f64>,
}

impl Vocabulary {
    /// The English vocabulary, parsed once.
    pub fn english() -> &'static Vocabulary {
        static ENGLISH: OnceLock<Vocabulary> = OnceLock::new();
        ENGLISH.get_or_init(|| Self::parse(include_str!("vocabulary/en.json")))
    }

    fn parse(text: &str) -> Self {
        let file: File = serde_json::from_str(text).expect("the vocabulary file is valid JSON");
        let mut phrases = HashMap::new();
        for (phrase, compare) in &file.comparators {
            let compare = match compare.as_str() {
                "lt" => Compare::Lt,
                "le" => Compare::Le,
                "gt" => Compare::Gt,
                "ge" => Compare::Ge,
                other => panic!("unknown comparator {other} in the vocabulary"),
            };
            phrases.insert(stems(phrase), Word::Cmp(compare));
        }
        for (phrase, connective) in &file.connectives {
            let word = match connective.as_str() {
                "and" => Word::And,
                "or" => Word::Or,
                "not" => Word::Not,
                "between" => Word::Between,
                "to" => Word::To,
                other => panic!("unknown connective {other} in the vocabulary"),
            };
            phrases.insert(stems(phrase), word);
        }
        for (phrase, number) in &file.numbers {
            phrases.insert(stems(phrase), Word::Number(*number));
        }
        for (phrase, number) in &file.ordinals {
            phrases.insert(stems(phrase), Word::Ordinal(*number));
        }
        let max_words = phrases.keys().map(Vec::len).max().unwrap_or(1);
        Self { phrases, max_words }
    }

    /// The meaning of a run of stemmed words, if the language has one.
    pub fn lookup(&self, words: &[String]) -> Option<Word> {
        self.phrases.get(words).copied()
    }

    /// The longest phrase, in words.
    pub fn max_words(&self) -> usize {
        self.max_words
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_phrases_carry_their_meaning() {
        let english = Vocabulary::english();
        assert_eq!(
            english.lookup(&stems("below")),
            Some(Word::Cmp(Compare::Lt))
        );
        assert_eq!(
            english.lookup(&stems("or lower")),
            Some(Word::Cmp(Compare::Le))
        );
        assert_eq!(
            english.lookup(&stems("at least")),
            Some(Word::Cmp(Compare::Ge))
        );
        assert_eq!(english.lookup(&stems("three")), Some(Word::Number(3.0)));
        assert_eq!(english.lookup(&stems("third")), Some(Word::Ordinal(3.0)));
        assert_eq!(english.lookup(&stems("without")), Some(Word::Not));
        assert_eq!(english.lookup(&stems("fire")), None);
        assert!(english.max_words() >= 3);
    }
}
