"""セクター（テーマ）ごとの集計と相対比較。

スクリーニング済みの銘柄から、テーマ別の平均モメンタム・成長率・スコア・
騰落ブレッド（上昇銘柄割合）を算出し、3Mモメンタム順にランク付けする。
すべて既存の数値から計算（APIキー不要）。
"""
from __future__ import annotations

from app.universe import THEME_LABELS


def _avg(vals):
    xs = [v for v in vals if isinstance(v, (int, float))]
    return sum(xs) / len(xs) if xs else None


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
        out.append({
            "theme": theme,
            "label": label,
            "count": len(th),
            "avg_mom_3m": _avg(m3),
            "avg_mom_6m": _avg([s.get("mom_6m") for s in th]),
            "avg_revenue_growth": _avg([s.get("revenue_growth") for s in th]),
            "avg_score": _avg([s.get("score") for s in th]),
            "breadth": _breadth(m3),
        })

    ranked = sorted(
        out,
        key=lambda x: x["avg_mom_3m"] if x["avg_mom_3m"] is not None else -9,
        reverse=True,
    )
    for i, s in enumerate(ranked, 1):
        s["rank"] = i
    return ranked
