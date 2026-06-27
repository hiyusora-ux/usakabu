"""ニュース＋数値データを基にしたテーマ別の市場見通し生成。

Anthropic Claude API（claude-opus-4-8）でテーマごとに定性的な見通しを生成。
- 入力: そのテーマの上位銘柄の指標 ＋ 直近ニュース見出し
- 出力: センチメント・強材料/弱材料・シナリオ・ウォッチポイント・確信度
- ANTHROPIC_API_KEY が無ければ空（パネル非表示）
- ⚠️ 投資助言ではなく情報提供。生成物にはディスクレーマー前提。
"""
from __future__ import annotations

import os

from pydantic import BaseModel

from app import data
from app.universe import THEME_LABELS, tickers_for_theme

MODEL = "claude-opus-4-8"

SYSTEM = (
    "あなたは米国株市場のアナリストです。与えられた公開ニュースの見出しと数値指標"
    "（総合スコア・売上成長率・モメンタム・アナリスト評価）だけを根拠に、テーマセクターの"
    "短期的な市場見通しを日本語で整理します。重要な制約:\n"
    "- 断定的な株価予測（具体的な価格や上昇率の予言）はしない。\n"
    "- 与えられた材料から読み取れる範囲のみで、誇張しない。\n"
    "- 投資助言ではなく、材料の客観的な整理として書く。\n"
    "- 強材料・弱材料・ウォッチポイントは簡潔な箇条書き（各1文）にする。"
)


class ThemeOutlook(BaseModel):
    sentiment: str          # 強気 / やや強気 / 中立 / やや弱気 / 弱気
    sentiment_score: int    # 1(弱気)〜5(強気)
    bull_points: list[str]  # 強材料
    bear_points: list[str]  # 弱材料
    scenario: str           # 注目シナリオ（1〜2文）
    watch_points: list[str] # ウォッチポイント
    confidence: str         # 高 / 中 / 低


def _has_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _build_user(theme_label: str, stocks: list[dict], news: list[dict]) -> str:
    def pct(v):
        return f"{v*100:.1f}%" if isinstance(v, (int, float)) else "—"

    lines = [f"テーマ: {theme_label}", "", "■ 上位銘柄（総合スコア順）"]
    for s in stocks:
        lines.append(
            f"- {s.get('ticker')} {s.get('name','')}: スコア{s.get('score')}, "
            f"売上成長{pct(s.get('revenue_growth'))}, 3Mモメンタム{pct(s.get('mom_3m'))}, "
            f"目標余地{pct(s.get('upside'))}, 評価{s.get('recommendation') or '—'}"
        )
    lines += ["", "■ 直近ニュース見出し"]
    for n in news:
        lines.append(f"- [{n.get('ticker')}] {n.get('title_ja') or n.get('title')}")
    lines += [
        "",
        "上記の材料のみを根拠に、このテーマの短期見通しを構造化して出してください。",
    ]
    return "\n".join(lines)


def _generate_for_theme(client, theme: str, label: str,
                        stocks: list[dict], news: list[dict]) -> dict | None:
    allow = set(tickers_for_theme(theme))
    th_stocks = [s for s in stocks if theme in s.get("tags", [])][:8]
    th_news = [n for n in news if n.get("ticker") in allow][:15]
    if not th_stocks and not th_news:
        return None
    try:
        resp = client.messages.parse(
            model=MODEL,
            max_tokens=6000,
            thinking={"type": "adaptive"},
            system=SYSTEM,
            messages=[{"role": "user", "content": _build_user(label, th_stocks, th_news)}],
            output_format=ThemeOutlook,
        )
        o = resp.parsed_output
        if not o:
            return None
        return {"theme": theme, "label": label, **o.model_dump()}
    except Exception:
        return None


def generate_outlook(stocks: list[dict], news: list[dict]) -> list[dict]:
    """与えられた銘柄・ニュースから全テーマの見通しを生成（キャッシュ非依存）。"""
    out: list[dict] = []
    if not _has_key():
        return out
    try:
        from anthropic import Anthropic
        client = Anthropic()
        for theme, label in THEME_LABELS.items():
            res = _generate_for_theme(client, theme, label, stocks, news)
            if res:
                out.append(res)
    except Exception:
        pass
    return out


def refresh_outlook() -> list[dict]:
    """キャッシュ済みの screener / topics を読んで見通しを生成・保存（FastAPI用）。"""
    stocks = (data.load_cache("screener") or {}).get("stocks", [])
    news = (data.load_cache("topics") or {}).get("items", [])
    out = generate_outlook(stocks, news)
    data.save_cache("outlook", {"items": out, "enabled": _has_key()})
    return out
