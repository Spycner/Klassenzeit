//! solver-py — thin PyO3 wrapper over solver-core. Only glue lives here.

use pyo3::prelude::*;

#[pyfunction]
fn reverse_chars(s: &str) -> String {
    solver_core::reverse_chars(s)
}

#[pymodule]
fn _rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(reverse_chars, m)?)?;
    Ok(())
}
