//! A derived n-gram index over the normalised fields: the candidate
//! pre-filter for large catalogues (design §3). It never decides the order
//! and never hides a true match: a token can only match a field that
//! contains every trigram of the token (every bigram, for a two-letter
//! token), so intersecting the postings of a token's grams yields a
//! superset of the real matches, which the ranker then scores as usual.
//! Rebuilt with the catalogue; never stored.

use std::collections::HashMap;

/// Postings per gram, trigrams and bigrams alike: the candidate ids whose
/// fields contain it, in increasing order.
pub struct TrigramIndex {
    postings: HashMap<u64, Vec<u32>>,
}

impl TrigramIndex {
    /// Index candidates from their normalised fields. Ids must arrive in
    /// increasing order, so every posting list stays sorted and free of
    /// repeats without a second pass.
    pub fn build<'a>(candidates: impl IntoIterator<Item = (u32, Vec<&'a str>)>) -> Self {
        let mut postings: HashMap<u64, Vec<u32>> = HashMap::new();
        for (id, fields) in candidates {
            for field in fields {
                for key in grams(field, 3).chain(grams(field, 2)) {
                    let list = postings.entry(key).or_default();
                    if list.last() != Some(&id) {
                        list.push(id);
                    }
                }
            }
        }
        Self { postings }
    }

    /// The ids that can match every token, sorted; `None` when no token is
    /// longer than one letter, in which case every id is a candidate. An
    /// empty list means nothing can match.
    pub fn candidates(&self, tokens: &[String]) -> Option<Vec<u32>> {
        let mut result: Option<Vec<u32>> = None;
        for token in tokens {
            let width = token.chars().count().min(3);
            if width < 2 {
                continue;
            }
            let keys: Vec<u64> = grams(token, width).collect();
            let mut lists: Vec<&[u32]> = keys
                .iter()
                .map(|key| self.postings.get(key).map_or(&[][..], Vec::as_slice))
                .collect();
            // Shortest list first: the intersection can only shrink from it.
            lists.sort_by_key(|list| list.len());
            let mut matching = lists[0].to_vec();
            for list in &lists[1..] {
                if matching.is_empty() {
                    break;
                }
                matching = intersect(&matching, list);
            }
            result = Some(match result {
                None => matching,
                Some(previous) => intersect(&previous, &matching),
            });
            if result.as_ref().is_some_and(Vec::is_empty) {
                break;
            }
        }
        result
    }
}

// A gram packs up to three chars into one key at 21 bits each, with the
// top bit set for bigrams so the two widths never collide.
fn grams(text: &str, width: usize) -> impl Iterator<Item = u64> + '_ {
    let chars: Vec<char> = text.chars().collect();
    let count = if chars.len() < width {
        0
    } else {
        chars.len() - width + 1
    };
    (0..count).map(move |i| {
        let key = |offset: usize| u64::from(chars[i + offset] as u32);
        if width == 2 {
            (1 << 63) | (key(0) << 21) | key(1)
        } else {
            (key(0) << 42) | (key(1) << 21) | key(2)
        }
    })
}

/// The ids in both sorted lists, sorted.
pub(super) fn intersect(a: &[u32], b: &[u32]) -> Vec<u32> {
    let mut out = Vec::with_capacity(a.len().min(b.len()));
    let (mut i, mut j) = (0, 0);
    while i < a.len() && j < b.len() {
        match a[i].cmp(&b[j]) {
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
            std::cmp::Ordering::Equal => {
                out.push(a[i]);
                i += 1;
                j += 1;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index() -> TrigramIndex {
        TrigramIndex::build([
            (0, vec!["fire bolt", "spell"]),
            (1, vec!["fireball", "spell"]),
            (2, vec!["wall of fire", "spell"]),
            (3, vec!["goblin", "monster"]),
        ])
    }

    fn tokens(words: &[&str]) -> Vec<String> {
        words.iter().map(|word| (*word).to_string()).collect()
    }

    #[test]
    fn a_text_yields_one_gram_per_window_and_widths_never_collide() {
        assert_eq!(grams("abcd", 3).count(), 2);
        assert_eq!(grams("abcd", 2).count(), 3);
        assert_eq!(grams("ab", 3).count(), 0);
        assert_ne!(grams("abc", 3).next(), grams("abd", 3).next());
        assert_ne!(grams("ab", 2).next(), grams("ab\u{0}", 3).next());
    }

    #[test]
    fn candidates_contain_every_id_whose_fields_hold_the_token() {
        assert_eq!(index().candidates(&tokens(&["fire"])), Some(vec![0, 1, 2]));
        assert_eq!(index().candidates(&tokens(&["bolt"])), Some(vec![0]));
        assert_eq!(index().candidates(&tokens(&["spell"])), Some(vec![0, 1, 2]));
    }

    #[test]
    fn every_token_must_be_possible() {
        assert_eq!(
            index().candidates(&tokens(&["fire", "ball"])),
            Some(vec![1])
        );
        assert_eq!(
            index().candidates(&tokens(&["fire", "goblin"])),
            Some(vec![])
        );
        assert_eq!(index().candidates(&tokens(&["zzz"])), Some(vec![]));
    }

    #[test]
    fn two_letter_tokens_narrow_by_bigram_and_single_letters_say_nothing() {
        assert_eq!(index().candidates(&tokens(&["fi"])), Some(vec![0, 1, 2]));
        assert_eq!(index().candidates(&tokens(&["bo"])), Some(vec![0]));
        assert_eq!(index().candidates(&tokens(&["f"])), None);
        assert_eq!(index().candidates(&tokens(&["f", "bolt"])), Some(vec![0]));
    }

    #[test]
    fn a_gram_may_span_a_space_and_still_be_a_superset() {
        // "e b" occurs in "fire bolt"; the ranker, not the index, decides
        // whether "e b" matches a field.
        assert_eq!(index().candidates(&tokens(&["e b"])), Some(vec![0]));
    }
}
