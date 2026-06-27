"""セクター（テーマ）ごとの集計と相対比較。

スクリーニング済みの銘柄から、テーマ別の平均モメンタム・成長率・スコア・
騰落ブレッド（上昇銘柄割合）を算出し、3Mモメンタム順にランク付けする。
すべて既存の数値から計算（APIキー不要）。
"""
from __future__ import annotations

import math

from app.universe import THEME_LABELS


def _avg(vals):
    xs = [v for v in vals if isinstance(v, (int, float))]
    return sum(xs) / len(xs) if xs else None


def _strength(mom3, mom6, breadth):
    """セクター相対強度指数（0-100）。固定スケールで時系列比較が可能。

    モメンタムは tanh で有界化（暴れないように）、地合いの広がり(breadth)を加味。
    50 が中立、>50 が強い、<50 が弱い。
    """
    def norm(m):
        return 0.5 * (math.tanh((m or 0.0) * 2.0) + 1.0)  # 0..1, 中立0.5
    b = breadth if isinstance(breadth, (int, float)) else 0.5
    s = 0.45 * norm(mom3) + 0.25 * norm(mom6) + 0.30 * b
    return round(max(0.0, min(1.0, s)) * 100, 1)


def _breadth(vals):
    xs = [v for v in vals if isinstance(v, (int, float))]
    if not xs:
        return None
    return sum(1 for v in xs if v > 0) / len(xs)


def compute_sectors(stocks: list[dict]) -> list[dict]:
    out = []
    for theme, label in THEME_LABELS.items():
        th = [s for s in stocks if theme in s.get("tags", [])]
        if not th:
            continue
        m3 = [s.get("mom_3m") for s in th]
        avg_m3 = _avg(m3)
        avg_m6 = _avg([s.get("mom_6m") for s in th])
        breadth = _breadth(m3)
        out.append({
            "theme": theme,
            "label": label,
            "count": len(th),
            "avg_mom_3m": avg_m3,
            "avg_mom_6m": avg_m6,
            "avg_revenue_growth": _avg([s.get("revenue_growth") for s in th]),
            "avg_score": _avg([s.get("score") for s in th]),
            "breadth": breadth,
            "strength": _strength(avg_m3, avg_m6, breadth),
        })

    ranked = sorted(
        out,
        key=lambda x: x["strength"] if x["strength"] is not None else -9,
        reverse=True,
    )
    for i, s in enumerate(ranked, 1):
        s["rank"] = i
    return ranked
