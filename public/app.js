let currentTheme = "all";
let THEMES = { semiconductor: "半導体", ai: "AI（ソフト/プラットフォーム）", physical_ai: "フィジカルAI（ロボ/自律）" };

// 静的JSONをまとめて保持（テーマ切替時の再取得を避ける）
const store = { screener: null, topics: null, outlook: null, status: null, sectors: null, history: null };

const pct = (v) => (v == null ? "—" : (v * 100).toFixed(1) + "%");
const num = (v, d = 1) => (v == null ? "—" : Number(v).toFixed(d));
const money = (v) => (v == null ? "—" : "$" + Number(v).toFixed(2));
const cls = (v) => (v == null ? "" : v >= 0 ? "pos" : "neg");
const SENT_COLOR = { 5: "#2bff88", 4: "#7fc59b", 3: "#c9b86a", 2: "#e0915f", 1: "#ff3b6b" };

function scoreColor(s) {
  const h = (s / 100) * 130;
  return `hsl(${h}, 90%, 55%)`;
}

async function getJSON(name) {
  try {
    const r = await fetch(`./data/${name}.json`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function renderThemes() {
  const nav = document.getElementById("themes");
  const entries = [["all", "すべて"], ...Object.entries(THEMES)];
  nav.innerHTML = "";
  for (const [key, label] of entries) {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = key === currentTheme ? "active" : "";
    b.dataset.key = key;
    b.onclick = () => { currentTheme = key; renderThemeButtons(); renderAll(); };
    nav.appendChild(b);
  }
}
function renderThemeButtons() {
  document.querySelectorAll("#themes button").forEach((b) => {
    b.className = b.dataset.key === currentTheme ? "active" : "";
  });
}

function renderScreener() {
  const body = document.getElementById("screener-body");
  let stocks = (store.screener && store.screener.stocks) || [];
  if (currentTheme !== "all") stocks = stocks.filter((s) => (s.tags || []).includes(currentTheme));
  if (!stocks.length) {
    body.innerHTML = `<tr><td colspan="12" class="empty">データ取得中…</td></tr>`;
    return;
  }
  body.innerHTML = stocks.map((s, i) => {
    const tags = (s.tags || []).map((t) => `<span class="tag">${t}</span>`).join("");
    return `<tr>
      <td>${i + 1}</td>
      <td><a class="tk" href="https://www.moomoo.com/stock/${s.ticker}-US" target="_blank" rel="noopener" title="moomooで${s.ticker}を開く">${s.ticker}</a><span class="tags">${tags}</span><br><span class="nm">${s.name || ""}</span></td>
      <td>${money(s.price)}</td>
      <td class="score-col"><span class="score" style="background:${scoreColor(s.score)}">${num(s.score, 1)}</span></td>
      <td class="${cls(s.revenue_growth)}">${pct(s.revenue_growth)}</td>
      <td>${pct(s.gross_margin)}</td>
      <td class="${cls(s.roe)}">${pct(s.roe)}</td>
      <td class="${cls(s.mom_3m)}">${pct(s.mom_3m)}</td>
      <td class="${cls(s.mom_6m)}">${pct(s.mom_6m)}</td>
      <td class="${cls(s.upside)}">${pct(s.upside)}</td>
      <td>${num(s.forward_pe, 1)}</td>
      <td>${s.recommendation || "—"}</td>
    </tr>`;
  }).join("");
}

function renderTopics() {
  const list = document.getElementById("topics-list");
  let items = (store.topics && store.topics.items) || [];
  if (currentTheme !== "all") items = items.filter((it) => (it.tags || []).includes(currentTheme));
  if (!items.length) {
    list.innerHTML = `<li class="empty">トピックス取得中…</li>`;
    return;
  }
  list.innerHTML = items.slice(0, 40).map((it) => {
    const t = it.time ? new Date(it.time * 1000).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const headline = it.title_ja || it.title;
    const summary = it.summary_ja ? `<div class="topic-summary">${it.summary_ja}</div>` : "";
    const orig = it.title_ja ? `<div class="topic-orig">${it.title}</div>` : "";
    return `<li>
      <a href="${it.link}" target="_blank" rel="noopener">${headline}</a>
      ${summary}${orig}
      <div class="topic-meta">
        <span class="topic-tk">${it.ticker}</span>
        <span>${it.publisher || ""}</span>
        <span>${t}</span>
      </div>
    </li>`;
  }).join("");
}

function renderOutlook() {
  const wrap = document.getElementById("outlook-wrap");
  const box = document.getElementById("outlook-cards");
  const data = store.outlook || {};
  const items = data.items || [];
  if (!data.enabled || !items.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const modeEl = document.getElementById("outlook-mode");
  if (modeEl) modeEl.textContent = data.mode === "ai" ? "AIによるニュース材料の整理" : "数値ベースの自動分析（AIではありません）";
  box.innerHTML = items.map((o) => {
    const c = SENT_COLOR[o.sentiment_score] || "#888";
    const ul = (arr) => (arr || []).map((x) => `<li>${x}</li>`).join("");
    return `<div class="outlook-card">
      <div class="oc-head">
        <span class="oc-theme">${o.label}</span>
        <span class="oc-sent" style="background:${c}">${o.sentiment}</span>
      </div>
      <div class="oc-conf">確信度: ${o.confidence}</div>
      <div class="oc-scenario">${o.scenario || ""}</div>
      <div class="oc-cols">
        <div><div class="oc-label up">強材料</div><ul>${ul(o.bull_points)}</ul></div>
        <div><div class="oc-label down">弱材料</div><ul>${ul(o.bear_points)}</ul></div>
      </div>
      <div class="oc-watch"><div class="oc-label">ウォッチポイント</div><ul>${ul(o.watch_points)}</ul></div>
    </div>`;
  }).join("");
}

function sparkline(series, color) {
  const xs = series.filter((v) => typeof v === "number");
  if (xs.length < 2) return `<span class="spark-empty">蓄積中…</span>`;
  const w = 90, h = 22, min = Math.min(...xs), max = Math.max(...xs);
  const span = max - min || 1;
  const pts = xs.map((v, i) => {
    const x = (i / (xs.length - 1)) * w;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>
  </svg>`;
}

function renderSectors() {
  const wrap = document.getElementById("sectors-wrap");
  const body = document.getElementById("sectors-body");
  const sectors = (store.sectors && store.sectors.sectors) || [];
  if (!sectors.length) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const points = (store.history && store.history.points) || [];
  const seriesFor = (theme) => points.map((p) => (p[theme] ? p[theme].st : null));

  body.innerHTML = sectors.map((s) => {
    const st = s.strength;
    const stW = st == null ? 0 : Math.round((st / 100) * 80);
    const stColor = `hsl(${(st / 100) * 130}, 90%, 55%)`;
    const stBar = `<span class="sbar" style="width:${stW}px;background:${stColor}"></span>`;
    return `<tr>
      <td>${s.rank}</td>
      <td style="text-align:left"><span class="tk">${s.label}</span></td>
      <td><b style="color:${stColor}">${num(st, 1)}</b> ${stBar}</td>
      <td class="${cls(s.avg_mom_3m)}">${pct(s.avg_mom_3m)}</td>
      <td class="${cls(s.avg_mom_6m)}">${pct(s.avg_mom_6m)}</td>
      <td>${num(s.avg_score, 1)}</td>
      <td>${s.breadth == null ? "—" : Math.round(s.breadth * 100) + "%"}</td>
      <td class="${cls(s.avg_revenue_growth)}">${pct(s.avg_revenue_growth)}</td>
      <td>${s.count}</td>
      <td>${sparkline(seriesFor(s.theme), "#00f0ff")}</td>
    </tr>`;
  }).join("");

  renderTrendChart(sectors);
}

const THEME_LINE = { semiconductor: "#00f0ff", ai: "#ff2bd6", physical_ai: "#2bff88" };

function renderTrendChart(sectors) {
  const chart = document.getElementById("trend-chart");
  const legend = document.getElementById("trend-legend");
  const points = (store.history && store.history.points) || [];

  legend.innerHTML = sectors.map((s) =>
    `<span class="lg"><i style="background:${THEME_LINE[s.theme] || "#888"}"></i>${s.label}</span>`
  ).join("");

  if (points.length < 2) {
    chart.innerHTML = `<div class="trend-empty">データ蓄積中… 更新のたびに点が増えてグラフになります（現在 ${points.length} 点）</div>`;
    return;
  }

  const W = 660, H = 200, padL = 34, padR = 12, padT = 12, padB = 22;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = points.length;
  const x = (i) => padL + (i / (n - 1)) * innerW;
  const y = (v) => padT + (1 - v / 100) * innerH; // 0-100スケール固定

  const grid = [0, 25, 50, 75, 100].map((g) =>
    `<line x1="${padL}" y1="${y(g)}" x2="${W - padR}" y2="${y(g)}" stroke="rgba(120,150,200,0.15)" stroke-width="1"/>
     <text x="${padL - 6}" y="${y(g) + 4}" text-anchor="end" fill="#6b7da6" font-size="10">${g}</text>`
  ).join("");

  const lines = sectors.map((s) => {
    const col = THEME_LINE[s.theme] || "#888";
    const pts = points.map((p, i) => {
      const v = p[s.theme] ? p[s.theme].st : null;
      return v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    }).filter(Boolean).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" style="filter:drop-shadow(0 0 4px ${col})"/>`;
  }).join("");

  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
    ${grid}${lines}
  </svg>`;
}

function renderStatus() {
  const st = store.status || {};
  const el = document.getElementById("status");
  const fmt = (s) => (s ? new Date(s).toLocaleString("ja-JP") : "未取得");
  const ja = st.translation_enabled ? `／和訳 ${st.translated_count}/${st.topic_count}` : "／和訳:無効";
  el.textContent = `銘柄 ${st.stock_count || 0} / 更新 ${fmt(st.screener_updated)}${ja}`;
}

function renderAll() {
  renderScreener();
  renderTopics();
  renderSectors();
  renderOutlook();
  renderStatus();
}

async function init() {
  const [sc, tp, ol, st, se, hi] = await Promise.all([
    getJSON("screener"), getJSON("topics"), getJSON("outlook"), getJSON("status"),
    getJSON("sectors"), getJSON("history"),
  ]);
  store.screener = sc; store.topics = tp; store.outlook = ol; store.status = st;
  store.sectors = se; store.history = hi;
  if (st && st.themes) THEMES = st.themes;
  renderThemes();
  renderAll();
}

init();
