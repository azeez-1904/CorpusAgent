"""Semantic version diff engine.

Produces a structured, word-level diff between two document versions so the
frontend DiffViewer can render red (removed) / green (added) / gray (unchanged)
segments. Also exposes a compact textual change list for LLM summarisation.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass

_TOKEN = re.compile(r"\S+\s*")


@dataclass(frozen=True)
class DiffSegment:
    kind: str  # "equal" | "added" | "removed"
    text: str


@dataclass(frozen=True)
class DiffResult:
    segments: list[DiffSegment]
    added_text: str
    removed_text: str
    similarity: float  # 0..1


def _tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text or "")


def diff_versions(old_text: str, new_text: str) -> DiffResult:
    """Word-level diff between two versions."""
    old_tokens = _tokenize(old_text)
    new_tokens = _tokenize(new_text)
    matcher = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)

    segments: list[DiffSegment] = []
    added_parts: list[str] = []
    removed_parts: list[str] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            segments.append(DiffSegment("equal", "".join(old_tokens[i1:i2])))
        elif tag == "delete":
            chunk = "".join(old_tokens[i1:i2])
            segments.append(DiffSegment("removed", chunk))
            removed_parts.append(chunk)
        elif tag == "insert":
            chunk = "".join(new_tokens[j1:j2])
            segments.append(DiffSegment("added", chunk))
            added_parts.append(chunk)
        elif tag == "replace":
            old_chunk = "".join(old_tokens[i1:i2])
            new_chunk = "".join(new_tokens[j1:j2])
            segments.append(DiffSegment("removed", old_chunk))
            segments.append(DiffSegment("added", new_chunk))
            removed_parts.append(old_chunk)
            added_parts.append(new_chunk)

    return DiffResult(
        segments=segments,
        added_text=" ".join(p.strip() for p in added_parts if p.strip()),
        removed_text=" ".join(p.strip() for p in removed_parts if p.strip()),
        similarity=round(matcher.ratio(), 3),
    )


def changes_for_summary(diff: DiffResult, max_chars: int = 1500) -> str:
    """A compact textual representation of changes for LLM summarisation."""
    lines = []
    if diff.removed_text:
        lines.append(f"REMOVED: {diff.removed_text[:max_chars]}")
    if diff.added_text:
        lines.append(f"ADDED: {diff.added_text[:max_chars]}")
    if not lines:
        lines.append("No textual changes detected.")
    return "\n".join(lines)
