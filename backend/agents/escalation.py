"""EscalationAgent — wraps every LLM call with confidence-based escalation.

Tries the edge model first. If the local answer looks low-confidence
(too short or hedged), it escalates to Qwen Cloud and explains why.
Sensitive content is never escalated.
"""
from __future__ import annotations

from dataclasses import dataclass

from .. import config, events
from ..llm import cloud_llm, local_llm


@dataclass(frozen=True)
class EscalationResult:
    answer: str
    route: str            # "local" | "cloud"
    reason: str
    model: str
    latency_ms: int
    tokens_used: int
    escalated: bool


def is_low_confidence(answer: str) -> bool:
    """Heuristic: short or hedged answers are treated as low confidence."""
    text = (answer or "").lower()
    too_short = len(answer.split()) < config.MIN_CONFIDENT_WORDS
    hedged = any(p in text for p in config.LOW_CONFIDENCE_PHRASES)
    return too_short or hedged


def query_with_escalation(
    question: str,
    context: str,
    is_sensitive: bool,
    system_prompt: str | None = None,
    quiet: bool = False,
) -> EscalationResult:
    """Run a query through the edge model, escalating to cloud when warranted."""
    # --- Privacy hard-stop ---------------------------------------------------
    if is_sensitive:
        local = local_llm.query(question, context, system_prompt=system_prompt)
        reason = "🔒 Sensitive document — answered locally, never sent to cloud."
        if not quiet:
            events.emit("escalation_decision", agent="EscalationAgent",
                        route="local", reason=reason, sensitive=True)
        return EscalationResult(local.answer, "local", reason, local.model,
                                local.latency_ms, local.tokens_used, escalated=False)

    # --- Try edge first ------------------------------------------------------
    local = local_llm.query(question, context, system_prompt=system_prompt)

    if not is_low_confidence(local.answer):
        reason = "⚡ Confident local answer — kept on edge."
        if not quiet:
            events.emit("escalation_decision", agent="EscalationAgent",
                        route="local", reason=reason, sensitive=False)
        return EscalationResult(local.answer, "local", reason, local.model,
                                local.latency_ms, local.tokens_used, escalated=False)

    # --- Low confidence: escalate if cloud is available ----------------------
    if not cloud_llm.is_configured():
        reason = "Local answer was uncertain, but no Qwen Cloud key is set — kept local."
        if not quiet:
            events.emit("escalation_decision", agent="EscalationAgent",
                        route="local", reason=reason, sensitive=False)
        return EscalationResult(local.answer, "local", reason, local.model,
                                local.latency_ms, local.tokens_used, escalated=False)

    if not quiet:
        events.emit("agent_thinking", agent="EscalationAgent",
                    message="Local answer was uncertain — escalating to Qwen Cloud…")
    try:
        cloud = cloud_llm.query(question, context, system_prompt=system_prompt)
    except cloud_llm.CloudLLMError as exc:
        reason = f"Escalation attempted but cloud failed ({exc}); kept local answer."
        if not quiet:
            events.emit("escalation_decision", agent="EscalationAgent",
                        route="local", reason=reason, sensitive=False)
        return EscalationResult(local.answer, "local", reason, local.model,
                                local.latency_ms, local.tokens_used, escalated=False)

    reason = "☁️ Local answer was uncertain — escalated to Qwen Cloud (qwen-plus)."
    if not quiet:
        events.emit("escalation_decision", agent="EscalationAgent",
                    route="cloud", reason=reason, sensitive=False)
    return EscalationResult(cloud.answer, "cloud", reason, cloud.model,
                            cloud.latency_ms, cloud.tokens_used, escalated=True)
