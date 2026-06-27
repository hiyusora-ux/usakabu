"""ローカル開発用サーバ。

本番（Vercel）は public/ を静的配信し、データは GitHub Actions が生成する。
ローカルでは本ファイルが public/ を配信し、同じ build_data.build() を
スケジュール実行して public/data/*.json を生成する（本番と同一の出力）。
"""
from __future__ import annotations

import threading
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import build_data

PUBLIC = Path(__file__).resolve().parent.parent / "public"

app = FastAPI(title="AI Stock Radar (local dev)")
_lock = threading.Lock()


def _build():
    if not _lock.acquire(blocking=False):
        return
    try:
        build_data.build()
    finally:
        _lock.release()


@app.on_event("startup")
def on_startup():
    # 初回データが無ければバックグラウンドで生成
    if not (PUBLIC / "data" / "screener.json").exists():
        threading.Thread(target=_build, daemon=True).start()

    sched = BackgroundScheduler(timezone="America/New_York")
    # 取引時間中は毎時、引け後にも1回（トピックス＋見通しを更新）
    sched.add_job(_build, "cron", hour="9-17", minute=0, day_of_week="mon-fri")
    sched.start()
    app.state.sched = sched


@app.post("/api/refresh")
def api_refresh():
    """手動再生成（ローカル確認用）。"""
    threading.Thread(target=_build, daemon=True).start()
    return {"status": "refreshing"}


@app.get("/")
def index():
    return FileResponse(PUBLIC / "index.html")


app.mount("/", StaticFiles(directory=PUBLIC, html=True), name="public")
