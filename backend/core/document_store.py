"""Versioned, temporal SQLite document store for CorpusAgent.

Tables: documents, chunks, embeddings, agent_persona, version_alerts.
Embeddings are stored as raw float32 bytes in a BLOB.
"""
from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from .. import config


# ---------------------------------------------------------------------------
# Dataclasses (immutable views)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Document:
    id: str
    title: str
    version: str
    timestamp: str
    content: str
    is_sensitive: bool
    superseded_by: Optional[str]
    domain: Optional[str]
    source_file: Optional[str]


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    doc_id: str
    version: str
    timestamp: str
    content: str
    chunk_index: int
    is_sensitive: bool
    embedding: np.ndarray
    title: str = ""


@dataclass(frozen=True)
class VersionAlert:
    id: int
    doc_title: str
    old_version: str
    new_version: str
    change_summary: str
    created_at: str
    seen: bool


@dataclass(frozen=True)
class Persona:
    id: int
    domain: str
    persona: str
    system_prompt: str
    generated_at: str
    doc_count: int


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id            TEXT PRIMARY KEY,
                title         TEXT,
                version       TEXT,
                timestamp     TEXT,
                content       TEXT,
                is_sensitive  INTEGER DEFAULT 0,
                superseded_by TEXT,
                domain        TEXT,
                source_file   TEXT
            );

            CREATE TABLE IF NOT EXISTS chunks (
                chunk_id     TEXT PRIMARY KEY,
                doc_id       TEXT,
                version      TEXT,
                timestamp    TEXT,
                content      TEXT,
                chunk_index  INTEGER,
                is_sensitive INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS embeddings (
                chunk_id  TEXT PRIMARY KEY,
                embedding BLOB
            );

            CREATE TABLE IF NOT EXISTS agent_persona (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                domain        TEXT,
                persona       TEXT,
                system_prompt TEXT,
                generated_at  TEXT,
                doc_count     INTEGER
            );

            CREATE TABLE IF NOT EXISTS version_alerts (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_title      TEXT,
                old_version    TEXT,
                new_version    TEXT,
                change_summary TEXT,
                created_at     TEXT,
                seen           INTEGER DEFAULT 0
            );
            """
        )


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
def add_document(
    title: str,
    version: str,
    timestamp: str,
    content: str,
    is_sensitive: bool = False,
    domain: Optional[str] = None,
    source_file: Optional[str] = None,
) -> str:
    """Insert a document version. Marks older versions of the same title as superseded."""
    doc_id = new_id()
    ts = timestamp or _now()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO documents
               (id, title, version, timestamp, content, is_sensitive,
                superseded_by, domain, source_file)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (doc_id, title, version, ts, content,
             1 if is_sensitive else 0, None, domain, source_file),
        )
        # Mark chronologically-earlier versions of the same title as superseded.
        conn.execute(
            """UPDATE documents
               SET superseded_by = ?
               WHERE title = ? AND id != ? AND timestamp < ?
                 AND superseded_by IS NULL""",
            (doc_id, title, doc_id, ts),
        )
    return doc_id


def add_chunks(
    doc_id: str,
    version: str,
    timestamp: str,
    texts: list[str],
    embeddings: list[np.ndarray],
    is_sensitive: bool = False,
) -> int:
    if len(texts) != len(embeddings):
        raise ValueError("texts and embeddings length mismatch")
    with _connect() as conn:
        for idx, (text, emb) in enumerate(zip(texts, embeddings)):
            cid = new_id()
            conn.execute(
                """INSERT INTO chunks
                   (chunk_id, doc_id, version, timestamp, content,
                    chunk_index, is_sensitive)
                   VALUES (?,?,?,?,?,?,?)""",
                (cid, doc_id, version, timestamp, text, idx,
                 1 if is_sensitive else 0),
            )
            conn.execute(
                "INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)",
                (cid, np.asarray(emb, dtype=np.float32).tobytes()),
            )
    return len(texts)


def list_documents() -> list[Document]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM documents ORDER BY title, timestamp").fetchall()
    return [_row_to_doc(r) for r in rows]


def get_document(doc_id: str) -> Optional[Document]:
    with _connect() as conn:
        r = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    return _row_to_doc(r) if r else None


def get_versions(title: str) -> list[Document]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM documents WHERE title = ? ORDER BY timestamp", (title,)
        ).fetchall()
    return [_row_to_doc(r) for r in rows]


def document_count() -> int:
    with _connect() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0])


def sample_corpus(max_docs: int = 10, chars_per_doc: int = 1200) -> list[dict]:
    """Return a content sample from each document title (latest version)."""
    samples = []
    seen_titles = set()
    for doc in sorted(list_documents(), key=lambda d: d.timestamp, reverse=True):
        if doc.title in seen_titles:
            continue
        seen_titles.add(doc.title)
        samples.append({
            "title": doc.title,
            "version": doc.version,
            "excerpt": doc.content[:chars_per_doc],
        })
        if len(samples) >= max_docs:
            break
    return samples


def _row_to_doc(r) -> Document:
    return Document(
        id=r[0], title=r[1], version=r[2], timestamp=r[3], content=r[4],
        is_sensitive=bool(r[5]), superseded_by=r[6], domain=r[7], source_file=r[8],
    )


# ---------------------------------------------------------------------------
# Chunks + embeddings
# ---------------------------------------------------------------------------
def get_all_chunks(include_sensitive: bool = True) -> list[Chunk]:
    query = """
        SELECT c.chunk_id, c.doc_id, c.version, c.timestamp, c.content,
               c.chunk_index, c.is_sensitive, e.embedding, d.title
        FROM chunks c
        JOIN embeddings e ON c.chunk_id = e.chunk_id
        JOIN documents d ON c.doc_id = d.id
    """
    if not include_sensitive:
        query += " WHERE c.is_sensitive = 0"
    with _connect() as conn:
        rows = conn.execute(query).fetchall()
    return [
        Chunk(
            chunk_id=r[0], doc_id=r[1], version=r[2], timestamp=r[3],
            content=r[4], chunk_index=r[5], is_sensitive=bool(r[6]),
            embedding=np.frombuffer(r[7], dtype=np.float32), title=r[8],
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Persona
# ---------------------------------------------------------------------------
def save_persona(domain: str, persona: str, system_prompt: str, doc_count: int) -> int:
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO agent_persona
               (domain, persona, system_prompt, generated_at, doc_count)
               VALUES (?,?,?,?,?)""",
            (domain, persona, system_prompt, _now(), doc_count),
        )
        return int(cur.lastrowid)


