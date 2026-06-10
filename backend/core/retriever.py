"""Temporal cosine-similarity retrieval over chunk embeddings (pure numpy).

Supports optional filtering by a target year/date so the
QueryDecompositionAgent can scope a sub-query to a point in time.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

from .. import config
from .document_store import Chunk


@dataclass(frozen=True)
class ScoredChunk:
    chunk: Chunk
    score: float


def _cosine(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    qn = np.linalg.norm(query)
    mn = np.linalg.norm(matrix, axis=1)
    denom = mn * qn
    denom[denom == 0] = 1e-10
    return (matrix @ query) / denom


def _matches_year(chunk: Chunk, year: Optional[str]) -> bool:
    if not year:
        return True
    return year in (chunk.timestamp or "") or year in (chunk.version or "")


def retrieve(
    query_embedding: np.ndarray,
    chunks: list[Chunk],
    top_k: int | None = None,
    year: Optional[str] = None,
    include_sensitive: bool = True,
) -> list[ScoredChunk]:
    """Top-k most similar chunks, optionally filtered by year and sensitivity."""
    pool = [
        c for c in chunks
        if (include_sensitive or not c.is_sensitive) and _matches_year(c, year)
    ]
    # If a year filter removes everything, fall back to the full pool.
    if year and not pool:
        pool = [c for c in chunks if include_sensitive or not c.is_sensitive]
    if not pool:
        return []

    top_k = top_k or config.TOP_K
    matrix = np.vstack([c.embedding for c in pool])
    scores = _cosine(query_embedding, matrix)
    order = np.argsort(scores)[::-1][:top_k]
    return [ScoredChunk(chunk=pool[i], score=float(scores[i])) for i in order]
