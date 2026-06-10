"""In-process async event bus that fans out agent events to WebSocket clients.

Agents call `emit(...)` (sync) or `aemit(...)` (async) to publish an event.
The FastAPI WebSocket endpoint subscribes a queue and streams events to the UI.
A small ring buffer of recent events lets a freshly-connected client catch up.
"""
from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import Any

_subscribers: set[asyncio.Queue] = set()
_recent: deque[dict] = deque(maxlen=50)
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Record the main event loop so sync code (threads) can publish safely."""
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def recent_events() -> list[dict]:
    return list(_recent)


def _build(event: str, payload: dict[str, Any]) -> dict:
    return {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload,
    }


async def aemit(event: str, **payload: Any) -> None:
    """Publish an event from async code."""
    message = _build(event, payload)
    _recent.append(message)
    for q in list(_subscribers):
        await q.put(message)


def emit(event: str, **payload: Any) -> None:
    """Publish an event from sync code (e.g. a background thread).

    Safe to call whether or not an event loop is running.
    """
    message = _build(event, payload)
    _recent.append(message)
    if _loop and _loop.is_running():
        asyncio.run_coroutine_threadsafe(_fanout(message), _loop)
    else:  # no loop yet — event is still captured in the ring buffer
        pass


async def _fanout(message: dict) -> None:
    for q in list(_subscribers):
        await q.put(message)
