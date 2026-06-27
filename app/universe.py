"""テーマ別の銘柄ユニバース。

1銘柄が複数テーマに属することがある（例: NVDA は半導体でありフィジカルAIの中核でもある）。
THEMES に master を定義し、各銘柄に tags を付与する。
"""

# テーマの表示名
THEME_LABELS = {
    "semiconductor": "半導体",
    "ai": "AI（ソフト/プラットフォーム）",
    "physical_ai": "フィジカルAI（ロボ/自律）",
}

# ticker -> {name, tags}
UNIVERSE = {
    # --- 半導体 ---
    "NVDA": {"name": "NVIDIA", "tags": ["semiconductor", "ai", "physical_ai"]},
    "AMD":  {"name": "AMD", "tags": ["semiconductor", "ai"]},
    "AVGO": {"name": "Broadcom", "tags": ["semiconductor", "ai"]},
    "TSM":  {"name": "TSMC", "tags": ["semiconductor"]},
    "ASML": {"name": "ASML", "tags": ["semiconductor"]},
    "AMAT": {"name": "Applied Materials", "tags": ["semiconductor"]},
    "LRCX": {"name": "Lam Research", "tags": ["semiconductor"]},
    "KLAC": {"name": "KLA Corp", "tags": ["semiconductor"]},
    "MU":   {"name": "Micron", "tags": ["semiconductor", "ai"]},
    "QCOM": {"name": "Qualcomm", "tags": ["semiconductor"]},
    "TXN":  {"name": "Texas Instruments", "tags": ["semiconductor"]},
    "ADI":  {"name": "Analog Devices", "tags": ["semiconductor"]},
    "MRVL": {"name": "Marvell", "tags": ["semiconductor", "ai"]},
    "ARM":  {"name": "Arm Holdings", "tags": ["semiconductor", "ai"]},
    "SMCI": {"name": "Super Micro", "tags": ["semiconductor", "ai"]},
    "NXPI": {"name": "NXP Semiconductors", "tags": ["semiconductor", "physical_ai"]},
    "MCHP": {"name": "Microchip", "tags": ["semiconductor"]},
    "ON":   {"name": "onsemi", "tags": ["semiconductor", "physical_ai"]},
    "MPWR": {"name": "Monolithic Power", "tags": ["semiconductor"]},
    "TER":  {"name": "Teradyne", "tags": ["semiconductor", "physical_ai"]},
    "ALAB": {"name": "Astera Labs", "tags": ["semiconductor", "ai"]},
    "CRDO": {"name": "Credo Technology", "tags": ["semiconductor", "ai"]},
    "COHR": {"name": "Coherent", "tags": ["semiconductor", "ai"]},

    # --- AI（ソフト/プラットフォーム） ---
    "MSFT": {"name": "Microsoft", "tags": ["ai"]},
    "GOOGL":{"name": "Alphabet", "tags": ["ai"]},
    "META": {"name": "Meta Platforms", "tags": ["ai"]},
    "AMZN": {"name": "Amazon", "tags": ["ai"]},
    "ORCL": {"name": "Oracle", "tags": ["ai"]},
    "PLTR": {"name": "Palantir", "tags": ["ai"]},
    "NOW":  {"name": "ServiceNow", "tags": ["ai"]},
    "CRM":  {"name": "Salesforce", "tags": ["ai"]},
    "SNOW": {"name": "Snowflake", "tags": ["ai"]},
    "DDOG": {"name": "Datadog", "tags": ["ai"]},
    "NET":  {"name": "Cloudflare", "tags": ["ai"]},
    "MDB":  {"name": "MongoDB", "tags": ["ai"]},
    "PATH": {"name": "UiPath", "tags": ["ai", "physical_ai"]},

    # --- フィジカルAI（ロボ/自律/自動運転） ---
    "TSLA": {"name": "Tesla", "tags": ["physical_ai", "ai"]},
    "ISRG": {"name": "Intuitive Surgical", "tags": ["physical_ai"]},
    "SYM":  {"name": "Symbotic", "tags": ["physical_ai"]},
    "ROK":  {"name": "Rockwell Automation", "tags": ["physical_ai"]},
    "ZBRA": {"name": "Zebra Technologies", "tags": ["physical_ai"]},
    "PTC":  {"name": "PTC Inc", "tags": ["physical_ai", "ai"]},
    "AUR":  {"name": "Aurora Innovation", "tags": ["physical_ai"]},
    "OUST": {"name": "Ouster", "tags": ["physical_ai"]},
    "RKLB": {"name": "Rocket Lab", "tags": ["physical_ai"]},
    "AVAV": {"name": "AeroVironment", "tags": ["physical_ai"]},
    "SERV": {"name": "Serve Robotics", "tags": ["physical_ai"]},
}


def all_tickers():
    return list(UNIVERSE.keys())


def tickers_for_theme(theme: str):
    if theme in (None, "all"):
        return all_tickers()
    return [t for t, v in UNIVERSE.items() if theme in v["tags"]]


def meta(ticker: str):
    return UNIVERSE.get(ticker, {"name": ticker, "tags": []})
