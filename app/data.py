"""yfinance によるデータ取得とディスクキャッシュ。

無料データソース前提のため、レート制限・欠損に強い実装にする。
取得失敗した銘柄はスキップし、全体が落ちないようにする。
"""
from __future__ import annotations

import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)


def _safe(v):
    """NaN/Inf を None に正規化（JSON 安全化）。"""
    if v is None:
        return None
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return v


def fetch_fundamentals(ticker: str) -> dict | None:
    """1銘柄のファンダ＋価格＋モメンタムを取得。失敗時 None。"""
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}
    except Exception:
        info = {}

    # 価格履歴からモメンタムを計算（infoが薄くても動くように）
    mom_3m = mom_6m = None
    price = None
    try:
        hist = tk.history(period="6mo", interval="1d")
        if not hist.empty:
            closes = hist["Close"].dropna()
            if len(closes) > 0:
                price = float(closes.iloc[-1])
                if len(closes) > 63:
                    mom_3m = float(closes.iloc[-1] / closes.iloc[-63] - 1.0)
                if len(closes) > 1:
                    mom_6m = float(closes.iloc[-1] / closes.iloc[0] - 1.0)
    except Exception:
        pass

    if price is None:
        price = _safe(info.get("currentPrice") or info.get("regularMarketPrice"))

    target = _safe(info.get("targetMeanPrice"))
    upside = None
    if price and target:
        upside = target / price - 1.0

    return {
        "ticker": ticker,
        "price": _safe(price),
        "market_cap": _safe(info.get("marketCap")),
        "revenue_growth": _safe(info.get("revenueGrowth")),
        "earnings_growth": _safe(info.get("earningsGrowth")),
        "gross_margin": _safe(info.get("grossMargins")),
        "profit_margin": _safe(info.get("profitMargins")),
        "roe": _safe(info.get("returnOnEquity")),
        "forward_pe": _safe(info.get("forwardPE")),
        "trailing_pe": _safe(info.get("trailingPE")),
        "target_mean": target,
        "upside": _safe(upside),
        "recommendation": info.get("recommendationKey"),
        "num_analysts": _safe(info.get("numberOfAnalystOpinions")),
        "mom_3m": _safe(mom_3m),
        "mom_6m": _safe(mom_6m),
    }


def fetch_all(tickers: list[str], pause: float = 0.4) -> list[dict]:
    rows = []
    for t in tickers:
        row = fetch_fundamentals(t)
        if row:
            rows.append(row)
        time.sleep(pause)  # レート制限対策
    return rows


def fetch_news(tickers: list[str], per_ticker: int = 4) -> list[dict]:
    """各銘柄の最新ニュースを集約。yfinance の新旧フォーマット両対応。"""
    items = []
    seen = set()
    for t in tickers:
        try:
            raw = yf.Ticker(t).news or []
        except Exception:
            raw = []
        count = 0
        for n in raw:
            # 新フォーマット: {"content": {...}}
            content = n.get("content") if isinstance(n, dict) else None
            if content:
                title = content.get("title")
                link = (content.get("canonicalUrl") or {}).get("url") or \
                       (content.get("clickThroughUrl") or {}).get("url")
                pub = (content.get("provider") or {}).get("displayName")
                ts = content.get("pubDate")  # ISO 文字列
                ts_epoch = _iso_to_epoch(ts)
            else:
                # 旧フォーマット
                title = n.get("title")
                link = n.get("link")
                pub = n.get("publisher")
                ts_epoch = n.get("providerPublishTime")

            if not title or not link:
                continue
            key = link
            if key in seen:
                continue
            seen.add(key)
            items.append({
                "ticker": t,
                "title": title,
                "link": link,
                "publisher": pub,
                "time": int(ts_epoch) if ts_epoch else None,
            })
            count += 1
            if count >= per_ticker:
                break
    # 新しい順
    items.sort(key=lambda x: x["time"] or 0, reverse=True)
    return items


def _iso_to_epoch(s):
    if not s:
        return None
    try:
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


# ---- ディスクキャッシュ ----
def save_cache(name: str, payload: dict):
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), **payload}
    (DATA_DIR / f"{name}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def load_cache(name: str) -> dict | None:
    p = DATA_DIR / f"{name}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
