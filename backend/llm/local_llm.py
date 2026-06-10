"""Edge inference via Ollama (qwen2.5:7b) on the local RTX GPU."""
from __future__ import annotations

import time
from dataclasses import dataclass

import requests

from .. import config

_DEFAULT_SYSTEM = (
    "You are a helpful document assistant. Answer using only the provided "
    "context. If the context is insufficient, say so briefly."
)


class LocalLLMError(RuntimeError):
    """Raised when the local Ollama generate endpoint fails."""


@dataclass(frozen=True)
class LLMResult:
    answer: str
    model: str
    latency_ms: int
    tokens_used: int
    route: str = "local"


def query(
    question: str,
    context: str,
    system_prompt: str | None = None,
    model: str | None = None,
    num_predict: int = 350,
) -> LLMResult:
    """Generate an answer locally with qwen2.5:7b via Ollama."""
    model = model or config.LOCAL_LLM_MODEL
    system = system_prompt or _DEFAULT_SYSTEM
    prompt = (
        f"{system}\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}\n\nAnswer:"
    )
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": num_predict, "temperature": 0.3},
    }
    start = time.perf_counter()
    try:
        resp = requests.post(
            f"{config.OLLAMA_HOST}/api/generate",
            json=payload, timeout=config.LOCAL_LLM_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise LocalLLMError(
            f"Ollama generate failed: {exc}. Is Ollama running and '{model}' pulled?"
        ) from exc

    latency_ms = int((time.perf_counter() - start) * 1000)
    data = resp.json()
    answer = (data.get("response") or "").strip()
    tokens_used = int(data.get("eval_count", 0)) + int(data.get("prompt_eval_count", 0))
    if not answer:
        raise LocalLLMError("Local model returned an empty response")
    return LLMResult(answer=answer, model=model, latency_ms=latency_ms,
                     tokens_used=tokens_used, route="local")


def generate_raw(prompt: str, model: str | None = None, num_predict: int = 400,
                 temperature: float = 0.4) -> str:
    """Free-form generation (no RAG template) for agent reasoning tasks."""
    model = model or config.LOCAL_LLM_MODEL
    payload = {
        "model": model, "prompt": prompt, "stream": False,
        "options": {"num_predict": num_predict, "temperature": temperature},
    }
    try:
        resp = requests.post(
            f"{config.OLLAMA_HOST}/api/generate",
            json=payload, timeout=config.LOCAL_LLM_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise LocalLLMError(f"Ollama generate failed: {exc}") from exc
    return (resp.json().get("response") or "").strip()
