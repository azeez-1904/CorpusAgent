"""Cloud inference via Qwen Cloud (Alibaba Cloud DashScope).

API key is read from QWEN_API_KEY / DASHSCOPE_API_KEY via config — never hardcoded.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from .. import config

_DEFAULT_SYSTEM = (
    "You are a helpful document assistant. Answer based only on the provided "
    "context. If the answer is not in the context, say you cannot find it."
)


class CloudLLMError(RuntimeError):
    """Raised when the Qwen Cloud request fails or no API key is configured."""


@dataclass(frozen=True)
class LLMResult:
    answer: str
    model: str
    latency_ms: int
    tokens_used: int
    route: str = "cloud"


def is_configured() -> bool:
    return bool(config.QWEN_API_KEY)


def query(
    question: str,
    context: str,
    system_prompt: str | None = None,
    model: str | None = None,
) -> LLMResult:
    if not is_configured():
        raise CloudLLMError("QWEN_API_KEY is not set — cannot reach Qwen Cloud.")
    try:
        import dashscope
        from dashscope import Generation
    except ImportError as exc:
        raise CloudLLMError("dashscope not installed. Run: pip install dashscope") from exc

    # Point the SDK at the configured region endpoint (intl by default).
    dashscope.base_http_api_url = config.DASHSCOPE_BASE_URL

    model = model or config.CLOUD_LLM_MODEL
    messages = [
        {"role": "system", "content": system_prompt or _DEFAULT_SYSTEM},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]
    start = time.perf_counter()
    response = Generation.call(
        model=model, messages=messages,
        api_key=config.QWEN_API_KEY, result_format="message",
    )
    latency_ms = int((time.perf_counter() - start) * 1000)

    if getattr(response, "status_code", 200) != 200:
        raise CloudLLMError(
            f"Qwen Cloud error {getattr(response, 'status_code', '?')}: "
            f"{getattr(response, 'message', 'unknown error')}"
        )
    answer = _extract_text(response).strip()
    tokens = _extract_tokens(response)
    if not answer:
        raise CloudLLMError("Qwen Cloud returned an empty response")
    return LLMResult(answer=answer, model=model, latency_ms=latency_ms,
                     tokens_used=tokens, route="cloud")


def _extract_text(response) -> str:
    output = getattr(response, "output", None)
    if output is None:
        return ""
    choices = getattr(output, "choices", None)
    if choices:
        return choices[0]["message"]["content"]
    return getattr(output, "text", "") or ""


def _extract_tokens(response) -> int:
    usage = getattr(response, "usage", None)
    if not usage:
        return 0
    total = getattr(usage, "total_tokens", None)
    if total is not None:
        return int(total)
    return int(getattr(usage, "input_tokens", 0) or 0) + int(getattr(usage, "output_tokens", 0) or 0)
