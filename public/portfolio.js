// 投資管理 — 全データはブラウザの localStorage に保存（端末内のみ）
const STORE_KEY = "usakabu_portfolio_v1";

const defaultData = () => ({
  fxRate: 155,                 // USD/JPY 換算レート
  transfers: [],               // {id, date, from, amount, memo}
  holdings: [],                // {id, ticker, name, currency, shares, cost, price}
  trades: [],                  // {id, date, side, ticker, shares, price, memo}
  snapshots: [],               // {date, valueJPY, costJPY}
});

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultData();
    return Object.assign(defaultData(), JSON.parse(raw));
  } catch {
    return defaultData();
  }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---- フォーマッタ ----
const yen = (v) => "¥" + Math.round(v || 0).toLocaleString("ja-JP");
const numFmt = (v, d = 2) => (v == null || v === "" ? "—" : Number(v).toLocaleString("ja-JP", { maximumFractionDigits: d }));
const plClass = (v) => (v == null ? "" : v >= 0 ? "pos" : "neg");
const sign = (v) => (v > 0 ? "+" : "");

// USD建ての金額を円換算
function toJPY(amount, currency) {
  return currency === "USD" ? amount * (data.fxRate || 0) : amount;
}

// ---- 集計 ----
function holdingStats(h) {
  const shares = Number(h.shares) || 0;
  const cost = Number(h.cost) || 0;
  const price = h.price === "" || h.price == null ? null : Number(h.price);
  const costTotal = shares * cost;
  const valueTotal = price == null ? null : shares * price;
  const pl = valueTotal == null ? null : valueTotal - costTotal;
  const plPct = valueTotal == null || costTotal === 0 ? null : pl / costTotal;
  return { shares, cost, price, costTotal, valueTotal, pl, plPct };
}

function portfolioTotals() {
  let valueJPY = 0, costJPY = 0, hasValue = false;
  for (const h of data.holdings) {
    const s = holdingStats(h);
    costJPY += toJPY(s.costTotal, h.currency);
    if (s.valueTotal != null) { valueJPY += toJPY(s.valueTotal, h.currency); hasValue = true; }
    else { valueJPY += toJPY(s.costTotal, h.currency); } // 現在値未入力は取得額で代用
  }
  const depositTotal = data.transfers.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  return { valueJPY, costJPY, depositTotal, hasValue, plJPY: valueJPY - costJPY };
}

// ---- レンダリング ----
function renderSummary() {
  const t = portfolioTotals();
  document.getElementById("sum-deposit").textContent = yen(t.depositTotal);
  const byPerson = {};
  for (const tr of data.transfers) byPerson[tr.from] = (byPerson[tr.from] || 0) + (Number(tr.amount) || 0);
  document.getElementById("sum-deposit-sub").textContent =
    Object.keys(byPerson).length ? Object.entries(byPerson).map(([k, v]) => `${k} ${yen(v)}`).join(" / ") : "—";

  document.getElementById("sum-value").textContent = yen(t.valueJPY);
  document.getElementById("sum-value-sub").textContent = "取得額 " + yen(t.costJPY);

  const plEl = document.getElementById("sum-pl");
  plEl.textContent = (t.plJPY >= 0 ? "+" : "") + yen(t.plJPY).replace("¥", "¥");
  plEl.className = "sum-value " + plClass(t.plJPY);
  const plPct = t.costJPY ? t.plJPY / t.costJPY : null;
  document.getElementById("sum-pl-sub").textContent = plPct == null ? "—" : sign(plPct * 100) + (plPct * 100).toFixed(2) + "%";
}

function renderTransfers() {
  const body = document.getElementById("transfer-body");
  const rows = [...data.transfers].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) { body.innerHTML = `<tr><td colspan="5" class="empty">まだ記録がありません</td></tr>`; return; }
  body.innerHTML = rows.map((t) => `<tr>
    <td>${t.date || "—"}</td>
    <td style="text-align:left"><span class="badge">${t.from || ""}</span></td>
    <td>${yen(t.amount)}</td>
    <td style="text-align:left" class="memo">${esc(t.memo)}</td>
    <td><button class="del" data-kind="transfers" data-id="${t.id}">×</button></td>
  </tr>`).join("");
}

