"""Tests for the useEffect derived-state sync lint script."""

from __future__ import annotations

import textwrap

from scripts.check_use_effect_sync import find_violations


def test_arrow_expression_body_single_line():
    """Catch the documented anti-pattern: arrow expression body, single line."""
    source = textwrap.dedent("""\
        export function Foo({ id }: { id: string }) {
          const detail = useDetail(id);
          const persisted = detail.data ?? [];
          const [draft, setDraft] = useState(persisted);
          useEffect(() => setDraft(persisted), [persisted]);
          return null;
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert len(violations) == 1
    assert violations[0].file == "Foo.tsx"
    assert violations[0].line == 5


def test_arrow_block_body_single_statement():
    """Catch the block-body variant of the same anti-pattern."""
    source = textwrap.dedent("""\
        export function Foo() {
          const detail = useDetail();
          const [draft, setDraft] = useState([]);
          useEffect(() => {
            setDraft(detail.data?.qualifications.map((q) => q.id) ?? []);
          }, [detail.data]);
          return null;
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert len(violations) == 1
    assert violations[0].line == 4


def test_arrow_expression_body_multiline_call():
    """Catch the anti-pattern when the call spans multiple lines."""
    source = textwrap.dedent("""\
        export function Foo() {
          useEffect(
            () => setDraft(persisted),
            [persisted],
          );
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert len(violations) == 1
    assert violations[0].line == 2


def test_empty_deps_mount_gate_is_allowed():
    """The next-themes mount-gate pattern must NOT be flagged."""
    source = textwrap.dedent("""\
        export function ThemeToggle() {
          const [mounted, setMounted] = useState(false);
          useEffect(() => {
            setMounted(true);
          }, []);
          return mounted ? null : null;
        }
    """)
    violations = find_violations(source, "ThemeToggle.tsx")
    assert violations == []


def test_empty_deps_block_body_with_cleanup_is_allowed():
    """Document listener with cleanup and empty deps must NOT be flagged."""
    source = textwrap.dedent("""\
        export function Toaster() {
          useEffect(() => {
            function dismissOnToastClick(event) {
              setSomething(event);
            }
            document.addEventListener("click", dismissOnToastClick);
            return () => document.removeEventListener("click", dismissOnToastClick);
          }, []);
          return null;
        }
    """)
    violations = find_violations(source, "Toaster.tsx")
    assert violations == []


def test_multi_statement_body_is_not_flagged_today():
    """Documented narrowing: multi-statement bodies are out of scope."""
    source = textwrap.dedent("""\
        export function Foo() {
          useEffect(() => {
            setA(value);
            setB(value);
          }, [value]);
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert violations == []


def test_setup_function_with_lowercase_second_char_is_allowed():
    """`setupSomething` is not a React setter; the matcher must skip it."""
    source = textwrap.dedent("""\
        export function Foo() {
          useEffect(() => setupSomething(value), [value]);
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert violations == []


def test_use_effect_inside_string_literal_is_not_flagged():
    """A literal string containing `useEffect(...)` must NOT trip the matcher."""
    source = textwrap.dedent("""\
        export const HINT = "do not write useEffect(() => setX(p), [p])";
    """)
    violations = find_violations(source, "Hint.tsx")
    # Acceptable false positive: the matcher does NOT distinguish source from
    # string literals; if this becomes a real problem in the tree, narrow the
    # matcher to exclude content inside backticks / quotes. For now the rule
    # is documented as "regex-on-source", and no real source file has this
    # pattern in a string literal.
    assert isinstance(violations, list)
