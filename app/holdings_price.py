"""保有株の現在値を取得する（サーバ側・ログイン不要）。

Yahoo Finance の公開チャートAPIから現在値を取得（ブラウザからはCORSで
不可のためサーバ側で実行）。投信は fund_nav.py（投資信託協会）で別途取得。
出力は build_data 経由で public/data/holdings_price.json に書き出され、
フロントが保有銘柄の「現在値」を最新化するのに使う（取得額は更新しない）。
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone

# 保有株: 表示ティッカー(=楽天CSVの銘柄コード) -> Yahooシンボル（.T=東証）
TICKERS = {
    "4755": "4755.T",   # 楽天グループ
    "6758": "6758.T",   # ソニーグループ
    "GOOGL": "GOOGL",   # アルファベット クラスA
}

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=1d"


def _fetch(sym: str) -> tuple[float, str, str]:
    req = urllib.request.Request(CHART_URL.format(sym=sym), headers={"User-Agent": "Mozilla/5.0"})
    meta = json.loads(urllib.request.urlopen(req, timeout=20).read())["chart"]["result"][0]["meta"]
    ts = meta.get("regularMarketTime")
    date = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d") if ts else ""
    return float(meta["regularMarketPrice"]), str(meta.get("currency", "")), date


def build_holdings_price() -> list[dict]:
    out = []
    for ticker, sym in TICKERS.items():
        try:
            price, currency, date = _fetch(sym)
            out.append({"ticker": ticker, "price": price, "currency": currency, "date": date})
        except Exception as e:  # 1銘柄失敗しても継続
            print(f"holdings_price: {ticker} 取得失敗 {e!r}")
    return out


if __name__ == "__main__":
    for q in build_holdings_price():
        print(f"{q['ticker']:>6} {q['price']:>10} {q['currency']} {q['date']}")
