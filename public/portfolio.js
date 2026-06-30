// 投資管理 — 全データはブラウザの localStorage に保存（端末内のみ）
const STORE_KEY = "usakabu_portfolio_v1";

const defaultData = () => ({
  fxRate: 155,                 // USD/JPY 換算レート
  balances: {},                // 各口座の記録残高 {口座名: 円}
  transfers: [],               // {id, date, from, to, amount, memo}（移動先は常に父の楽天証券NISA口座）
  holdings: [],                // {id, ticker, name, currency, shares, cost, price}
  trades: [],                  // {id, date, side, ticker, shares, price, memo}
  snapshots: [],               // {date, valueJPY, costJPY}
});

// 移動元の4口座と、移動先（固定）の父NISA口座
const CHILD_ACCOUNTS = ["長男　中銀", "長男　楽天", "長女　中銀", "長女　楽天"];
const NISA = "父の楽天証券NISA口座";
const DISPLAY_ACCOUNTS = [...CHILD_ACCOUNTS, NISA]; // 残高グラフの表示順

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultData();
    const d = Object.assign(defaultData(), JSON.parse(raw));
    // 旧データ移行：移動先は常に父の楽天証券NISA口座に統一
    for (const t of d.transfers) if (!t.to || t.to === "父NISA口座") t.to = NISA;
    // 残高オブジェクトに4口座のキーを用意
    if (!d.balances) d.balances = {};
    for (const a of CHILD_ACCOUNTS) if (!(a in d.balances)) d.balances[a] = 0;
    return d;
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

// 4口座の残高 = 記録残高 − NISAへ移動した額／NISAは受入累計
function accountBalances() {
  const bal = {};
  CHILD_ACCOUNTS.forEach((a) => (bal[a] = Number(data.balances[a]) || 0));
  let nisa = 0;
  for (const t of data.transfers) {
    const amt = Number(t.amount) || 0;
    if (bal[t.from] !== undefined) bal[t.from] -= amt;
    if (t.to === NISA) nisa += amt;
  }
  bal[NISA] = nisa;
  return bal;
}

// ---- レンダリング ----
function renderSummary() {
  const t = portfolioTotals();
  const bal = accountBalances();
  document.getElementById("sum-deposit").textContent = yen(bal[NISA]);
  const byFrom = {};
  for (const tr of data.transfers) {
    if (tr.to !== NISA) continue;
    byFrom[tr.from] = (byFrom[tr.from] || 0) + (Number(tr.amount) || 0);
  }
  document.getElementById("sum-deposit-sub").textContent =
    Object.keys(byFrom).length ? Object.entries(byFrom).map(([k, v]) => `${k} ${yen(v)}`).join(" / ") : "—";

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
  if (!rows.length) { body.innerHTML = `<tr><td colspan="6" class="empty">まだ記録がありません</td></tr>`; return; }
  body.innerHTML = rows.map((t) => `<tr>
    <td>${t.date || "—"}</td>
    <td style="text-align:left"><span class="badge">${esc(t.from)}</span></td>
    <td style="text-align:left"><span class="badge to">${esc(t.to)}</span></td>
    <td>${yen(t.amount)}</td>
    <td style="text-align:left" class="memo">${esc(t.memo)}</td>
    <td><button class="del" data-kind="transfers" data-id="${t.id}">×</button></td>
  </tr>`).join("");
}

// 各口座の記録残高を入力する欄
function renderBalanceInputs() {
  const el = document.getElementById("balance-inputs");
  el.innerHTML = CHILD_ACCOUNTS.map((a) => `<label class="bal-in">
      <span>${a}</span>
      <input class="bal-edit" type="number" step="1" min="0" data-acct="${a}" value="${data.balances[a] || data.balances[a] === 0 ? data.balances[a] : ""}" placeholder="0" />
    </label>`).join("");
}

