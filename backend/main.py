"""CorpusAgent FastAPI application — REST + WebSocket wiring all four agents."""
from __future__ import annotations

import asyncio
import io
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, events
from .agents.query_decomp import QueryDecompositionAgent
from .agents.specialization import SpecializationAgent
from .agents.version_patrol import VersionPatrolAgent
from .core import document_store
from .core import embedder
from .llm import cloud_llm

specialization_agent = SpecializationAgent()
patrol_agent = VersionPatrolAgent()
query_agent = QueryDecompositionAgent()


@asynccontextmanager
async def lifespan(app: FastAPI):
    document_store.init_db()
    events.set_loop(asyncio.get_running_loop())
    patrol_agent.start()  # VersionPatrolAgent starts automatically
    await events.aemit("system_ready", message="CorpusAgent backend online.")
    yield
    patrol_agent.stop()


app = FastAPI(title="CorpusAgent", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _chunk_text(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    size, overlap = config.CHUNK_SIZE, config.CHUNK_OVERLAP
    step = max(1, size - overlap)
    chunks = []
    for start in range(0, len(text), step):
        window = text[start:start + size].strip()
        if window:
            chunks.append(window)
        if start + size >= len(text):
            break
    return chunks


def _extract_text(filename: str, raw: bytes) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".txt"):
        return raw.decode("utf-8", errors="replace")
    if lower.endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise HTTPException(500, f"pypdf not installed: {exc}")
        reader = PdfReader(io.BytesIO(raw))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    raise HTTPException(400, "Only .pdf and .txt files are supported")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class QueryRequest(BaseModel):
    query: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.post("/upload")
async def upload(
    file: UploadFile = File(...),
    title: str = Form(...),
    version: str = Form("v1"),
    date: str = Form(""),
    sensitive: bool = Form(False),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")

    text = _extract_text(file.filename, raw)
    chunks = _chunk_text(text)
    if not chunks:
        raise HTTPException(400, "No extractable text found in document")

    timestamp = date or datetime.now(timezone.utc).isoformat()
    prev_count = document_store.document_count()

    try:
        embeddings = embedder.embed_batch(chunks)
    except embedder.EmbeddingError as exc:
        raise HTTPException(503, str(exc))

    doc_id = document_store.add_document(
        title=title, version=version, timestamp=timestamp, content=text,
        is_sensitive=sensitive, source_file=file.filename,
    )
    document_store.add_chunks(doc_id, version, timestamp, chunks, embeddings,
                              is_sensitive=sensitive)

    await events.aemit("document_uploaded", title=title, version=version,
                       sensitive=sensitive, chunks=len(chunks))

    # SpecializationAgent runs (off the event loop) when the corpus warrants it.
    if specialization_agent.should_respecialize(prev_count):
        asyncio.create_task(asyncio.to_thread(specialization_agent.analyze_corpus))

    return {"id": doc_id, "title": title, "version": version,
            "sensitive": sensitive, "chunks": len(chunks)}


@app.post("/query")
async def query(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty")
    if document_store.document_count() == 0:
        raise HTTPException(400, "No documents uploaded yet")

    system_prompt = specialization_agent.current_system_prompt()
    try:
        result = await asyncio.to_thread(
            query_agent.answer_query, req.query, system_prompt
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, f"Query failed: {exc}")

    from dataclasses import asdict
    payload = asdict(result)
    await events.aemit("query_complete", route=result.route,
                       intent=result.intent, latency_ms=result.latency_ms)
    return JSONResponse(payload)


@app.get("/documents")
def documents():
    docs = document_store.list_documents()
    grouped: dict[str, list[dict]] = {}
    for d in docs:
        grouped.setdefault(d.title, []).append({
            "id": d.id, "version": d.version, "timestamp": d.timestamp,
            "sensitive": d.is_sensitive, "superseded_by": d.superseded_by,
            "source_file": d.source_file,
        })
    return [
        {"title": title,
         "versions": sorted(vers, key=lambda v: v["timestamp"]),
         "sensitive": any(v["sensitive"] for v in vers)}
        for title, vers in grouped.items()
    ]


@app.get("/documents/{doc_id}/versions")
def document_versions(doc_id: str):
    doc = document_store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return [
        {"id": d.id, "version": d.version, "timestamp": d.timestamp,
         "sensitive": d.is_sensitive, "content": d.content}
        for d in document_store.get_versions(doc.title)
    ]


@app.get("/persona")
def persona():
    p = document_store.get_latest_persona()
    if not p:
        return JSONResponse({"persona": None})
    return {"domain": p.domain, "persona": p.persona,
            "system_prompt": p.system_prompt, "generated_at": p.generated_at,
            "doc_count": p.doc_count}


@app.get("/alerts")
def alerts(unseen_only: bool = False):
    return [
        {"id": a.id, "doc_title": a.doc_title, "old_version": a.old_version,
         "new_version": a.new_version, "change_summary": a.change_summary,
         "created_at": a.created_at, "seen": a.seen}
        for a in document_store.list_alerts(unseen_only=unseen_only)
    ]


@app.post("/alerts/{alert_id}/seen")
def mark_seen(alert_id: int):
    if not document_store.mark_alert_seen(alert_id):
        raise HTTPException(404, "Alert not found")
    return {"seen": alert_id}


@app.get("/status")
def status():
    ollama_ok, models = False, []
    try:
        import requests
        resp = requests.get(f"{config.OLLAMA_HOST}/api/tags", timeout=5)
        resp.raise_for_status()
        models = [m["name"] for m in resp.json().get("models", [])]
        ollama_ok = True
    except Exception:  # noqa: BLE001
        ollama_ok = False
    return {
        "ollama_running": ollama_ok,
        "local_model_ready": any(config.LOCAL_LLM_MODEL in m for m in models),
        "embed_model_ready": any(config.EMBED_MODEL in m for m in models),
        "local_model": config.LOCAL_LLM_MODEL,
        "cloud_configured": cloud_llm.is_configured(),
        "cloud_model": config.CLOUD_LLM_MODEL,
        "gpu": _gpu_info(),
        "documents": document_store.document_count(),
        "patrol_interval_s": config.PATROL_INTERVAL_SECONDS,
    }


def _gpu_info():
    import shutil
    import subprocess
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.check_output(
            ["nvidia-smi",
             "--query-gpu=name,memory.total,memory.used,utilization.gpu",
             "--format=csv,noheader,nounits"],
            text=True, timeout=5).strip()
        name, mt, mu, util = [p.strip() for p in out.split(",")]
        return {"name": name, "memory_total_mb": int(mt),
                "memory_used_mb": int(mu), "utilization_pct": int(util)}
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    queue = events.subscribe()
    try:
        # Replay recent events so a fresh client catches up.
        for message in events.recent_events():
            await ws.send_json(message)
        while True:
            message = await queue.get()
            await ws.send_json(message)
    except WebSocketDisconnect:
        pass
    finally:
        events.unsubscribe(queue)


# ---------------------------------------------------------------------------
# Optional: serve built frontend (production)
# ---------------------------------------------------------------------------
_DIST = config.ROOT_DIR / "frontend" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(_DIST / "index.html")
