"""End-to-end test against a running CorpusAgent backend.

Usage:
    1. Start the backend:  uvicorn backend.main:app --port 8000
    2. Run:                python scripts/e2e_test.py

Exercises the full demo flow: upload 3 versioned sensitive docs ->
SpecializationAgent persona -> VersionPatrolAgent alerts ->
QueryDecompositionAgent complex temporal query with diff.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import requests

# Windows consoles default to cp1252; force UTF-8 so arrows/emoji don't crash.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

BASE = "http://localhost:8000"
SAMPLES = Path(__file__).resolve().parent.parent / "samples"

DOCS = [
    ("policy_2021.txt", "Mapleton OPRA Policy", "v1 (2021)", "2021-01-01"),
    ("policy_2023.txt", "Mapleton OPRA Policy", "v2 (2023)", "2023-03-01"),
    ("policy_2024.txt", "Mapleton OPRA Policy", "v3 (2024)", "2024-04-01"),
]


def ok(label: str, cond: bool, detail: str = "") -> bool:
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail else ""))
    return cond


def main() -> int:
    passed = True

    print("== status ==")
    st = requests.get(f"{BASE}/status", timeout=10).json()
    passed &= ok("ollama running", st["ollama_running"])
    passed &= ok("local model ready", st["local_model_ready"], st["local_model"])
    print(f"      cloud configured: {st['cloud_configured']} | gpu: {st.get('gpu', {}).get('name') if st.get('gpu') else 'n/a'}")

    print("== upload 3 versioned sensitive docs ==")
    for fname, title, version, date in DOCS:
        path = SAMPLES / fname
        with open(path, "rb") as fh:
            r = requests.post(
                f"{BASE}/upload",
                files={"file": (fname, fh, "text/plain")},
                data={"title": title, "version": version, "date": date, "sensitive": "true"},
                timeout=120,
            )
        r.raise_for_status()
        data = r.json()
        ok(f"uploaded {version}", data["chunks"] > 0, f"{data['chunks']} chunks")

    print("== SpecializationAgent persona (waiting up to 60s) ==")
    persona = None
    for _ in range(30):
        persona = requests.get(f"{BASE}/persona", timeout=10).json()
        if persona.get("persona"):
            break
        time.sleep(2)
    passed &= ok("persona generated", bool(persona and persona.get("persona")),
                persona.get("domain", "") if persona else "")
    if persona and persona.get("persona"):
        print(f"      → {persona['persona'][:120]}")

    print("== VersionPatrolAgent alerts (waiting up to 90s) ==")
    alerts = []
    for _ in range(45):
        alerts = requests.get(f"{BASE}/alerts", timeout=10).json()
        if len(alerts) >= 2:
            break
        time.sleep(2)
    passed &= ok("version alerts created", len(alerts) >= 1, f"{len(alerts)} alerts")
    for a in alerts[:3]:
        print(f"      → {a['doc_title']} {a['old_version']}→{a['new_version']}: {a['change_summary'][:90]}")

    print("== documents grouped with version chain ==")
    docs = requests.get(f"{BASE}/documents", timeout=10).json()
    passed &= ok("one title, three versions",
                len(docs) == 1 and len(docs[0]["versions"]) == 3,
                f"{len(docs)} title(s)")
    passed &= ok("title marked sensitive", docs and docs[0]["sensitive"])

    print("== complex temporal query (QueryDecompositionAgent) ==")
    q = "How did the processing fee and the appeal window change between 2021 and 2024?"
    r = requests.post(f"{BASE}/query", json={"query": q}, timeout=240).json()
    passed &= ok("is_complex (decomposed)", r.get("is_complex", False),
                f"{len(r.get('sub_results', []))} sub-queries")
    passed &= ok("route is local (sensitive → privacy preserved)",
                r.get("route") == "local" and r.get("sensitive"), r.get("route", "?"))
    passed &= ok("diff attached", r.get("diff") is not None,
                (r["diff"]["old_version"] + " → " + r["diff"]["new_version"]) if r.get("diff") else "no diff")
    print(f"      ANSWER: {r.get('answer', '')[:240]}")

    print("\n" + ("ALL E2E CHECKS PASSED ✅" if passed else "SOME CHECKS FAILED ❌"))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
