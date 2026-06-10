"""Temporal intent detection and lightweight query analysis."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .. import config

_YEAR = re.compile(r"\b(19|20)\d{2}\b")
_CHANGE_WORDS = [
    "change", "changed", "differ", "different", "evolve", "evolved",
    "compare", "comparison", "versus", "vs", "diff", "difference",
    "update", "updated", "revise", "revised", "history",
]


@dataclass(frozen=True)
class QueryIntent:
    is_temporal: bool
    is_change_query: bool
    is_complex: bool
    years: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    intent_label: str = "factual lookup"


def _extract_years(query: str) -> list[str]:
    return sorted({m.group(0) for m in _YEAR.finditer(query)})


def _has_temporal_marker(q: str) -> bool:
    return any(m in q for m in config.TEMPORAL_MARKERS)


def is_complex(query: str) -> bool:
    q = query.lower()
    years = _extract_years(query)
    has_conj = any(c in q for c in config.CONJUNCTIONS)
    word_count = len(query.split())
    return (
        len(years) >= 2
        or (has_conj and _has_temporal_marker(q))
        or (word_count > config.COMPLEX_WORD_THRESHOLD and _has_temporal_marker(q))
    )


def parse(query: str) -> QueryIntent:
    q = query.lower()
    years = _extract_years(query)
    is_change = any(w in q for w in _CHANGE_WORDS)
    temporal = bool(years) or _has_temporal_marker(q)
    complex_ = is_complex(query)

    if complex_:
        label = "complex multi-part temporal"
    elif is_change:
        label = "version change / diff"
    elif temporal:
        label = "temporal lookup"
    else:
        label = "factual lookup"

    return QueryIntent(
        is_temporal=temporal,
        is_change_query=is_change,
        is_complex=complex_,
        years=years,
        topics=[],
        intent_label=label,
    )
