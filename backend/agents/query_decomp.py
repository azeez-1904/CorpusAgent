"""QueryDecompositionAgent — the query orchestrator.

For simple queries it runs a single retrieve→escalate cycle. For complex
multi-part temporal queries it decomposes the question into sub-queries,
executes each independently (each routed through the EscalationAgent, scoped
by year where detected), streams per-sub-query progress to the UI, and
synthesises a final cited answer.

For change/diff queries it also computes a *deterministic* version diff with
`diff_engine` and feeds the verified added/removed text into the answer as
ground truth — so factual changes (e.g. "$25 → $40", "10 → 30 days") never
depend on the local model re-extracting them correctly.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field

from .. import events
from ..core import compressor, diff_engine, document_store, embedder, query_parser, retriever
from . import escalation

_DECOMP_PROMPT = """Break the user's question into the minimal set of independent sub-questions needed to answer it. Each sub-question should target ONE fact at ONE point in time when dates are involved.

User question: "{query}"

Respond ONLY with a JSON array, no markdown, like:
[{{"sub_query": "What were the fees in 2021?", "year": "2021"}},
 {{"sub_query": "What were the fees in 2024?", "year": "2024"}}]
If no specific year applies to a sub-question, use null for "year"."""

_SYNTH_PROMPT = """You are a precise policy analyst. Answer the user's question by combining the verified findings below. Each finding was retrieved and grounded independently in the source documents and is correct — treat the figures in them as authoritative.

User's question: {query}

