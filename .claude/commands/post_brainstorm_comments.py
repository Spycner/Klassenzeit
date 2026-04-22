#!/usr/bin/env python3
"""Post the autopilot brainstorm Q&A as PR comments.

Reads /tmp/kz-brainstorm/brainstorm.md, posts a preamble comment, then one
`gh pr comment` per `## Q…` / `## Decision` section so each self-answered
question lands as its own comment on the PR.

Usage:
    python3 .claude/commands/post_brainstorm_comments.py <pr-number>

Fails loudly if the PR number is missing or the brainstorm file does not exist.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

BRAINSTORM = Path("/tmp/kz-brainstorm/brainstorm.md")  # noqa: S108
HEADING_RE = re.compile(r"(?m)^(## (?:Q\d+\.|Decision).*)$")
EXPECTED_ARGC = 2


def main() -> int:
    """Split the brainstorm doc on Q/Decision headings and post each as a PR comment."""
    if len(sys.argv) != EXPECTED_ARGC or not sys.argv[1].isdigit():
        print("usage: post_brainstorm_comments.py <pr-number>", file=sys.stderr)
        return 2
    pr = sys.argv[1]

    gh = shutil.which("gh")
    if gh is None:
        print("gh CLI not found on PATH", file=sys.stderr)
        return 2

    if not BRAINSTORM.is_file():
        print(f"brainstorm file not found: {BRAINSTORM}", file=sys.stderr)
        return 2

    text = BRAINSTORM.read_text()
    first_heading = HEADING_RE.search(text)
    if not first_heading:
        print("no '## Q' or '## Decision' sections found", file=sys.stderr)
        return 1
    preamble = text[: first_heading.start()].rstrip()

    # HEADING_RE.split() with a capture group interleaves: ["", h1, body1, h2, body2, ...]
    sections: list[str] = []
    parts = HEADING_RE.split(text[first_heading.start() :])
    for i in range(1, len(parts), 2):
        heading = parts[i].rstrip()
        body = parts[i + 1] if i + 1 < len(parts) else ""
        sections.append(f"{heading}\n{body}".strip())

    intro = (
        "### Brainstorm Q&A thread\n\n"
        "Autopilot ran this PR end-to-end. Each of the following comments is one "
        "self-answered question from the brainstorm phase "
        "(`/tmp/kz-brainstorm/brainstorm.md`), kept sequential so later answers "
        "visibly depend on earlier decisions.\n\n"
        f"---\n\n{preamble}"
    )
    comments = [intro, *sections]

    for idx, body in enumerate(comments, 1):
        result = subprocess.run(  # noqa: S603
            [gh, "pr", "comment", pr, "--body", body],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            print(f"comment {idx} failed:\n{result.stderr}", file=sys.stderr)
            return 1
        print(f"posted {idx}/{len(comments)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
