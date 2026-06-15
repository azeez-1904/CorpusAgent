"""Content-based document relationships derived from chunk embeddings.

The knowledge graph used to infer relationships from shared *title* words, so
two files with identical content but different filenames showed up
disconnected. This module instead groups chunk embeddings by document title,
builds a normalized centroid per title, and returns pairwise cosine
similarities above a threshold — so links reflect actual content.

Calibrated against nomic-embed-text, where unrelated documents sit around
~0.62-0.65 cosine and near-identical documents score ~0.90+.
"""
from __future__ import annotations

from collections import defaultdict
from itertools import combinations

import numpy as np

from . import document_store

# Above the ~0.65 "unrelated" baseline → a meaningful topical link.
RELATED_THRESHOLD = 0.72
# Near-identical content → flag as a duplicate / version candidate.
DUPLICATE_THRESHOLD = 0.90


def _centroid(vectors: list[np.ndarray]) -> np.ndarray:
    """Mean of chunk vectors, L2-normalized (safe against a zero vector)."""
    mean = np.mean(np.vstack(vectors), axis=0)
    norm = np.linalg.norm(mean)
    return mean / (norm if norm else 1e-10)


def compute_relations(
    related_threshold: float = RELATED_THRESHOLD,
    duplicate_threshold: float = DUPLICATE_THRESHOLD,
) -> list[dict]:
    """Return content-similarity links between distinct document titles.

    Each item: {"a": title, "b": title, "score": float, "duplicate": bool}.
    Only pairs scoring at/above ``related_threshold`` are returned.
    """
    chunks = document_store.get_all_chunks(include_sensitive=True)

    by_title: dict[str, list[np.ndarray]] = defaultdict(list)
    for c in chunks:
        if c.embedding is not None and c.embedding.size:
            by_title[c.title].append(c.embedding)

    centroids = {title: _centroid(vs) for title, vs in by_title.items() if vs}

    relations: list[dict] = []
    for a, b in combinations(sorted(centroids), 2):
        sim = float(np.dot(centroids[a], centroids[b]))
        if sim >= related_threshold:
            relations.append({
                "a": a,
                "b": b,
                "score": round(sim, 3),
                "duplicate": sim >= duplicate_threshold,
            })
    return relations