function renderHoldings() {
  const body = document.getElementById("holding-body");
  if (!data.holdings.length) { body.innerHTML = `<tr><td colspan="10" class="empty">まだ保有銘柄がありません</td></tr>`; return; }
  const cur = (c) => (c === "USD" ? "$" : "¥");
  body.innerHTML = data.holdings.map((h) => {
    const s = holdingStats(h);
    const c = cur(h.currency);
    return `<tr>
      <td style="text-align:left"><span class="tk">${esc(h.ticker) || "—"}</span><br><span class="nm">${esc(h.name)}</span></td>
      <td>${h.currency}</td>
      <td>${numFmt(s.shares, 4)}</td>
      <td>${c}${numFmt(s.cost)}</td>
      <td>${s.price == null ? "—" : c + numFmt(s.price)}</td>
      <td>${c}${numFmt(s.costTotal)}</td>
      <td>${s.valueTotal == null ? "—" : c + numFmt(s.valueTotal)}</td>
      <td class="${plClass(s.pl)}">${s.pl == null ? "—" : sign(s.pl) + c + numFmt(s.pl)}</td>
      <td class="${plClass(s.plPct)}">${s.plPct == null ? "—" : sign(s.plPct * 100) + (s.plPct * 100).toFixed(2) + "%"}</td>
      <td><button class="del" data-kind="holdings" data-id="${h.id}">×</button></td>
    </tr>`;
  }).join("");
}

function renderTrades() {
  const body = document.getElementById("trade-body");
  const rows = [...data.trades].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) { body.innerHTML = `<tr><td colspan="7" class="empty">まだ記録がありません</td></tr>`; return; }
  body.innerHTML = rows.map((t) => `<tr>
    <td>${t.date || "—"}</td>
    <td><span class="badge ${t.side === "売" ? "sell" : "buy"}">${t.side}</span></td>
    <td style="text-align:left"><span class="tk">${esc(t.ticker)}</span></td>
    <td>${numFmt(t.shares, 4)}</td>
    <td>${t.price == null || t.price === "" ? "—" : numFmt(t.price)}</td>
    <td style="text-align:left" class="memo">${esc(t.memo)}</td>
    <td><button class="del" data-kind="trades" data-id="${t.id}">×</button></td>
  </tr>`).join("");
}

function renderChart() {
  const chart = document.getElementById("asset-chart");
  const info = document.getElementById("snap-info");
  const pts = [...data.snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = pts[pts.length - 1];
  info.textContent = last ? `直近記録: ${last.date}（${yen(last.valueJPY)}）／全 ${pts.length} 点` : "まだ記録がありません";

  if (pts.length < 2) {
    chart.innerHTML = `<div class="trend-empty">「今日の評価額を記録」を押すたびに点が増え、2点以上でグラフになります（現在 ${pts.length} 点）</div>`;
    return;
  }
  const W = 660, H = 220, padL = 56, padR = 14, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const vals = pts.flatMap((p) => [p.valueJPY, p.costJPY]);
  const min = Math.min(...vals, 0), max = Math.max(...vals);
  const span = max - min || 1;
  const n = pts.length;
  const x = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + (1 - (v - min) / span) * innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = min + f * span;
    return `<line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="rgba(120,150,200,0.15)"/>
      <text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" fill="#6b7da6" font-size="10">${yen(v)}</text>`;
  }).join("");

  const line = (key, color) => {
    const p = pts.map((pt, i) => `${x(i).toFixed(1)},${y(pt[key]).toFixed(1)}`).join(" ");
    return `<polyline points="${p}" fill="none" stroke="${color}" stroke-width="2" style="filter:drop-shadow(0 0 4px ${color})"/>`;
  };

  chart.innerHTML = `<div class="trend-legend" style="margin-bottom:6px">
      <span class="lg" style="color:#00f0ff"><i style="background:#00f0ff"></i>評価額</span>
      <span class="lg" style="color:#ff2bd6"><i style="background:#ff2bd6"></i>取得額</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
      ${ticks}${line("costJPY", "#ff2bd6")}${line("valueJPY", "#00f0ff")}
    </svg>`;
}

function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderAll() { renderSummary(); renderTransfers(); renderHoldings(); renderTrades(); renderChart(); }

// ---- 入力ハンドリング ----
function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => (o[k] = typeof v === "string" ? v.trim() : v));
  return o;
}

document.getElementById("transfer-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const o = formData(e.target);
  data.transfers.push({ id: uid(), date: o.date, from: o.from, amount: Number(o.amount), memo: o.memo });
  save(); renderAll(); e.target.reset();
});

