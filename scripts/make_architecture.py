"""Generate architecture.png for CorpusAgent using matplotlib.

Run:  python scripts/make_architecture.py
"""
from __future__ import annotations

from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = Path(__file__).resolve().parent.parent / "architecture.png"

BG = "#080810"
SURFACE = "#10101c"
SURFACE2 = "#1a1a2e"
BLUE = "#3b82f6"
GREEN = "#22c55e"
ORANGE = "#f97316"
PURPLE = "#a855f7"
RED = "#ef4444"
INK = "#e2e8f0"
MUTED = "#64748b"


def box(ax, x, y, w, h, text, color, text_color=INK, fontsize=10, bold=True):
    ax.add_patch(
        FancyBboxPatch(
            (x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.12",
            linewidth=1.6, edgecolor=color, facecolor=SURFACE2, zorder=2,
        )
    )
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            color=text_color, fontsize=fontsize,
            fontweight="bold" if bold else "normal", zorder=3, wrap=True)


def arrow(ax, p1, p2, color=MUTED, style="-|>"):
    ax.add_patch(
        FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=14,
                        linewidth=1.4, color=color, zorder=1,
                        connectionstyle="arc3,rad=0.0")
    )


def main() -> None:
    fig, ax = plt.subplots(figsize=(13, 8.5), dpi=150)
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 13)
    ax.set_ylim(0, 9)
    ax.axis("off")

    ax.text(0.3, 8.6, "CorpusAgent", color=INK, fontsize=22, fontweight="bold")
    ax.text(0.32, 8.2, "Agentic Temporal Document Intelligence — Edge + Cloud",
            color=MUTED, fontsize=11)

    # Frontend
    box(ax, 0.3, 6.6, 3.2, 1.0,
        "React + Tailwind UI\nPersona · Activity Feed · DiffViewer", BLUE, fontsize=9)
    # WebSocket + REST
    box(ax, 4.2, 6.6, 2.2, 1.0, "FastAPI\nREST + WebSocket /ws", GREEN, fontsize=9)

    arrow(ax, (3.5, 7.1), (4.2, 7.1), BLUE)
    arrow(ax, (4.2, 6.95), (3.5, 6.95), GREEN)

    # Agents layer
    box(ax, 0.3, 4.7, 2.9, 1.4,
        "Agents\n• SpecializationAgent\n• VersionPatrolAgent\n"
        "• QueryDecompositionAgent\n• EscalationAgent", PURPLE, fontsize=8.5)
    arrow(ax, (5.3, 6.6), (2.6, 6.1), PURPLE)

    # Core
    box(ax, 3.6, 4.7, 3.0, 1.4,
        "Core\nembedder · retriever (temporal)\ncompressor · diff_engine\nquery_parser",
        ORANGE, fontsize=8.5)
    arrow(ax, (3.2, 5.4), (3.6, 5.4), MUTED)

    # Storage
    box(ax, 7.0, 4.7, 2.6, 1.4,
        "SQLite Store\ndocuments · chunks\nembeddings · persona\nversion_alerts",
        GREEN, fontsize=8.5)
    arrow(ax, (6.6, 5.4), (7.0, 5.4), MUTED)

    # Edge LLM
    box(ax, 3.0, 2.4, 3.0, 1.1,
        "EDGE  ·  RTX 5080\nOllama: qwen2.5:7b\nnomic-embed-text", GREEN, fontsize=9)
    # Cloud LLM
    box(ax, 6.6, 2.4, 3.0, 1.1,
        "CLOUD\nQwen Cloud (DashScope)\nqwen-plus", BLUE, fontsize=9)

    arrow(ax, (4.5, 4.7), (4.5, 3.5), GREEN)         # core/agents -> edge
    arrow(ax, (5.7, 4.7), (8.0, 3.5), BLUE)          # escalation -> cloud

    # Escalation note
    box(ax, 10.0, 2.4, 2.7, 1.1,
        "EscalationAgent\nlow confidence →\nescalate to cloud", PURPLE, fontsize=8.5)
    arrow(ax, (9.6, 2.95), (10.0, 2.95), PURPLE)

    # Privacy banner
    ax.add_patch(FancyBboxPatch(
        (0.3, 0.5), 12.4, 1.0, boxstyle="round,pad=0.02,rounding_size=0.1",
        linewidth=1.6, edgecolor=RED, facecolor=SURFACE, zorder=2))
    ax.text(6.5, 1.0,
            "🔒  Privacy rule: documents marked SENSITIVE are embedded and answered "
            "ONLY on the edge — never sent to the cloud, regardless of which agent runs.",
            ha="center", va="center", color=INK, fontsize=10, fontweight="bold")

    # Legend
    handles = [
        mpatches.Patch(color=BLUE, label="Cloud / Frontend"),
        mpatches.Patch(color=GREEN, label="Edge / Storage"),
        mpatches.Patch(color=PURPLE, label="Agents"),
        mpatches.Patch(color=ORANGE, label="Core pipeline"),
    ]
    leg = ax.legend(handles=handles, loc="upper right", frameon=False,
                    fontsize=9, labelcolor=INK, bbox_to_anchor=(0.99, 0.99))
    for t in leg.get_texts():
        t.set_color(INK)

    fig.savefig(OUT, facecolor=BG, bbox_inches="tight")
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
