"""優良株スコアリング。

ユニバース内で各指標をパーセンタイル順位化（0-1）し、重み付けして総合スコア(0-100)。
欠損は中央値(0.5)扱いにして、無理に除外しない。
"""
from __future__ import annotations

from app.universe import meta

# 指標: (キー, 重み, 高いほど良いか)
METRICS = [
    ("revenue_growth", 0.20, True),
    ("earnings_growth", 0.12, True),
    ("gross_margin", 0.10, True),
    ("profit_margin", 0.10, True),
    ("roe", 0.10, True),
    ("mom_3m", 0.12, True),
    ("mom_6m", 0.10, True),
    ("upside", 0.10, True),       # アナリスト目標株価への上昇余地
    ("forward_pe", 0.06, False),  # 低いほど良い（割安）
]


def _percentile_ranks(values: list[float | None]) -> list[float]:
    """欠損は 0.5。それ以外を順位パーセンタイル(0-1)に。"""
    idx = [i for i, v in enumerate(values) if v is not None]
    ranks = [0.5] * len(values)
    if len(idx) <= 1:
        return ranks
    present = sorted(idx, key=lambda i: values[i])
    n = len(present)
    for rank, i in enumerate(present):
        ranks[i] = rank / (n - 1)
    return ranks


def score(rows: list[dict]) -> list[dict]:
    if not rows:
        return []

    # 各指標のパーセンタイル
    ranked = {}
    for key, _w, higher in METRICS:
        vals = [r.get(key) for r in rows]
        pr = _percentile_ranks(vals)
        if not higher:
            pr = [1 - x for x in pr]
        ranked[key] = pr

    total_w = sum(w for _k, w, _h in METRICS)
    out = []
    for i, r in enumerate(rows):
        s = sum(ranked[key][i] * w for key, w, _h in METRICS) / total_w
        m = meta(r["ticker"])
        out.append({
            **r,
            "name": m["name"],
            "tags": m["tags"],
            "score": round(s * 100, 1),
            "subscores": {key: round(ranked[key][i] * 100, 0) for key, _w, _h in METRICS},
        })

    out.sort(key=lambda x: x["score"], reverse=True)
    for rank, r in enumerate(out, 1):
        r["rank"] = rank
    return out