document.getElementById("holding-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const o = formData(e.target);
  data.holdings.push({
    id: uid(), ticker: (o.ticker || "").toUpperCase(), name: o.name, currency: o.currency,
    shares: Number(o.shares), cost: Number(o.cost), price: o.price === "" ? null : Number(o.price),
  });
  save(); renderAll(); e.target.reset();
});

document.getElementById("trade-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const o = formData(e.target);
  data.trades.push({
    id: uid(), date: o.date, side: o.side, ticker: (o.ticker || "").toUpperCase(),
    shares: o.shares === "" ? null : Number(o.shares), price: o.price === "" ? null : Number(o.price), memo: o.memo,
  });
  save(); renderAll(); e.target.reset();
});

// 削除（イベント委譲）
document.querySelector("main").addEventListener("click", (e) => {
  const btn = e.target.closest(".del");
  if (!btn) return;
  const { kind, id } = btn.dataset;
  data[kind] = data[kind].filter((x) => x.id !== id);
  save(); renderAll();
});

// FXレート
const fxInput = document.getElementById("fx-rate");
fxInput.value = data.fxRate;
fxInput.addEventListener("input", () => {
  data.fxRate = Number(fxInput.value) || 0;
  save(); renderSummary(); renderChart();
});

// スナップショット記録
document.getElementById("snap-btn").addEventListener("click", () => {
  const t = portfolioTotals();
  const today = new Date().toISOString().slice(0, 10);
  const existing = data.snapshots.find((s) => s.date === today);
  const rec = { date: today, valueJPY: Math.round(t.valueJPY), costJPY: Math.round(t.costJPY) };
  if (existing) Object.assign(existing, rec);
  else data.snapshots.push(rec);
  save(); renderChart();
});

// レーダー(screener.json)から米国株価を取得して現在値欄に入れる
document.getElementById("fetch-price").addEventListener("click", async () => {
  const form = document.getElementById("holding-form");
  const ticker = (form.ticker.value || "").trim().toUpperCase();
  if (!ticker) { alert("先に銘柄コードを入力してください"); return; }
  try {
    const r = await fetch("./data/screener.json", { cache: "no-store" });
    const j = await r.json();
    const hit = (j.stocks || []).find((s) => (s.ticker || "").toUpperCase() === ticker);
    if (hit && hit.price != null) {
      form.price.value = hit.price;
      form.currency.value = "USD";
    } else {
      alert(`${ticker} はレーダー銘柄に見つかりませんでした。現在値は手入力してください。`);
    }
  } catch {
    alert("株価データの取得に失敗しました。現在値は手入力してください。");
  }
});