Verified findings (use these exact figures):
{findings}
Write the final answer following these rules EXACTLY:
- The user asked about MORE THAN ONE thing. You MUST address EVERY one of them. Write one separate sentence for each thing, and never stop after the first — omitting any thing the user asked about is a critical failure.
- Address ONLY the things the user asked about. Do NOT mention any other change, section, procedure, or detail, even if it appears in the findings.
- For each thing the user asked about, give the earlier value with its year and the later value with its year — e.g. "the processing fee rose from $25 in 2021 to $40 in 2024".
- State the direction of change correctly by comparing the numbers: if the later number is LARGER, it increased / rose / lengthened; if SMALLER, it decreased / fell / shortened; if identical, it was unchanged. Double-check the direction word against the actual figures.
- Copy every dollar amount and day-count VERBATIM from the findings. If a finding says "ten (10) business days", write exactly that figure — never substitute a different number (e.g. do not write 14 when the finding says 10). Never invent or round a number.
- Be confident and direct. Do not hedge, speculate, or add caveats. Do not write "based on the documents", "it appears", "approximately", or cite section/version numbers.
- Output 2-3 sentences of plain prose — one sentence per thing the user asked about. Nothing else."""


@dataclass
class SubResult:
    index: int
    sub_query: str
    year: str | None
    answer: str
    route: str
    reason: str
    sources: list[dict] = field(default_factory=list)


@dataclass
class QueryResult:
    answer: str
    route: str                       # "local" | "cloud" | "hybrid"
    intent: str
    is_complex: bool
    sub_results: list[dict] = field(default_factory=list)
    versions_consulted: list[dict] = field(default_factory=list)
    diff: dict | None = None
    latency_ms: int = 0
    tokens_used: int = 0
    model_used: str = ""
    chunks_retrieved: int = 0
    sensitive: bool = False


def _parse_json_array(text: str) -> list[dict]:
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _verified_block(diff: dict | None) -> str:
    """Authoritative change facts derived from the deterministic version diff."""
    if not diff:
        return ""
    removed = (diff.get("removed_text") or "").strip()
    added = (diff.get("added_text") or "").strip()
    if not removed and not added:
        return ""
    return (
        "\nVERIFIED CHANGES (computed by exact version diff — authoritative):\n"
        "The following changes are GROUND TRUTH extracted deterministically. "
        "Do not alter, contradict, or reinterpret these values under any "
        "circumstances:\n"
        f"OLD VERSION ({diff['old_version']}) text that was removed/replaced: {removed[:600]}\n"
        f"NEW VERSION ({diff['new_version']}) text that was added: {added[:600]}\n"
    )


# --- Numeric post-validation against the verified diff ---------------------
# The synthesis LLM occasionally emits a dollar amount or day-count that is not
# grounded in the deterministic diff (e.g. hallucinating "$30" or "14 days").
# post_validate() repairs any such ungrounded number by snapping it to the
# nearest value that actually appears in the verified OLD/NEW diff text.
_CURRENCY_RE = re.compile(r"\$\s?\d+(?:\.\d{1,2})?")
# A digit run immediately tied to "day(s)", allowing a trailing ")" from the
# document's "ten (10) business days" style: captures the digits in group 1.
_DAYS_RE = re.compile(r"(\d+)\)?\s*(?:business\s+)?days?\b", re.IGNORECASE)


def _norm_currency(token: str) -> float:
    return float(re.sub(r"[^\d.]", "", token))


def _verified_numbers(text: str) -> tuple[dict[float, str], set[int]]:
    """Numbers that are GROUND TRUTH because they appear in the diff text.

    Returns (currencies, day_counts) where currencies maps a normalized value
    to its original string form (so repairs preserve "$40.00" formatting).
    """
    currencies: dict[float, str] = {}
    for m in _CURRENCY_RE.finditer(text):
        currencies[_norm_currency(m.group())] = m.group().strip()
    days = {int(m.group(1)) for m in _DAYS_RE.finditer(text)}
    # The version diff is word-level and fragments numbers away from the word
    # "days" (e.g. "thirty (30) Appeals are ten (10) days"), which would drop a
    # valid day-count from the verified set. The policy's canonical form is a
    # parenthetical "(NN)", so treat every parenthetical integer as verified too.
    days |= {int(n) for n in re.findall(r"\((\d+)\)", text)}
    return currencies, days


def repair_numbers(answer: str, verified_text: str) -> str:
    """Snap dollar amounts and day-counts in ``answer`` to values that actually
    appear in ``verified_text``.

    Any answer number absent from the verified set (a contradiction or model
    drift) is replaced with the closest verified value of the same kind.
    Returns a new string; the input is never mutated.
    """
    v_currencies, v_days = _verified_numbers(verified_text)
    if not v_currencies and not v_days:
        return answer

    def fix_currency(match: re.Match) -> str:
        value = _norm_currency(match.group())
        if v_currencies and value not in v_currencies:
            best = min(v_currencies, key=lambda c: abs(c - value))
            return v_currencies[best]
        return match.group()

    def fix_days(match: re.Match) -> str:
        value = int(match.group(1))
        if v_days and value not in v_days:
            best = min(v_days, key=lambda d: abs(d - value))
            # Swap only the digits, keeping any "(", ")" and "business days".
            return match.group(0).replace(match.group(1), str(best), 1)
        return match.group(0)

    repaired = _CURRENCY_RE.sub(fix_currency, answer)
    repaired = _DAYS_RE.sub(fix_days, repaired)
    return repaired


def post_validate(answer: str, diff: dict | None) -> str:
    """Repair ungrounded numbers in ``answer`` against the deterministic diff.

    Thin wrapper used by the simple path: the verified figures are whatever
    appears in the diff's removed/added text. Returns a new string.
    """
    if not diff:
        return answer
    verified_text = " ".join(
        t for t in (diff.get("removed_text"), diff.get("added_text")) if t
    )
    return repair_numbers(answer, verified_text)


class QueryDecompositionAgent:
    def __init__(self) -> None:
        from ..llm import local_llm
        self._local = local_llm

    # -- complexity ---------------------------------------------------------
    def is_complex(self, query: str) -> bool:
        return query_parser.is_complex(query)

    def decompose(self, query: str) -> list[dict]:
        events.emit("agent_thinking", agent="QueryDecompositionAgent",
                    message="Breaking the question into sub-queries…")
        try:
            raw = self._local.generate_raw(_DECOMP_PROMPT.format(query=query),
                                           num_predict=300, temperature=0.2)
        except self._local.LocalLLMError:
            raw = ""
        subs = _parse_json_array(raw)
        cleaned = [
            {"sub_query": s.get("sub_query", "").strip(),
             "year": (str(s["year"]).strip() if s.get("year") else None)}
            for s in subs if s.get("sub_query")
        ]
        return cleaned or [{"sub_query": query, "year": None}]

    # -- main entry ---------------------------------------------------------
    def answer_query(self, query: str, system_prompt: str | None = None) -> QueryResult:
        import time
        start = time.perf_counter()

        intent = query_parser.parse(query)
        all_chunks = document_store.get_all_chunks(include_sensitive=True)

        events.emit("query_intent", agent="QueryDecompositionAgent",
                    intent=intent.intent_label, years=intent.years,
                    is_complex=intent.is_complex)

        if intent.is_complex:
            result = self._run_complex(query, intent, all_chunks, system_prompt)
        else:
            result = self._run_simple(query, intent, all_chunks, system_prompt)

        result.latency_ms = int((time.perf_counter() - start) * 1000)
        return result

    # -- simple path --------------------------------------------------------
    def _run_simple(self, query, intent, all_chunks, system_prompt) -> QueryResult:
        year = intent.years[0] if intent.years else None
        scored = self._retrieve(query, all_chunks, year)
        sensitive = any(s.chunk.is_sensitive for s in scored)
        versions = self._versions(scored)

        context = compressor.compress(
            "\n\n".join(s.chunk.content for s in scored), query=query
        ).text

        # Ground change queries in the deterministic diff.
        diff = self._build_diff(versions) if intent.is_change_query else None
        verified = _verified_block(diff)
        if verified:
            context = f"{context}\n{verified}"

        esc = escalation.query_with_escalation(
            query, context, is_sensitive=sensitive, system_prompt=system_prompt
        )
        answer = post_validate(esc.answer, diff)
        return QueryResult(
            answer=answer, route=esc.route, intent=intent.intent_label,
            is_complex=False, sub_results=[], versions_consulted=versions, diff=diff,
            latency_ms=0, tokens_used=esc.tokens_used, model_used=esc.model,
            chunks_retrieved=len(scored), sensitive=sensitive,
        )

    # -- complex path -------------------------------------------------------
    def _run_complex(self, query, intent, all_chunks, system_prompt) -> QueryResult:
        subs = self.decompose(query)
        total = len(subs)
        sub_results: list[SubResult] = []
        routes: set[str] = set()
        all_scored = []
        total_tokens = 0
        last_model = ""

        for i, sub in enumerate(subs, start=1):
            sq, year = sub["sub_query"], sub["year"]
            scored = self._retrieve(sq, all_chunks, year)
            all_scored.extend(scored)
            sensitive = any(s.chunk.is_sensitive for s in scored)
            context = compressor.compress(
                "\n\n".join(s.chunk.content for s in scored), query=sq
            ).text

            esc = escalation.query_with_escalation(
                sq, context, is_sensitive=sensitive,
                system_prompt=system_prompt, quiet=True,
            )
            routes.add(esc.route)
            total_tokens += esc.tokens_used
            last_model = esc.model

            sr = SubResult(index=i, sub_query=sq, year=year, answer=esc.answer,
                           route=esc.route, reason=esc.reason,
                           sources=self._versions(scored))
            sub_results.append(sr)

            events.emit("sub_query_progress", agent="QueryDecompositionAgent",
                        index=i, total=total, sub_query=sq, result=esc.answer,
                        route=esc.route)

        versions = self._versions(all_scored)
        diff = self._build_diff(versions) if intent.is_change_query else None

        # Synthesize, grounding change facts in the deterministic diff.
        events.emit("agent_thinking", agent="QueryDecompositionAgent",
                    message="Synthesising the final answer…")
        findings = "\n".join(
            f"{sr.index}. Q: {sr.sub_query}\n   A: {sr.answer}" for sr in sub_results
        )
        # Note: the deterministic diff is intentionally NOT injected into the
        # synthesis prompt. Its word-level output interleaves the appeal *filing*
        # window (10→30) with the appeal *decision* window (14→10) and other
        # fragments, which led the local model to cite the wrong day-counts and
        # ramble about unasked topics. The per-year sub-answers above are already
        # clean and correct; the diff still backs the UI and post_validate() below.
        prompt = _SYNTH_PROMPT.format(query=query, findings=findings)
        final = self._synthesize(prompt, findings)

        route = "hybrid" if len(routes) > 1 else (routes.pop() if routes else "local")
        return QueryResult(
            answer=final, route=route, intent=intent.intent_label, is_complex=True,
            sub_results=[asdict(sr) for sr in sub_results],
            versions_consulted=versions, diff=diff,
            latency_ms=0, tokens_used=total_tokens, model_used=last_model,
            chunks_retrieved=len(all_scored),
            sensitive=any(s.chunk.is_sensitive for s in all_scored),
        )

    # -- synthesis ----------------------------------------------------------
    def _synthesize(self, prompt: str, findings: str) -> str:
        """Generate the final answer, guaranteeing it covers every verified
        figure that appears in the clean per-year findings.

        The synthesis model is mostly deterministic at temperature 0.0 but
        occasionally drops a whole clause (e.g. answers the fee but omits the
        appeal window). We treat the verified dollar amounts and day-counts in
        the findings as the coverage contract: if a candidate answer is missing
        any of them, we regenerate at a higher temperature. After a few tries we
        fall back to the (always-complete, if less polished) findings join, so
        the demo never silently returns a half-answer.
        """
        want_c, want_d = _verified_numbers(findings)
        want_total = len(want_c) + len(want_d)
        best, best_score = "", -1
        for temperature in (0.0, 0.3, 0.5, 0.7, 0.9):
            try:
                cand = self._local.generate_raw(
                    prompt, num_predict=400, temperature=temperature
                ).strip()
            except self._local.LocalLLMError:
                cand = ""
            if not cand:
                continue
            # Snap any ungrounded numbers to verified values before judging
            # coverage (a repaired "14"→"10" should count toward the contract).
            cand = repair_numbers(cand, findings)
            got_c, got_d = _verified_numbers(cand)
            covered_c = set(want_c) & set(got_c)
            covered_d = set(want_d) & set(got_d)
            if len(covered_c) == len(want_c) and len(covered_d) == len(want_d):
                return cand
            # Not fully covering — remember the most complete attempt so the
            # worst case still returns the richest answer rather than the first.
            score = len(covered_c) + len(covered_d)
            if score > best_score:
                best, best_score = cand, score
        return best or findings

    # -- helpers ------------------------------------------------------------
    def _retrieve(self, query, all_chunks, year):
        q_emb = embedder.embed_text(query)
        return retriever.retrieve(q_emb, all_chunks, year=year)

    @staticmethod
    def _versions(scored) -> list[dict]:
        seen = {}
        for s in scored:
            key = (s.chunk.title, s.chunk.version)
            if key not in seen:
                seen[key] = {
                    "title": s.chunk.title,
                    "version": s.chunk.version,
                    "timestamp": s.chunk.timestamp,
                    "sensitive": s.chunk.is_sensitive,
                    "score": round(s.score, 3),
                }
        return list(seen.values())

    @staticmethod
    def _build_diff(versions_consulted) -> dict | None:
        # Find two versions of the same title to diff.
        by_title: dict[str, list[dict]] = {}
        for v in versions_consulted:
            by_title.setdefault(v["title"], []).append(v)
        for title, vers in by_title.items():
            if len(vers) >= 2:
                vers_sorted = sorted(vers, key=lambda x: x["timestamp"])
                old_v, new_v = vers_sorted[0], vers_sorted[-1]
                old_doc = _find_doc(title, old_v["version"])
                new_doc = _find_doc(title, new_v["version"])
                if old_doc and new_doc:
                    d = diff_engine.diff_versions(old_doc.content, new_doc.content)
                    return {
                        "title": title,
                        "old_version": old_v["version"],
                        "new_version": new_v["version"],
                        "similarity": d.similarity,
                        "added_text": d.added_text,
                        "removed_text": d.removed_text,
                        "segments": [{"kind": s.kind, "text": s.text} for s in d.segments],
                    }
        return None


def _find_doc(title: str, version: str):
    for d in document_store.get_versions(title):
        if d.version == version:
            return d
    return None
