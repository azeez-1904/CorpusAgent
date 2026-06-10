"""Token-budget context compression (ported from PhaseRAG, query-aware).

Two modes:
- Positional (no query): keep sentences from the start until the budget is hit.
  Used for query-agnostic tasks like version-diff summarisation.
- Query-aware (query given): score each sentence by lexical overlap with the
  query (plus a small bonus for sentences containing numbers/currency, which
  usually carry the answer), keep the highest-scoring sentences within the
  budget, and re-emit them in their original order. This keeps the sentences
  that actually answer the question instead of leading boilerplate.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .. import config

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_WORD = re.compile(r"[a-z0-9$%]+")
_HAS_NUMBER = re.compile(r"[$%]|\d")

# Common words that carry little retrieval signal.
_STOPWORDS = frozenset(
    """a an the of to in on for and or is are was were be been being this that these those
    how what when who where which why did does do as at by with from into over under between
    change changed differ compare versus vs it its their there here""".split()
)


@dataclass(frozen=True)
class CompressionResult:
    text: str
    original_tokens: int
    compressed_tokens: int
    ratio: float


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // config.CHARS_PER_TOKEN)


def _split_sentences(text: str) -> list[str]:
    parts = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    return parts or ([text.strip()] if text.strip() else [])


def _terms(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOPWORDS and len(w) > 1}


def _stem(word: str) -> str:
    """Very light stemming: strip a trailing plural/inflection 's' or 'es'/'ing'."""
    for suffix in ("ing", "es", "s"):
        if len(word) > len(suffix) + 2 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _matches(query_term: str, sentence_terms: set[str], sentence_stems: set[str]) -> bool:
    if query_term in sentence_terms:
        return True
    qs = _stem(query_term)
    # Stem-equality (fee≈fees, appeal≈appeals, process≈processing) or 4-char prefix.
    if qs in sentence_stems:
        return True
    return any(
        len(qs) >= 4 and (st.startswith(qs[:4]) or qs.startswith(st[:4]))
        for st in sentence_stems
    )


def _score(sentence: str, query_terms: set[str]) -> float:
    s_terms = _terms(sentence)
    if not s_terms:
        return 0.0
    s_stems = {_stem(t) for t in s_terms}
    overlap = sum(1 for qt in query_terms if _matches(qt, s_terms, s_stems))
    # Small bonus for sentences with numbers/currency — they tend to hold the answer.
    number_bonus = 0.5 if _HAS_NUMBER.search(sentence) else 0.0
    return overlap + number_bonus


def _full(text: str, original_tokens: int) -> CompressionResult:
    return CompressionResult(text, original_tokens, original_tokens, 1.0)


def _finalize(kept: list[str], original_tokens: int) -> CompressionResult:
    compressed_text = " ".join(kept)
    compressed_tokens = estimate_tokens(compressed_text)
    ratio = round(compressed_tokens / original_tokens, 3) if original_tokens else 1.0
    return CompressionResult(compressed_text, original_tokens, compressed_tokens, ratio)


def compress(
    text: str,
    target_tokens: int | None = None,
    query: str | None = None,
) -> CompressionResult:
    target_tokens = target_tokens or config.COMPRESSION_TARGET_TOKENS
    original_tokens = estimate_tokens(text)
    if original_tokens <= target_tokens:
        return _full(text, original_tokens)

    sentences = _split_sentences(text)

    # --- Positional fallback (no query) ------------------------------------
    if not query:
        kept: list[str] = []
        budget = 0
        for sentence in sentences:
            cost = estimate_tokens(sentence)
            if budget + cost > target_tokens and kept:
                break
            kept.append(sentence)
            budget += cost
        return _finalize(kept, original_tokens)

    # --- Query-aware selection ---------------------------------------------
    query_terms = _terms(query)
    indexed = list(enumerate(sentences))
    # Highest score first; ties keep earlier sentences (stable on original index).
    ranked = sorted(indexed, key=lambda p: (_score(p[1], query_terms), -p[0]), reverse=True)

    selected: list[tuple[int, str]] = []
    budget = 0
    for idx, sentence in ranked:
        cost = estimate_tokens(sentence)
        if budget + cost > target_tokens and selected:
            continue  # skip; a smaller relevant sentence may still fit
        selected.append((idx, sentence))
        budget += cost
        if budget >= target_tokens:
            break

    if not selected:  # degenerate: everything over budget — keep best single
        selected = [ranked[0]]

    selected.sort(key=lambda p: p[0])  # restore reading order
    return _finalize([s for _, s in selected], original_tokens)
