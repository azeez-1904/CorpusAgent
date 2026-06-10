"""Run the same temporal query 5x and check the appeal-window answer.

Boots-agnostic: waits for /status, ensures the 3 versioned docs are uploaded,
then fires the query 5 times back to back, recording route + appeal-window
correctness. Prints a tune2.txt-style results table.
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import requests

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

BASE = "http://localhost:8000"
SAMPLES = Path(__file__).resolve().parent.parent / "samples"
QUERY = "how did the processing fee and appeal window change between 2021 and 2024?"
RUNS = 5

DOCS = [
    ("policy_2021.txt", "Mapleton OPRA Policy", "v1 (2021)", "2021-01-01"),
    ("policy_2023.txt", "Mapleton OPRA Policy", "v2 (2023)", "2023-03-01"),
    ("policy_2024.txt", "Mapleton OPRA Policy", "v3 (2024)", "2024-04-01"),
]

# Correct iff the appeal window is reported as 30 (thirty) business days.
_CORRECT_RE = re.compile(r"thirty\s*\(?\s*30\s*\)?|30\s*business\s*days?|\(30\)", re.I)


def wait_for_server(timeout_s: int = 60) -> dict:
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        try:
            last = requests.get(f"{BASE}/status", timeout=5).json()
            return last
        except Exception:  # noqa: BLE001
            time.sleep(1)
    raise SystemExit(f"Server never came up. last={last}")


def ensure_docs() -> None:
    docs = requests.get(f"{BASE}/documents", timeout=10).json()
    have = docs and len(docs[0].get("versions", [])) >= 3
    if have:
        print("corpus already present — skipping upload")
        return
    print("uploading 3 versioned docs…")
    for fname, title, version, date in DOCS:
        with open(SAMPLES / fname, "rb") as fh:
            r = requests.post(
                f"{BASE}/upload",
                files={"file": (fname, fh, "text/plain")},
                data={"title": title, "version": version, "date": date,
                      "sensitive": "true"},
                timeout=120,
            )
        r.raise_for_status()
        print(f"  uploaded {version}: {r.json()['chunks']} chunks")


def appeal_snippet(answer: str) -> str:
    """Pull the sentence mentioning the appeal window, for the log."""
    for sent in re.split(r"(?<=[.!?])\s+", answer):
        if "appeal" in sent.lower():
            return sent.strip()
    return answer.strip()[:160]


def main() -> int:
    st = wait_for_server()
    print(f"status: ollama={st.get('ollama_running')} "
          f"local_model={st.get('local_model')} "
          f"ready={st.get('local_model_ready')} "
          f"cloud_configured={st.get('cloud_configured')}")
    ensure_docs()

    rows = []
    for i in range(1, RUNS + 1):
        t0 = time.perf_counter()
        r = requests.post(f"{BASE}/query", json={"query": QUERY}, timeout=240).json()
        dt = int((time.perf_counter() - t0) * 1000)
        answer = r.get("answer", "")
        route = r.get("route", "?")
        diff_on = r.get("diff") is not None
        correct = bool(_CORRECT_RE.search(answer))
        rows.append({
            "run": i, "route": route, "diff": diff_on, "ms": dt,
            "correct": correct, "snippet": appeal_snippet(answer),
            "answer": answer,
        })
        print(f"RUN{i} route={route} diff={diff_on} {dt}ms "
              f"appeal_30={'OK' if correct else 'REGRESSION'}")

    print("\n" + "=" * 72)
    print(f"QUERY: {QUERY}")
    print("=" * 72)
    print(f"{'RUN':<4}{'ROUTE':<8}{'DIFF':<6}{'LATENCY':<10}{'APPEAL WINDOW':<14}RESULT")
    print("-" * 72)
    n_ok = 0
    for row in rows:
        verdict = "thirty(30) ✓" if row["correct"] else "OTHER ✗"
        n_ok += row["correct"]
        print(f"{row['run']:<4}{row['route']:<8}{str(row['diff']):<6}"
              f"{str(row['ms'])+'ms':<10}{verdict:<14}"
              f"{'CORRECT' if row['correct'] else 'REGRESSION'}")
    print("-" * 72)
    print(f"TOTAL: {n_ok}/{RUNS} correct, {RUNS - n_ok}/{RUNS} regressions")
    print("=" * 72)
    print("\nPer-run appeal-window sentence:")
    for row in rows:
        print(f"  RUN{row['run']}: {row['snippet']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
