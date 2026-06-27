# AI Stock Radar

米国株の **半導体 / AI / フィジカルAI** セクターから優良株を総合スコアで抽出し、
ニュースの日本語要約と AI による市場見通しを表示する Web アプリ。黒背景のサイバー調デザイン。

データソースは **yfinance（無料）**。ニュース和訳と市場見通しは **Claude API**（任意）。

---

## アーキテクチャ（Vercel + GitHub）

Vercel はサーバーレスで常駐処理やローカルファイル保存ができないため、
**データ生成は GitHub Actions が担当し、Vercel は静的サイトとして配信**します。

```
GitHub Actions（cronで定期実行）
  └ python -m app.build_data   … yfinance取得・和訳・見通し生成
      └ public/data/*.json を生成し、リポジトリへ自動コミット
          └ Vercel が push を検知して public/ を自動デプロイ
```

| パス | 役割 |
|---|---|
| `public/` | Vercel が配信する静的サイト（`index.html` / `style.css` / `app.js` / `data/`） |
| `app/build_data.py` | データ生成のエントリポイント（Actions・ローカル共通） |
| `app/{data,screener,translate,outlook,universe}.py` | 取得・採点・和訳・見通し・銘柄定義 |
| `app/main.py` | ローカル開発用サーバ（`public/` を配信＋定期生成） |
| `.github/workflows/refresh.yml` | 定期実行ワークフロー |
| `vercel.json` | 静的配信設定（出力ディレクトリ = `public`） |

---

## デプロイ手順

### 1. GitHub にプッシュ
```powershell
cd "C:\Users\Sora Amano\ai-stock-radar"
# GitHubで空のリポジトリを作成後、その URL を origin に設定
git remote add origin https://github.com/<あなた>/ai-stock-radar.git
git branch -M main
git push -u origin main
```

### 2. Vercel にインポート
1. [vercel.com](https://vercel.com) で GitHub 連携 → このリポジトリを Import
2. Framework Preset は **Other**（`vercel.json` が出力先 `public` を指定済み）
3. Deploy。これで静的サイトが公開されます。

### 3. （任意）ニュース和訳・市場見通しを有効化
Claude API を使う機能を有効にするには、APIキーを **GitHub Secrets** に登録します。

- GitHub リポジトリ → Settings → Secrets and variables → Actions → New repository secret
- Name: `ANTHROPIC_API_KEY` / Value: `sk-ant-...`（[Anthropic Console](https://console.anthropic.com) で発行）

以後、Actions の実行時に和訳と見通しが生成されます。キー未設定でも英語ニュース＋スクリーニングは動作します。

### 4. 自動更新
`.github/workflows/refresh.yml` が平日の取引時間中（毎時）にデータを再生成し自動コミット →
Vercel が再デプロイします。手動実行は GitHub の Actions タブ → Refresh data → Run workflow。

---

## ローカル開発

```powershell
cd "C:\Users\Sora Amano\ai-stock-radar"
.\run.ps1
```
http://127.0.0.1:8000 を開きます。サーバが `public/` を配信し、
バックグラウンドで `app.build_data` を実行して `public/data/*.json` を生成します。

和訳・見通しをローカルで試す場合は、起動前にキーを設定：
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
.\run.ps1
```

データだけ手動生成する場合：
```powershell
.\.venv\Scripts\python.exe -m app.build_data
```

---

## 機能

| 機能 | 内容 |
|---|---|
| 優良株ランキング | 成長性・収益性・モメンタム・アナリスト評価を総合スコア化(0-100)して順位付け |
| テーマ切替 | すべて / 半導体 / AI / フィジカルAI（クライアント側で絞り込み） |
| トピックス | 各銘柄の最新ニュース。Claude による日本語タイトル＋1行要約（キー設定時） |
| 市場見通し | テーマ別にニュース材料を整理（センチメント・強/弱材料・シナリオ・確信度）。**投資助言ではありません** |

スコアの重みは `app/screener.py` の `METRICS`、銘柄は `app/universe.py` の `UNIVERSE` で調整できます。

---

## 注意

- yfinance は無料ゆえ遅延・レート制限・欠損があります。**データ取得は GitHub Actions 上で実行**するため、
  データセンターIPがブロックされる場合は取得が不安定になることがあります（その場合は有料API化を検討）。
- 市場見通しは公開ニュース材料の整理であり、**投資助言ではありません。投資判断は自己責任で。**