// ---- 書き出し / 読み込み ----
document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-file").click());
document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!confirm("現在のデータを読み込んだ内容で置き換えます。よろしいですか？")) return;
      data = Object.assign(defaultData(), obj);
      save();
      fxInput.value = data.fxRate;
      renderAll();
      alert("読み込みました。");
    } catch {
      alert("JSONの読み込みに失敗しました。");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ---- 楽天証券 取引履歴CSV 取り込み ----
// 期待ヘッダ: 約定日 受渡日 ファンド名 分配金 口座 取引 買付方法 数量［口］ 単価 経費 為替レート 受付金額[現地通貨] 受渡金額/(ポイント利用)[円] 決済通貨
const RAKUTEN_HEADERS = ["約定日", "ファンド名", "取引", "数量", "単価"];

function decodeCsvBuffer(buf) {
  const bytes = new Uint8Array(buf);
  // UTF-8 BOM があれば UTF-8、無ければまず Shift_JIS で試す
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const tryDecode = (enc) => { try { return new TextDecoder(enc).decode(buf); } catch { return null; } };
  if (hasBom) return tryDecode("utf-8");
  const sjis = tryDecode("shift_jis");
  // 期待ヘッダが含まれていれば Shift_JIS 成功とみなす
  if (sjis && sjis.includes("ファンド名")) return sjis;
  const utf8 = tryDecode("utf-8");
  if (utf8 && utf8.includes("ファンド名")) return utf8;
  return sjis || utf8 || "";
}

// クォート対応の簡易CSVパーサ
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const cleanNum = (s) => {
  if (s == null) return 0;
  const v = parseFloat(String(s).replace(/[¥,\s円]/g, ""));
  return Number.isFinite(v) ? v : 0;
};
const normDate = (s) => {
  if (!s) return "";
  const m = String(s).trim().match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return String(s).trim();
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
};

function importRakuten(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) { alert("CSVにデータ行が見つかりませんでした。"); return; }

  // ヘッダ行を探す（先頭数行のうち期待列を最も多く含む行）
  let headerIdx = 0, best = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const hit = RAKUTEN_HEADERS.filter((h) => rows[i].some((c) => c.includes(h))).length;
    if (hit > best) { best = hit; headerIdx = i; }
  }
  if (best < 3) { alert("楽天証券の取引履歴CSVとして認識できませんでした。列見出しをご確認ください。"); return; }

  const header = rows[headerIdx].map((h) => h.trim());
  const col = (key) => header.findIndex((h) => h.includes(key));
  const idx = {
    date: col("約定日"), name: col("ファンド名"), dist: col("分配金"), acct: col("口座"),
    deal: col("取引"), method: col("買付方法"), qty: col("数量"), price: col("単価"),
    yen: header.findIndex((h) => h.includes("受渡金額")),
  };

  const sigSet = new Set(data.trades.map((t) => t._sig).filter(Boolean));
  const funds = {}; // ファンド名 -> {buyQty, buyYen, sellQty, sellYen}
  let added = 0, skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[idx.name] || "").trim();
    if (!name) continue;
    const date = normDate(r[idx.date]);
    const deal = (r[idx.deal] || "").trim();
    const qty = cleanNum(r[idx.qty]);
    const price = cleanNum(r[idx.price]);
    const yen = idx.yen >= 0 ? cleanNum(r[idx.yen]) : 0;
    const acct = (r[idx.acct] || "").trim();
    const method = idx.method >= 0 ? (r[idx.method] || "").trim() : "";
    const dist = idx.dist >= 0 ? cleanNum(r[idx.dist]) : 0;
    const isSell = deal.includes("売") || deal.includes("解約");

    // 売買メモへ（重複は約定日+ファンド+取引+金額で判定してスキップ）
    const sig = `${date}|${name}|${deal}|${qty}|${yen}`;
    if (sigSet.has(sig)) { skipped++; }
    else {
      sigSet.add(sig);
      const memoParts = [acct, method].filter(Boolean);
      if (yen) memoParts.push(`受渡¥${Math.round(yen).toLocaleString("ja-JP")}`);
      if (dist) memoParts.push(`分配¥${Math.round(dist).toLocaleString("ja-JP")}`);
      data.trades.push({
        id: uid(), _sig: sig, date, side: isSell ? "売" : "買", ticker: name,
        shares: qty, price, memo: memoParts.join(" / "),
      });
      added++;
    }

    // ファンド集計（取得額は受渡金額[円]ベース）
    const f = (funds[name] = funds[name] || { buyQty: 0, buyYen: 0, sellQty: 0 });
    if (isSell) f.sellQty += qty;
    else { f.buyQty += qty; f.buyYen += yen; }
  }

  // 保有銘柄へ反映（同名ファンドはUPSERT）。取得単価=受渡金額合計/口数（1口あたり円）
  for (const [name, f] of Object.entries(funds)) {
    const netQty = f.buyQty - f.sellQty;
    if (netQty <= 0 || f.buyQty <= 0) continue;
    const costPerUnit = f.buyYen / f.buyQty; // 1口あたり取得単価（円）
    const existing = data.holdings.find((h) => h.name === name && h.currency === "JPY");
    if (existing) {
      existing.shares = netQty;
      existing.cost = costPerUnit;
    } else {
      data.holdings.push({
        id: uid(), ticker: "投信", name, currency: "JPY",
        shares: netQty, cost: costPerUnit, price: null,
      });
    }
  }

  save(); renderAll();
  alert(`取り込み完了：売買メモに ${added} 件追加（重複 ${skipped} 件スキップ）、保有ファンド ${Object.keys(funds).length} 件を更新しました。\n\n投資信託の「現在値」は1口あたりの円で空欄です。評価額を出すには各ファンドの最新「基準価額 ÷ 10000」を現在値欄に入れてください。`);
}

document.getElementById("rakuten-btn").addEventListener("click", () => document.getElementById("rakuten-file").click());
document.getElementById("rakuten-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { importRakuten(decodeCsvBuffer(reader.result)); }
    catch (err) { alert("CSVの取り込みに失敗しました：" + err.message); }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = "";
});

// 日付入力の既定値を今日に
for (const f of ["transfer-form", "trade-form"]) {
  const d = document.querySelector(`#${f} input[name="date"]`);
  if (d) d.value = new Date().toISOString().slice(0, 10);
}

renderAll();
