"""SpecializationAgent — reads the corpus and writes its own expert persona.

When documents are uploaded, this agent samples the corpus, asks the edge
model to identify the domain, then generates a first-person expert persona
and a tailored system prompt. The persona is persisted and broadcast to the UI.
"""
from __future__ import annotations

import json
import re

from .. import config, events
from ..core import document_store
from ..llm import local_llm

_ANALYSIS_PROMPT = """You are analysing a document corpus to decide what kind of expert assistant should answer questions about it.

Here are excerpts from the documents:
{samples}

Respond ONLY with a compact JSON object, no markdown, in exactly this shape:
{{"domain": "<short domain name, e.g. Municipal Government>",
  "persona": "<one vivid first-person sentence, e.g. 'I am a municipal records specialist with deep knowledge of OPRA compliance and public records law.'>",
  "expertise": "<comma-separated list of 3-5 specific areas of expertise>"}}"""


def _extract_json(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _build_system_prompt(domain: str, persona: str, expertise: str) -> str:
    return (
        f"{persona} You specialise in {domain}. Your areas of expertise include "
        f"{expertise}. Answer questions precisely and only from the provided "
        f"document context. When information differs across document versions, "
        f"note which version and date each fact comes from. If the context does "
        f"not contain the answer, say so clearly rather than guessing."
    )


class SpecializationAgent:
    """Generates and maintains the corpus expert persona."""

    def should_respecialize(self, prev_doc_count: int) -> bool:
        current = document_store.document_count()
        persona = document_store.get_latest_persona()
        if persona is None:
            return current > 0
        if current == 0:
            return False
        growth = (current - prev_doc_count) / max(1, prev_doc_count)
        return growth >= config.RESPECIALIZE_GROWTH_RATIO

    def analyze_corpus(self) -> dict | None:
        """Analyse the corpus and persist a new persona. Returns the persona dict."""
        samples = document_store.sample_corpus()
        if not samples:
            return None

        events.emit("agent_thinking", agent="SpecializationAgent",
                    message="Reading the corpus to specialise…")

        sample_text = "\n\n".join(
            f"[{s['title']} {s['version']}]\n{s['excerpt']}" for s in samples
        )
        prompt = _ANALYSIS_PROMPT.format(samples=sample_text[:6000])

        try:
            raw = local_llm.generate_raw(prompt, num_predict=300, temperature=0.3)
        except local_llm.LocalLLMError:
            raw = ""

        parsed = _extract_json(raw) or {}
        domain = (parsed.get("domain") or "General Knowledge").strip()
        persona = (parsed.get("persona")
                   or "I am a knowledgeable document analyst.").strip()
        expertise = (parsed.get("expertise") or "document analysis").strip()

        system_prompt = _build_system_prompt(domain, persona, expertise)
        doc_count = document_store.document_count()
        document_store.save_persona(domain, persona, system_prompt, doc_count)

        events.emit(
            "persona_updated",
            agent="SpecializationAgent",
            domain=domain,
            persona=persona,
            expertise=expertise,
            doc_count=doc_count,
        )
        return {
            "domain": domain, "persona": persona,
            "expertise": expertise, "system_prompt": system_prompt,
            "doc_count": doc_count,
        }

    def current_system_prompt(self) -> str | None:
        persona = document_store.get_latest_persona()
        return persona.system_prompt if persona else None
