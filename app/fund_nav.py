"""投資信託の基準価額を「ログインなし」で取得する。

データ源は投資信託協会の公開CSV（toushin-lib）。日次で更新される
基準価額の履歴CSVから最新の1点を取り出す。口座情報は一切使わない。
出力は build_data 経由で public/data/fund_nav.json に書き出され、
フロント（保有銘柄の「現在値」自動同期）が利用する。
"""
from __future__ import annotations

import csv
import io
import re
import urllib.request

# (表示名, ISINコード, 協会コード, 別名リスト) ※別名は名称ゆれ吸収用
FUNDS = [
    (
        "eMAXIS Slim 米国株式(S&P500)",
        "JP90C000GKC6",
        "03311187",
        ["eMAXIS Slim 米国株式（S＆P500）", "eMAXIS Slim 米国株式(S&P500)"],
    ),
    (
        "eMAXIS Slim 全世界株式(オール・カントリー)",
        "JP90C000H1T1",
        "0331418A",
        ["eMAXIS Slim 全世界株式（オール・カントリー）", "eMAXIS Slim 全世界株式(オール・カントリー)", "eMAXIS Slim 全世界株式"],
    ),
    (
        "楽天・プラス・NASDAQ-100インデックス・ファンド",
        "JP90C000QF22",
        "9I314241",
        ["楽天・NASDAQ-100インデックス・ファンド", "楽天・プラス・NASDAQ-100", "楽天・NASDAQ-100"],
    ),
]

CSV_URL = "https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download?isinCd={isin}&associFundCd={code}"


def _parse_date(s: str) -> str:
    m = re.search(r"(\d{4}).*?(\d{1,2}).*?(\d{1,2})", s)
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else s.strip()


def _latest_nav(isin: str, code: str) -> tuple[str, int]:
    req = urllib.request.Request(
        CSV_URL.format(isin=isin, code=code), headers={"User-Agent": "Mozilla/5.0"}
    )
    raw = urllib.request.urlopen(req, timeout=25).read()
    rows = [r for r in csv.reader(io.StringIO(raw.decode("shift_jis"))) if r and r[0].strip()]
    # 1行目はヘッダ。最後のデータ行が最新（年月日, 基準価額, 純資産, 分配金, 決算日）
    last = rows[-1]
    return _parse_date(last[0]), int(str(last[1]).replace(",", ""))


def build_fund_nav() -> list[dict]:
    out = []
    for name, isin, code, aliases in FUNDS:
        try:
            date, nav = _latest_nav(isin, code)
            out.append({
                "name": name, "code": code, "isin": isin,
                "names": [name, *aliases], "date": date, "nav": nav,
            })
        except Exception as e:  # 1本失敗しても他は継続
            print(f"fund_nav: {name} 取得失敗 {e!r}")
    return out


if __name__ == "__main__":
    for f in build_fund_nav():
        print(f["date"], f"{f['nav']:>7,}", f["name"])
