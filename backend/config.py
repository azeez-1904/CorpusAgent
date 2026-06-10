"""Central configuration for CorpusAgent.

Secrets are read from environment variables only — never hardcoded.
"""
from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths (pathlib throughout for Windows compatibility)
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent

# Load secrets from a local .env (never committed) before any os.getenv below.
try:
    from dotenv import load_dotenv

    load_dotenv(ROOT_DIR / ".env")
except ImportError:  # python-dotenv optional; env vars still work without it
    pass

DATA_DIR = ROOT_DIR / "data"
DOCUMENTS_DIR = DATA_DIR / "documents"
DB_PATH = DATA_DIR / "corpusagent.db"

DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Ollama (edge)
# ---------------------------------------------------------------------------
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
EMBED_MODEL = os.getenv("CORPUS_EMBED_MODEL", "nomic-embed-text")
LOCAL_LLM_MODEL = os.getenv("CORPUS_LOCAL_MODEL", "qwen2.5:7b")
LOCAL_LLM_TIMEOUT = int(os.getenv("CORPUS_LOCAL_TIMEOUT", "120"))

# ---------------------------------------------------------------------------
# Qwen Cloud (DashScope)
# ---------------------------------------------------------------------------
QWEN_API_KEY = os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
CLOUD_LLM_MODEL = os.getenv("CORPUS_CLOUD_MODEL", "qwen-plus")
# DashScope region endpoint. International (Singapore) accounts must use the
# intl URL; mainland-China accounts use https://dashscope.aliyuncs.com/api/v1.
DASHSCOPE_BASE_URL = os.getenv(
    "DASHSCOPE_BASE_URL", "https://dashscope-intl.aliyuncs.com/api/v1"
)

# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
CHUNK_SIZE = int(os.getenv("CORPUS_CHUNK_SIZE", "900"))       # characters
CHUNK_OVERLAP = int(os.getenv("CORPUS_CHUNK_OVERLAP", "150"))  # characters

# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
TOP_K = int(os.getenv("CORPUS_TOP_K", "5"))

# ---------------------------------------------------------------------------
# Compression
# ---------------------------------------------------------------------------
CHARS_PER_TOKEN = 4
COMPRESSION_TARGET_TOKENS = int(os.getenv("CORPUS_COMPRESS_TOKENS", "300"))

# ---------------------------------------------------------------------------
# VersionPatrolAgent
# ---------------------------------------------------------------------------
PATROL_INTERVAL_SECONDS = int(os.getenv("CORPUS_PATROL_INTERVAL", "30"))

# ---------------------------------------------------------------------------
# SpecializationAgent
# ---------------------------------------------------------------------------
RESPECIALIZE_GROWTH_RATIO = 0.20  # respecialize if corpus grows > 20%

# ---------------------------------------------------------------------------
# EscalationAgent confidence heuristics
# ---------------------------------------------------------------------------
LOW_CONFIDENCE_PHRASES = [
    "i'm not sure", "im not sure", "i am not sure", "i don't know",
    "i do not know", "unclear", "cannot determine", "can't determine",
    "insufficient information", "not enough information", "no information",
    "the context does not", "context doesn't", "not mentioned", "not specified",
    # Hedging that signals the local model lacks grounding to answer well.
    "no specific information", "does not specify", "does not provide",
    "doesn't specify", "doesn't provide", "cannot provide", "can't provide",
    "without additional information", "without more information",
    "does not mention", "no details", "not enough detail",
]
MIN_CONFIDENT_WORDS = 20

# ---------------------------------------------------------------------------
# QueryDecompositionAgent complexity heuristics
# ---------------------------------------------------------------------------
TEMPORAL_MARKERS = [
    "from", "to", "between", "since", "until", "before", "after",
    "changed", "change", "evolve", "evolved", "history", "over time",
    "compare", "versus", "vs", "previously", "now", "current", "original",
]
CONJUNCTIONS = [" and ", " or ", " vs ", " versus "]
COMPLEX_WORD_THRESHOLD = 15
