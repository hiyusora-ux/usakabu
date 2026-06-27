"""静的データ生成: public/data/*.json を一括生成する。

GitHub Actions の定期実行（python -m app.build_data）と、
ローカルの FastAPI スケジューラの両方から呼ばれる単一の生成処理。
出力先は public/data/ で、Vercel はこれをそのまま配信する。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app import data, outlook, screener, translate
from app.universe import THEME_LABELS, all_tickers, meta

PUBLIC_DATA = Path(__file__).resolve().parent.parent / "public" / "data"


def _write(name: str, payload: dict):
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), **payload}
    (PUBLIC_DATA / f"{name}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return payload


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

    # 3) 市場見通し
    items = outlook.generate_outlook(stocks, news)
    ol = _write("outlook", {"items": items, "enabled": outlook._has_key()})

    # 4) ステータス（フロントのヘッダ表示用）
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
