"""VersionPatrolAgent — background agent that watches for new document versions.

Runs as an asyncio task started at app startup. Every PATROL_INTERVAL_SECONDS
it scans for document titles with multiple versions, diffs any version pair it
has not yet alerted on, summarises the change with the edge model, stores an
alert, and pushes a real-time toast to the UI.
"""
from __future__ import annotations

import asyncio

from .. import config, events
from ..core import diff_engine, document_store
from ..llm import local_llm

_SUMMARY_PROMPT = """Two versions of the document "{title}" were compared.

Here are the textual changes between the old version ({old_v}) and the new version ({new_v}):
{changes}

In one or two concise sentences, summarise what changed in plain language for a busy reader. Focus on concrete facts (numbers, dates, rules). Do not add anything not present in the changes."""


class VersionPatrolAgent:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._running = True
            self._task = asyncio.create_task(self.patrol_loop())

    def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()

    async def patrol_loop(self) -> None:
        # First sweep shortly after startup so existing multi-version docs alert.
        await asyncio.sleep(3)
        while self._running:
            try:
                await self.check_for_new_versions()
            except Exception as exc:  # noqa: BLE001 - loop must survive errors
                await events.aemit("agent_error", agent="VersionPatrolAgent",
                                   message=str(exc))
            await asyncio.sleep(config.PATROL_INTERVAL_SECONDS)

    async def check_for_new_versions(self) -> None:
        titles = {d.title for d in document_store.list_documents()}
        for title in titles:
            versions = document_store.get_versions(title)
            if len(versions) < 2:
                continue
            # Compare consecutive versions (chronological order).
            for old, new in zip(versions, versions[1:]):
                if document_store.alert_exists(title, old.version, new.version):
                    continue
                await self._process_pair(title, old, new)

    async def _process_pair(self, title, old, new) -> None:
        await events.aemit("agent_thinking", agent="VersionPatrolAgent",
                           message=f"New version of '{title}' detected — diffing…")

        diff = diff_engine.diff_versions(old.content, new.content)
        changes = diff_engine.changes_for_summary(diff)

        # Summarise the change with the edge model (runs in a thread).
        prompt = _SUMMARY_PROMPT.format(
            title=title, old_v=old.version, new_v=new.version, changes=changes
        )
        try:
            summary = await asyncio.to_thread(
                local_llm.generate_raw, prompt, None, 160, 0.3
            )
        except local_llm.LocalLLMError:
            summary = changes[:300]
        summary = summary.strip() or "Document content changed between versions."

        document_store.add_alert(title, old.version, new.version, summary)

        await events.aemit(
            "version_alert",
            agent="VersionPatrolAgent",
            doc_title=title,
            old_version=old.version,
            new_version=new.version,
            change_summary=summary,
            similarity=diff.similarity,
        )
