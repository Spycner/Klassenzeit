//! solver-py — thin PyO3 wrapper over solver-core. Only glue lives here.

#![deny(missing_docs)]

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Solve a timetable problem supplied as a JSON string and return the resulting
/// Solution as a JSON string. Releases the GIL during the call so parallel
/// Python threads are not serialised behind the interpreter lock.
#[pyfunction]
#[pyo3(name = "solve_json")]
fn py_solve_json(py: Python<'_>, problem_json: &str) -> PyResult<String> {
    py.detach(|| solver_core::solve_json(problem_json))
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

/// Python module exposing solver-core functions.
#[pymodule]
fn _rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(py_solve_json, m)?)?;
    Ok(())
}
