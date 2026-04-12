"""Tests for the unique function names lint script."""

import ast
import textwrap

from scripts.check_unique_fns import (
    Location,
    extract_js_ts_names,
    extract_python_names,
    extract_rust_names,
    find_duplicates,
)


def test_extract_python_function():
    """Verify a simple function is extracted."""
    source = textwrap.dedent("""\
        def greet():
            pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert results == [Location("greet", "test.py", 1)]


def test_extract_python_async_function():
    """Verify async functions are extracted."""
    source = textwrap.dedent("""\
        async def fetch_data():
            pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert results == [Location("fetch_data", "test.py", 1)]


def test_extract_python_class_method():
    """Verify class methods are extracted."""
    source = textwrap.dedent("""\
        class Foo:
            def bar(self):
                pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert results == [Location("bar", "test.py", 2)]


def test_extract_python_skips_dunders():
    """Verify dunder methods are skipped."""
    source = textwrap.dedent("""\
        class Foo:
            def __init__(self):
                pass
            def __str__(self):
                pass
            def real_method(self):
                pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert len(results) == 1
    assert results[0].name == "real_method"


def test_extract_python_nested_function():
    """Verify nested functions are extracted."""
    source = textwrap.dedent("""\
        def outer():
            def inner():
                pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    names = [loc.name for loc in results]
    assert "outer" in names
    assert "inner" in names


def test_extract_rust_pub_fn():
    """Verify public Rust functions are extracted."""
    lines = ["pub fn reverse_chars(s: &str) -> String {"]
    results = extract_rust_names(lines, "lib.rs")
    assert results == [Location("reverse_chars", "lib.rs", 1)]


def test_extract_rust_private_fn():
    """Verify private Rust functions are extracted."""
    lines = ["fn helper() -> bool {"]
    results = extract_rust_names(lines, "lib.rs")
    assert results == [Location("helper", "lib.rs", 1)]


def test_extract_python_skips_main():
    """Verify main() is skipped as a conventional entry point."""
    source = textwrap.dedent("""\
        def main():
            pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "cli.py")
    assert results == []


def test_extract_rust_skips_main():
    """Verify Rust main() is skipped as a conventional entry point."""
    lines = ["fn main() {"]
    results = extract_rust_names(lines, "main.rs")
    assert results == []


def test_extract_rust_test_fn():
    """Verify Rust test functions are extracted (not skipped)."""
    lines = [
        "#[cfg(test)]",
        "mod tests {",
        "    #[test]",
        "    fn reverses_hello() {",
        "    }",
        "}",
    ]
    results = extract_rust_names(lines, "lib.rs")
    assert results == [Location("reverses_hello", "lib.rs", 4)]


def test_extract_js_function_declaration():
    """Verify JS function declarations are extracted."""
    lines = ["function fetchData() {"]
    results = extract_js_ts_names(lines, "api.ts")
    assert results == [Location("fetchData", "api.ts", 1)]


def test_extract_js_export_function():
    """Verify exported function declarations are extracted."""
    lines = ["export function handleSubmit(event) {"]
    results = extract_js_ts_names(lines, "form.ts")
    assert results == [Location("handleSubmit", "form.ts", 1)]


def test_extract_js_export_default_function():
    """Verify export default function declarations are extracted."""
    lines = ["export default function HomePage() {"]
    results = extract_js_ts_names(lines, "page.tsx")
    assert results == [Location("HomePage", "page.tsx", 1)]


def test_extract_js_async_function():
    """Verify async function declarations are extracted."""
    lines = ["async function loadUser() {"]
    results = extract_js_ts_names(lines, "user.ts")
    assert results == [Location("loadUser", "user.ts", 1)]


def test_extract_js_class_method():
    """Verify class method definitions are extracted."""
    lines = [
        "class UserService {",
        "  async getUserById(id) {",
        "  }",
        "}",
    ]
    results = extract_js_ts_names(lines, "service.ts")
    assert results == [Location("getUserById", "service.ts", 2)]


def test_extract_js_skips_anonymous():
    """Verify anonymous/arrow functions are not extracted."""
    lines = [
        "const handler = () => {",
        "const process = function() {",
    ]
    results = extract_js_ts_names(lines, "util.ts")
    assert results == []


def test_find_duplicates_no_dupes():
    """Verify no duplicates returns empty dict."""
    locations = [Location("foo", "a.py", 1), Location("bar", "b.py", 2)]
    assert find_duplicates(locations) == {}


def test_find_duplicates_cross_language():
    """Verify duplicates across languages are detected."""
    locations = [
        Location("get_session", "db/session.py", 19),
        Location("get_session", "api/session.ts", 12),
    ]
    result = find_duplicates(locations)
    assert "get_session" in result
    assert len(result["get_session"]) == 2


def test_find_duplicates_three_locations():
    """Verify a name appearing three times is reported with all locations."""
    locations = [
        Location("validate", "a.py", 1),
        Location("validate", "b.rs", 5),
        Location("validate", "c.ts", 10),
    ]
    result = find_duplicates(locations)
    assert len(result["validate"]) == 3