def get_latest_persona() -> Optional[Persona]:
    with _connect() as conn:
        r = conn.execute(
            "SELECT * FROM agent_persona ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if not r:
        return None
    return Persona(id=r[0], domain=r[1], persona=r[2], system_prompt=r[3],
                   generated_at=r[4], doc_count=r[5])


# ---------------------------------------------------------------------------
# Version alerts
# ---------------------------------------------------------------------------
def add_alert(doc_title: str, old_version: str, new_version: str,
              change_summary: str) -> int:
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO version_alerts
               (doc_title, old_version, new_version, change_summary, created_at, seen)
               VALUES (?,?,?,?,?,0)""",
            (doc_title, old_version, new_version, change_summary, _now()),
        )
        return int(cur.lastrowid)


def alert_exists(doc_title: str, old_version: str, new_version: str) -> bool:
    with _connect() as conn:
        r = conn.execute(
            """SELECT 1 FROM version_alerts
               WHERE doc_title=? AND old_version=? AND new_version=? LIMIT 1""",
            (doc_title, old_version, new_version),
        ).fetchone()
    return r is not None


def list_alerts(unseen_only: bool = False) -> list[VersionAlert]:
    query = "SELECT * FROM version_alerts"
    if unseen_only:
        query += " WHERE seen = 0"
    query += " ORDER BY id DESC"
    with _connect() as conn:
        rows = conn.execute(query).fetchall()
    return [
        VersionAlert(id=r[0], doc_title=r[1], old_version=r[2], new_version=r[3],
                     change_summary=r[4], created_at=r[5], seen=bool(r[6]))
        for r in rows
    ]


def mark_alert_seen(alert_id: int) -> bool:
    with _connect() as conn:
        cur = conn.execute("UPDATE version_alerts SET seen=1 WHERE id=?", (alert_id,))
        return cur.rowcount > 0
