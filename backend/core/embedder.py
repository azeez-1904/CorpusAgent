"""Embedding via nomic-embed-text served by Ollama (edge GPU)."""
from __future__ import annotations

import numpy as np
import requests

from .. import config


class EmbeddingError(RuntimeError):
    """Raised when the Ollama embedding endpoint fails."""


def _embed_one(text: str) -> np.ndarray:
    if not text or not text.strip():
        raise EmbeddingError("Cannot embed empty text")
    try:
        resp = requests.post(
            f"{config.OLLAMA_HOST}/api/embeddings",
            json={"model": config.EMBED_MODEL, "prompt": text},
            timeout=config.LOCAL_LLM_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise EmbeddingError(
            f"Ollama embedding request failed: {exc}. "
            f"Is Ollama running and is '{config.EMBED_MODEL}' pulled?"
        ) from exc
    embedding = resp.json().get("embedding")
    if not embedding:
        raise EmbeddingError(f"No embedding returned for model {config.EMBED_MODEL}")
    return np.asarray(embedding, dtype=np.float32)


def embed_text(text: str) -> np.ndarray:
    return _embed_one(text)


def embed_batch(texts: list[str]) -> list[np.ndarray]:
    return [_embed_one(t) for t in texts]


def embedding_dim() -> int:
    return int(_embed_one("dimension probe").shape[0])
