//! Error type for `solver-core`. Placement failures are not errors; they become
//! `Violation` entries inside `Solution`. `Error` is reserved for structural
//! problems in the input.

use thiserror::Error;

/// Errors returned by `solver-core`. Reserved for structural input problems;
/// placement failures live in `Solution::violations` instead.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum Error {
    /// The caller passed a `Problem` that cannot be solved because its shape is
    /// wrong (missing time blocks, duplicate IDs, unknown references, etc.).
    #[error("input: {0}")]
    Input(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_error_displays_with_prefix() {
        let e = Error::Input("missing time blocks".to_string());
        assert_eq!(format!("{e}"), "input: missing time blocks");
    }
}
