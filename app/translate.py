"""ニュースの日本語化（タイトル翻訳＋1行要約）。

Anthropic Claude API（モデル: claude-opus-4-8）を使用。
- 1リクエストに複数件まとめてコスト/レイテンシを抑制
- 記事URLをキーにキャッシュし、次回以降は新着のみ翻訳
- ANTHROPIC_API_KEY が無ければ原文のまま返す（フォールバック）
"""
from __future__ import annotations

import os

from pydantic import BaseModel

from app import data

BATCH_SIZE = 25
MODEL = "claude-opus-4-8"


class TranslatedItem(BaseModel):
    index: int
    title_ja: str
    summary_ja: str


class TranslationBatch(BaseModel):
    items: list[TranslatedItem]


def _has_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


SYSTEM = (
    "あなたは米国株の金融ニュースを日本人投資家向けに日本語化するアシスタントです。"
    "各見出しについて、(1) 自然な日本語のタイトル、(2) 見出しから読み取れる要点を述べた"
    "簡潔な1文の日本語要約、を作成します。誇張や投資助言は加えず、事実ベースで端的に。"
    "記事本文は与えられないため、見出しから分かる範囲で要約してください。"
)


def _translate_batch(client, chunk: list[dict]) -> dict[int, dict]:
    lines = []
    for i, it in enumerate(chunk):
        lines.append(f"{i}. [{it.get('ticker','')}] {it.get('title','')}")
    user = (
        "次の米国株ニュースの見出しを日本語化してください。"
        "各 index について title_ja（日本語タイトル）と summary_ja（1文の日本語要約）を返してください。\n\n"
        + "\n".join(lines)
    )
    resp = client.messages.parse(
        model=MODEL,
        max_tokens=8000,
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
        output_format=TranslationBatch,
    )
    parsed = resp.parsed_output
    if not parsed:
        return {}
    return {t.index: {"title_ja": t.title_ja, "summary_ja": t.summary_ja} for t in parsed.items}


def enrich_with_japanese(items: list[dict]) -> list[dict]:
    """items に title_ja / summary_ja を付与。キャッシュ済みは再利用。"""
    cache = (data.load_cache("translations") or {}).get("map", {})

    # 未翻訳（キャッシュに無い）の項目を抽出
    todo = [it for it in items if it.get("link") not in cache]

    if todo and _has_key():
        try:
            from anthropic import Anthropic
            client = Anthropic()
            for i in range(0, len(todo), BATCH_SIZE):
                chunk = todo[i:i + BATCH_SIZE]
                try:
                    result = _translate_batch(client, chunk)
                except Exception:
                    result = {}
                for idx, it in enumerate(chunk):
                    tr = result.get(idx)
                    if tr:
                        cache[it["link"]] = tr
            data.save_cache("translations", {"map": cache})
        except Exception:
            pass  # SDK未導入・認証エラー等は原文フォールバック

    # 付与（未翻訳は原文をそのまま）
    out = []
    for it in items:
        tr = cache.get(it.get("link"))
        out.append({
            **it,
            "title_ja": tr["title_ja"] if tr else None,
            "summary_ja": tr["summary_ja"] if tr else None,
        })
    return out
