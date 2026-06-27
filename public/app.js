let currentTheme = "all";
let THEMES = { semiconductor: "半導体", ai: "AI（ソフト/プラットフォーム）", physical_ai: "フィジカルAI（ロボ/自律）" };

// 静的JSONをまとめて保持（テーマ切替時の再取得を避ける）
const store = { screener: null, topics: null, outlook: null, status: null };

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
      <td><span class="tk">${s.ticker}</span><span class="tags">${tags}</span><br><span class="nm">${s.name || ""}</span></td>
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
  renderOutlook();
  renderStatus();
}

async function init() {
  const [sc, tp, ol, st] = await Promise.all([
    getJSON("screener"), getJSON("topics"), getJSON("outlook"), getJSON("status"),
  ]);
  store.screener = sc; store.topics = tp; store.outlook = ol; store.status = st;
  if (st && st.themes) THEMES = st.themes;
  renderThemes();
  renderAll();
}

init();
