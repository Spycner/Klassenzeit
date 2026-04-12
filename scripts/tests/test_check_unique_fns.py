"""Tests for the unique function names lint script."""

import ast
import textwrap

from scripts.check_unique_fns import Location, extract_python_names


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
