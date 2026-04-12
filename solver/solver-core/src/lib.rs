//! solver-core — pure Rust solver logic. No Python, no PyO3.

#![deny(missing_docs)]

/// Reverse the characters in a string.
pub fn reverse_chars(s: &str) -> String {
    s.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reverses_hello() {
        assert_eq!(reverse_chars("hello"), "olleh");
    }

    #[test]
    fn reverses_empty() {
        assert_eq!(reverse_chars(""), "");
    }

    #[test]
    fn reverses_unicode() {
        assert_eq!(reverse_chars("äöü"), "üöä");
    }
}
