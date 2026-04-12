//! solver-py — thin PyO3 wrapper over solver-core. Only glue lives here.

#![deny(missing_docs)]

use pyo3::prelude::*;

/// Reverse the characters in a string (PyO3 wrapper).
#[pyfunction]
fn reverse_chars(s: &str) -> String {
    solver_core::reverse_chars(s)
}

/// Python module exposing solver-core functions.
#[pymodule]
fn _rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(reverse_chars, m)?)?;
    Ok(())
}
