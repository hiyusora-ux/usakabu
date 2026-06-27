"""ルールベースの市場見通し（APIキー不要・完全無料）。

セクター集計（相対強度・モメンタム・ブレッド・成長率）と各セクターの
ニュース件数から、しきい値ルールで見通しコメントを自動生成する。
出力スキーマは Claude 版 outlook と同一なので、フロントはそのまま表示できる。
※ AIによる洞察ではなく「数値の言い換え」である点に注意。
"""
from __future__ import annotations

from app.universe import tickers_for_theme

SENT = {5: "強気", 4: "やや強気", 3: "中立", 2: "やや弱気", 1: "弱気"}

WATCH_BY_THEME = {
    "semiconductor": "メモリ・HBMの価格動向と主要企業の決算",
    "ai": "大手テックの決算とAI設備投資のガイダンス",
    "physical_ai": "自動運転・ロボティクスの実用化進捗",
}


def _pct(v) -> str:
    return f"{v * 100:.0f}%" if isinstance(v, (int, float)) else "—"


def rule_outlook(sectors: list[dict], news: list[dict]) -> list[dict]:
    items = []
    n_sec = len(sectors)

    for s in sectors:
        theme = s["theme"]
        st = s.get("strength")
        st = st if isinstance(st, (int, float)) else 50
        m3 = s.get("avg_mom_3m")
        g = s.get("avg_revenue_growth")
        br = s.get("breadth")
        sc = s.get("avg_score")
        rank = s.get("rank")
        count = s.get("count", 0)

        allow = set(tickers_for_theme(theme))
        ncount = sum(1 for it in news if it.get("ticker") in allow)

        # センチメント（相対強度から）
        if st >= 70:
            score = 5
        elif st >= 60:
            score = 4
        elif st >= 45:
            score = 3
        elif st >= 35:
            score = 2
        else:
            score = 1

        # 強材料
        bull = []
        if isinstance(m3, (int, float)) and m3 >= 0.2:
            bull.append(f"3Mモメンタムが+{_pct(m3)}と強い")
        if isinstance(br, (int, float)) and br >= 0.7:
            bull.append(f"上昇銘柄が多い（ブレッド{_pct(br)}）")
        if isinstance(g, (int, float)) and g >= 0.2:
            bull.append(f"平均売上成長が+{_pct(g)}")
        if isinstance(sc, (int, float)) and sc >= 55:
            bull.append("平均スコアが高い（質の高い銘柄が中心）")
        if not bull:
            bull.append("際立った強材料は乏しい")

        # 弱材料
        bear = []
        if isinstance(m3, (int, float)) and m3 < 0:
            bear.append("3Mモメンタムがマイナス")
        if isinstance(br, (int, float)) and br < 0.5:
            bear.append(f"上昇銘柄が半数未満（地合いが限定的・ブレッド{_pct(br)}）")
        if isinstance(g, (int, float)) and g < 0.1:
            bear.append("平均売上成長が鈍い")
        if isinstance(m3, (int, float)) and m3 > 0.5:
            bear.append("短期上昇が大きく、反落リスクに注意")
        if rank == n_sec and n_sec > 1:
            bear.append("3セクター中で相対的に出遅れ")
        if not bear:
            bear.append("急変時のボラティリティには注意")

        # シナリオ（相対的な立ち位置）
        if rank == 1:
            pos = "3セクターで最も強い相対強度"
        elif rank == n_sec:
            pos = "3セクターで相対的に最も弱い"
        else:
            pos = "3セクター中で中位の相対強度"
        scenario = f"相対強度{st}（{rank}位）。{pos}。直近ニュース{ncount}件。"

        # ウォッチポイント
        watch = [WATCH_BY_THEME.get(theme, "主要企業の決算とガイダンス")]
        if ncount >= 12:
            watch.append(f"ニュースが増加（{ncount}件）— 材料の消化に注目")

        conf = "中" if (isinstance(br, (int, float)) and count >= 15) else "低"

        items.append({
            "theme": theme,
            "label": s["label"],
            "sentiment": SENT[score],
            "sentiment_score": score,
            "bull_points": bull[:4],
            "bear_points": bear[:3],
            "scenario": scenario,
            "watch_points": watch[:2],
            "confidence": conf,
        })

    return items
