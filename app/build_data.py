"""静的データ生成: public/data/*.json を一括生成する。

GitHub Actions の定期実行（python -m app.build_data）と、
ローカルの FastAPI スケジューラの両方から呼ばれる単一の生成処理。
出力先は public/data/ で、Vercel はこれをそのまま配信する。
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from app import data, free_outlook, fund_nav, holdings_price, outlook, screener, sector, translate
from app.universe import THEME_LABELS, all_tickers, meta

PUBLIC_DATA = Path(__file__).resolve().parent.parent / "public" / "data"
HISTORY_KEEP = 120  # 直近120ポイントを保持


def _write(name: str, payload: dict):
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), **payload}
    (PUBLIC_DATA / f"{name}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return payload


def _append_history(sectors: list[dict]):
    """セクター集計を history.json に1ポイント追記（時系列トレンド用）。"""
    path = PUBLIC_DATA / "history.json"
    try:
        hist = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except Exception:
        hist = {}
    points = hist.get("points", [])
    point = {"t": int(time.time())}
    for s in sectors:
        point[s["theme"]] = {
            "m3": round(s["avg_mom_3m"] * 100, 2) if s["avg_mom_3m"] is not None else None,
            "sc": round(s["avg_score"], 1) if s["avg_score"] is not None else None,
            "st": s.get("strength"),
        }
    points.append(point)
    points = points[-HISTORY_KEEP:]
    _write("history", {"points": points})


def build() -> None:
    tickers = all_tickers()

    # 1) スクリーニング
    rows = data.fetch_all(tickers)
    stocks = screener.score(rows)
    sc = _write("screener", {"stocks": stocks})

    # 2) トピックス（和訳付き、テーマ絞り込み用に tags を付与）
    news = data.fetch_news(tickers)
    news = translate.enrich_with_japanese(news)
    for n in news:
        n["tags"] = meta(n.get("ticker", "")).get("tags", [])
    tp = _write("topics", {"items": news})

    # 3) セクター相対比較＋時系列トレンド
    sectors = sector.compute_sectors(stocks)
    _write("sectors", {"sectors": sectors})
    _append_history(sectors)

    # 4) 市場見通し（APIキーがあれば Claude、無ければルールベース＝無料）
    if outlook._has_key():
        items = outlook.generate_outlook(stocks, news)
        mode = "ai"
    else:
        items = free_outlook.rule_outlook(sectors, news)
        mode = "rule"
    ol = _write("outlook", {"items": items, "enabled": bool(items), "mode": mode})

    # 5.5) 投資信託の基準価額（投資信託協会）＋ 保有株の現在値（Yahoo）
    _write("fund_nav", {"funds": fund_nav.build_fund_nav()})
    _write("holdings_price", {"quotes": holdings_price.build_holdings_price()})

    # 5) ステータス（フロントのヘッダ表示用）
    _write("status", {
        "screener_updated": sc["updated_at"],
        "topics_updated": tp["updated_at"],
        "outlook_updated": ol["updated_at"],
        "stock_count": len(stocks),
        "topic_count": len(news),
        "translation_enabled": translate._has_key(),
        "translated_count": sum(1 for n in news if n.get("title_ja")),
        "outlook_enabled": ol["enabled"],
        "outlook_count": len(items),
        "themes": THEME_LABELS,
    })


if __name__ == "__main__":
    build()
    print(f"Wrote data to {PUBLIC_DATA}")