// 口座残高の横棒グラフ
function renderBalanceChart() {
  const el = document.getElementById("balance-chart");
  const bal = accountBalances();
  const max = Math.max(1, ...DISPLAY_ACCOUNTS.map((a) => Math.abs(bal[a])));
  el.innerHTML = DISPLAY_ACCOUNTS.map((name) => {
    const v = bal[name];
    const w = Math.round((Math.abs(v) / max) * 100);
    const color = v < 0 ? "var(--bad)" : name === NISA ? "var(--magenta)" : "var(--cyan)";
    return `<div class="bal-row">
      <div class="bal-name">${name}</div>
      <div class="bal-track"><span class="bal-bar" style="width:${w}%;background:${color};box-shadow:0 0 8px ${color}"></span></div>
      <div class="bal-val ${v < 0 ? "neg" : ""}">${yen(v)}</div>
    </div>`;
  }).join("");
}

function renderHoldings() {
  const body = document.getElementById("holding-body");
  if (!data.holdings.length) { body.innerHTML = `<tr><td colspan="10" class="empty">まだ保有銘柄がありません</td></tr>`; return; }
  const cur = (c) => (c === "USD" ? "$" : "¥");
  body.innerHTML = data.holdings.map((h) => {
    const s = holdingStats(h);
    const c = cur(h.currency);
    const isFund = h.ticker === "投信";          // 投信は基準価額(1万口あたり)で入出力
    const mult = isFund ? 10000 : 1;
    const priceVal = s.price == null ? "" : s.price * mult;
    return `<tr>
      <td style="text-align:left"><span class="tk">${esc(h.ticker) || "—"}</span><br><span class="nm">${esc(h.name)}</span></td>
      <td>${h.currency}</td>
      <td>${numFmt(s.shares, 4)}</td>
      <td>${c}${numFmt(s.cost * mult)}</td>
      <td><input class="price-edit" type="number" step="any" min="0" data-id="${h.id}" data-mult="${mult}" value="${priceVal}" placeholder="${isFund ? "基準価額" : "現在値"}" /></td>
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

function renderAll() { renderSummary(); renderBalanceInputs(); renderTransfers(); renderBalanceChart(); renderHoldings(); renderTrades(); renderChart(); }

// ---- 入力ハンドリング ----
function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => (o[k] = typeof v === "string" ? v.trim() : v));
  return o;
}

document.getElementById("transfer-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const o = formData(e.target);
  data.transfers.push({ id: uid(), date: o.date, from: o.from, to: NISA, amount: Number(o.amount), memo: o.memo });
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

// 口座残高の記録欄を編集（入力中はグラフ/サマリーだけ更新してフォーカス維持）
document.getElementById("balance-inputs").addEventListener("input", (e) => {
  const inp = e.target.closest(".bal-edit");
  if (!inp) return;
  data.balances[inp.dataset.acct] = inp.value === "" ? 0 : Number(inp.value);
  save(); renderSummary(); renderBalanceChart();
});

// 保有銘柄テーブルの現在値を直接編集（投信は基準価額÷mult を内部保存）
document.getElementById("holding-body").addEventListener("change", (e) => {
  const inp = e.target.closest(".price-edit");
  if (!inp) return;
  const h = data.holdings.find((x) => x.id === inp.dataset.id);
  if (!h) return;
  const mult = Number(inp.dataset.mult) || 1;
  h.price = inp.value === "" ? null : Number(inp.value) / mult;
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
  const ok = (t) => t && (t.includes("ファンド名") || t.includes("銘柄") || t.includes("区分") || t.includes("基準価額"));
  const sjis = tryDecode("shift_jis");
  if (ok(sjis)) return sjis;
  const utf8 = tryDecode("utf-8");
  if (ok(utf8)) return utf8;
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
    if (sigSet.has(sig)) { skipped++; continue; }
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

  save(); renderAll();
  alert(`取引履歴を取り込みました：売買メモに ${added} 件追加（重複 ${skipped} 件スキップ）。\n\n保有銘柄・評価額は「保有CSV取込」（資産残高CSV）から取り込んでください。`);
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

// ---- 楽天証券 資産残高CSV（保有商品一覧）取り込み ----
// 明細ヘッダ: 区分 / 銘柄コード・ティッカー / 銘柄 / 口座 / 保有数量 /【単位】/ 平均取得価額 /【単位】/
//             現在値 /【単位】/ 現在値(更新日) / (参考為替) / 前日比 /【単位】/ 時価評価額[円] / 時価評価額[外貨] / 評価損益[円] / 評価損益[％]
const SKIP_KUBUN = ["外貨預り", "預り金", "ＭＲＦ", "MRF", "マネーファンド", "ＭＭＦ", "MMF", "保護預り"];

function importRakutenHoldings(text) {
  const rows = parseCSV(text);
  // 明細ヘッダ行（「銘柄」列と「保有数量」列を持つ行）を探す ※先頭列は「種別」
  const hIdx = rows.findIndex((r) =>
    r.some((c) => c.includes("銘柄") && !c.includes("コード")) && r.some((c) => c.includes("保有数量")));
  if (hIdx < 0) { alert("楽天証券の資産残高CSV（保有商品一覧）として認識できませんでした。"); return; }
  const header = rows[hIdx].map((h) => h.trim());
  const find = (fn) => header.findIndex(fn);
  const qtyCol = find((h) => h.includes("保有数量"));
  const idx = {
    kubun: 0,
    code: find((h) => h.includes("コード") || h.includes("ティッカー")),
    name: find((h) => h.includes("銘柄") && !h.includes("コード")),
    qty: qtyCol,
    unit: find((h, i) => i > qtyCol && h.includes("単位")),       // 保有数量直後の【単位】= 口/株
    value: find((h) => h.includes("時価評価額") && h.includes("円")),
    pl: find((h) => h.includes("評価損益") && h.includes("円")),  // [％]ではなく[円]
  };

  // 評価額・取得額はすべて円建てで集計し、楽天の数値（時価評価額[円]・評価損益[円]）に一致させる。
  // 取得額[円] = 時価評価額[円] − 評価損益[円]。USD銘柄も取得時の円コストを反映できるよう円で保持。
  const merged = {}; // key -> 集計
  let fxFromCsv = null;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 6) continue;
    const kubun = (r[idx.kubun] || "").trim();
    const name = (r[idx.name] || "").trim();
    // 参考為替レート（米ドル）を拾う（USD/JPYカード表示用）
    if (kubun.includes("米ドル") && /円\s*\/\s*USD/.test(r[2] || "")) fxFromCsv = cleanNum(r[1]) || fxFromCsv;
    if (kubun.startsWith("■") || kubun.includes("参考為替")) break; // 明細セクション終わり
    if (!name || SKIP_KUBUN.some((k) => kubun.includes(k))) continue;

    const qty = cleanNum(r[idx.qty]);
    const valueYen = cleanNum(r[idx.value]);
    if (qty <= 0 || valueYen <= 0) continue;
    const plYen = cleanNum(r[idx.pl]);          // '-' は0扱い
    const acqYen = valueYen - plYen;            // 取得額[円]
    const isFund = (r[idx.unit] || "").includes("口");

    const key = `${isFund ? "F" : "S"}|${name}`;
    const m = (merged[key] = merged[key] || { name, isFund, code: (r[idx.code] || "").trim(), qty: 0, valueYen: 0, acqYen: 0 });
    m.qty += qty;
    m.valueYen += valueYen;
    m.acqYen += acqYen;
  }

  const holdings = Object.values(merged).map((m) => ({
    id: uid(),
    ticker: m.isFund ? "投信" : (m.code || "—"),
    name: m.name,
    currency: "JPY",
    shares: m.qty,
    cost: m.qty ? m.acqYen / m.qty : 0,     // 1単位あたり取得額（円）。投信は ×10000 表示で基準価額相当
    price: m.qty ? m.valueYen / m.qty : 0,  // 1単位あたり評価額（円）
  }));

  if (!holdings.length) { alert("保有銘柄が見つかりませんでした。"); return; }
  if (!confirm(`保有銘柄を、この資産残高CSVの内容（${holdings.length}件）で置き換えます。\n※ 資金移動履歴・売買メモは残ります。\nよろしいですか？`)) return;

  data.holdings = holdings;
  if (fxFromCsv) { data.fxRate = fxFromCsv; fxInput.value = fxFromCsv; }
  save(); renderAll();
  const t = portfolioTotals();
  alert(`取り込み完了：保有銘柄 ${holdings.length} 件。\n評価額合計 ¥${Math.round(t.valueJPY).toLocaleString("ja-JP")} ／ 評価損益 ¥${Math.round(t.plJPY).toLocaleString("ja-JP")}`);
}

document.getElementById("holdings-csv-btn").addEventListener("click", () => document.getElementById("holdings-csv-file").click());
document.getElementById("holdings-csv-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { importRakutenHoldings(decodeCsvBuffer(reader.result)); }
    catch (err) { alert("CSVの取り込みに失敗しました：" + err.message); }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = "";
});

// 保有銘柄のみ全削除（資金移動履歴・売買メモ・資産推移は残す）
document.getElementById("reset-holdings").addEventListener("click", () => {
  if (!data.holdings.length) { alert("保有銘柄の記録はありません。"); return; }
  if (!confirm(`保有銘柄の記録（${data.holdings.length}件）をすべて削除します。\n※ 資金移動履歴・売買メモ・資産推移グラフは残ります。\nよろしいですか？`)) return;
  data.holdings = [];
  save(); renderAll();
  alert("保有銘柄を削除しました。楽天CSV取込から再取り込みできます。");
});

// USD/JPY レートをWebから同期（frankfurter.dev → 予備 open.er-api.com）
async function syncFxRate(manual) {
  const sub = document.getElementById("fx-sub");
  const apply = (rate, dateStr) => {
    data.fxRate = Math.round(rate * 100) / 100;
    fxInput.value = data.fxRate;
    save(); renderSummary(); renderChart();
    sub.textContent = `Web同期 ${dateStr}（1ドル=${data.fxRate}円）`;
  };
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY");
    const j = await r.json();
    if (j && j.rates && j.rates.JPY) return apply(j.rates.JPY, j.date || "");
    throw new Error("no rate");
  } catch {
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await r.json();
      if (j && j.rates && j.rates.JPY) return apply(j.rates.JPY, (j.time_last_update_utc || "").slice(0, 16));
      throw new Error("no rate");
    } catch {
      if (manual) alert("レートの取得に失敗しました。ネット接続を確認するか、手入力してください。");
    }
  }
}
document.getElementById("fx-sync").addEventListener("click", () => syncFxRate(true));
syncFxRate(false); // 起動時にベストエフォートで最新化（失敗時は保存値を使用）

// 投信の基準価額をWebから同期（ログイン不要・投資信託協会の公開データ）
const normName = (s) =>
  (s || "").replace(/[\s　]/g, "").replace(/（/g, "(").replace(/）/g, ")").replace(/＆/g, "&");

async function syncFundNav(manual) {
  const info = document.getElementById("nav-info");
  try {
    const r = await fetch("./data/fund_nav.json", { cache: "no-store" });
    if (!r.ok) throw new Error("not found");
    const funds = (await r.json()).funds || [];
    if (!funds.length) throw new Error("empty");
    let n = 0;
    for (const h of data.holdings) {
      if (h.ticker !== "投信") continue;
      const hn = normName(h.name);
      const fund = funds.find((f) => (f.names || [f.name]).some((nm) => {
        const x = normName(nm);
        return x === hn || x.includes(hn) || hn.includes(x);
      }));
      if (fund && fund.nav) { h.price = fund.nav / 10000; n++; } // 基準価額→1口あたりに換算
    }
    if (n) { save(); renderAll(); }
    info.textContent = `基準価額 同期: ${funds[0].date || ""}（${n}件反映）`;
    if (manual && n === 0) {
      alert("一致する投信が見つかりませんでした。\n対応ファンド: eMAXIS Slim 米国株式(S&P500) / 同 全世界株式(オルカン) / 楽天(プラス)NASDAQ-100。\nファンド名が異なる場合は現在値を手入力してください。");
    }
  } catch {
    if (manual) alert("基準価額の取得に失敗しました。時間をおいて再試行してください。");
  }
}
document.getElementById("sync-nav").addEventListener("click", () => syncFundNav(true));
syncFundNav(false); // 起動時にも自動反映（保有に投信があれば現在値を最新化）

// 日付入力の既定値を今日に
for (const f of ["transfer-form", "trade-form"]) {
  const d = document.querySelector(`#${f} input[name="date"]`);
  if (d) d.value = new Date().toISOString().slice(0, 10);
}

renderAll();
