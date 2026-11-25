// app.js
const STATE = {
  mode: "today",              // "today" | "archive"
  impactMin: 70,
  onlyHigh: true,
  onlyMoved: true,
  search: "",
  selectedTickers: new Set(), // if empty => all
  pollMs: 30000,
  seenIds: new Set(LS.get("seenIds", [])),
  lastDataIds: new Set()      // to detect "NEW"
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindEls();
  bindUI();
  boot();
});

function bindEls(){
  els.feed = document.getElementById("feed");
  els.totalCount = document.getElementById("totalCount");
  els.shownCount = document.getElementById("shownCount");
  els.lastUpdate = document.getElementById("lastUpdate");

  els.impactMin = document.getElementById("impactMin");
  els.impactMinLabel = document.getElementById("impactMinLabel");
  els.onlyHigh = document.getElementById("onlyHigh");
  els.onlyMoved = document.getElementById("onlyMoved");
  els.search = document.getElementById("search");
  els.tagChips = document.getElementById("tagChips");

  els.tabToday = document.getElementById("tabToday");
  els.tabArchive = document.getElementById("tabArchive");

  els.pollSec = document.getElementById("pollSec");
  els.applyPoll = document.getElementById("applyPoll");

  els.resetFilters = document.getElementById("resetFilters");
  els.markAllSeen = document.getElementById("markAllSeen");
}

function bindUI(){
  els.impactMin.addEventListener("input", () => {
    STATE.impactMin = Number(els.impactMin.value);
    els.impactMinLabel.textContent = String(STATE.impactMin);
    refresh();
  });

  els.onlyHigh.addEventListener("change", () => {
    STATE.onlyHigh = els.onlyHigh.checked;
    refresh();
  });

  els.onlyMoved.addEventListener("change", () => {
    STATE.onlyMoved = els.onlyMoved.checked;
    refresh();
  });

  els.search.addEventListener("input", () => {
    STATE.search = els.search.value.trim().toLowerCase();
    refresh();
  });

  els.tabToday.addEventListener("click", () => {
    setMode("today");
  });

  els.tabArchive.addEventListener("click", () => {
    setMode("archive");
  });

  els.applyPoll.addEventListener("click", () => {
    const sec = clamp(Number(els.pollSec.value || 30), 5, 300);
    STATE.pollMs = sec * 1000;
    bootPolling();
  });

  els.resetFilters.addEventListener("click", () => {
    STATE.impactMin = 70;
    STATE.onlyHigh = true;
    STATE.onlyMoved = true;
    STATE.search = "";
    STATE.selectedTickers = new Set();
    els.impactMin.value = String(STATE.impactMin);
    els.impactMinLabel.textContent = String(STATE.impactMin);
    els.onlyHigh.checked = true;
    els.onlyMoved.checked = true;
    els.search.value = "";
    renderTagChips([]); // will rebuild on next refresh with data
    refresh();
  });

  els.markAllSeen.addEventListener("click", () => {
    // mark currently shown as seen
    const cards = els.feed.querySelectorAll("[data-id]");
    cards.forEach(c => STATE.seenIds.add(c.getAttribute("data-id")));
    persistSeen();
    refresh(false);
  });
}

let POLL_TIMER = null;
let CACHE = { updatedAt: null, items: [] };

async function boot(){
  await loadAndRender(true);
  bootPolling();
}

function bootPolling(){
  if (POLL_TIMER) clearInterval(POLL_TIMER);
  POLL_TIMER = setInterval(() => loadAndRender(false), STATE.pollMs);
}

async function loadAndRender(first){
  const data = await fetchNews();
  if (!data) return;

  CACHE.updatedAt = data.updated_at || isoNow();
  CACHE.items = Array.isArray(data.items) ? data.items : [];

  els.lastUpdate.textContent = `Обновление: ${formatTs(CACHE.updatedAt)}`;

  // Build chip list based on all tickers present
  const allTickers = collectTickers(CACHE.items);
  renderTagChips(allTickers);

  // Track NEW items
  const currentIds = new Set(CACHE.items.map(x => x.id));
  const newIds = [];
  if (!first && STATE.lastDataIds.size > 0){
    for (const id of currentIds){
      if (!STATE.lastDataIds.has(id)) newIds.push(id);
    }
  }
  STATE.lastDataIds = currentIds;

  refresh(true, newIds);
}

async function fetchNews(){
  try{
    // cache-bust so browser doesn't reuse old json
    const url = `./data/news.json?ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }catch(e){
    console.error(e);
    return null;
  }
}

function setMode(mode){
  STATE.mode = mode;
  els.tabToday.classList.toggle("active", mode === "today");
  els.tabArchive.classList.toggle("active", mode === "archive");
  refresh();
}

function refresh(recomputeChips=true, newIds=[]){
  const items = applyFilters(CACHE.items);
  els.totalCount.textContent = String(CACHE.items.length);
  els.shownCount.textContent = String(items.length);

  renderFeed(items, newIds);
}

function applyFilters(items){
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return items
    .filter(x => x && x.id && x.ts && typeof x.impact === "number")
    .filter(x => {
      if (STATE.mode === "today"){
        const t = new Date(x.ts).getTime();
        return (now - t) <= dayMs;
      }
      return true;
    })
    .filter(x => x.impact >= STATE.impactMin)
    .filter(x => !STATE.onlyHigh || x.impact >= 80)
    .filter(x => !STATE.onlyMoved || (typeof x.price_move_pct_30m === "number" && Math.abs(x.price_move_pct_30m) >= 0.1))
    .filter(x => {
      if (!STATE.search) return true;
      const blob = `${x.title} ${x.summary} ${x.category} ${(x.tickers||[]).join(" ")}`.toLowerCase();
      return blob.includes(STATE.search);
    })
    .filter(x => {
      if (STATE.selectedTickers.size === 0) return true;
      const tickers = new Set((x.tickers||[]).map(t => String(t).toUpperCase()));
      for (const t of STATE.selectedTickers){
        if (tickers.has(t)) return true;
      }
      return false;
    })
    .sort((a,b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

function collectTickers(items){
  const set = new Set();
  for (const x of items){
    (x.tickers || []).forEach(t => set.add(String(t).toUpperCase()));
  }
  return Array.from(set).sort();
}

function renderTagChips(allTickers){
  // Don’t destroy selected state; rebuild chips each refresh
  els.tagChips.innerHTML = "";
  if (!allTickers || allTickers.length === 0){
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Тикеры появятся, когда будут данные.";
    els.tagChips.appendChild(empty);
    return;
  }

  allTickers.forEach(t => {
    const chip = document.createElement("div");
    chip.className = "chip" + (STATE.selectedTickers.has(t) ? " active" : "");
    chip.textContent = t;
    chip.addEventListener("click", () => {
      if (STATE.selectedTickers.has(t)) STATE.selectedTickers.delete(t);
      else STATE.selectedTickers.add(t);
      refresh();
    });
    els.tagChips.appendChild(chip);
  });

  // Add "ALL" chip
  const all = document.createElement("div");
  all.className = "chip" + (STATE.selectedTickers.size === 0 ? " active" : "");
  all.textContent = "ALL";
  all.addEventListener("click", () => {
    STATE.selectedTickers = new Set();
    refresh();
  });
  els.tagChips.prepend(all);
}

function renderFeed(items, newIds){
  els.feed.innerHTML = "";

  if (!items.length){
    const empty = document.createElement("div");
    empty.className = "panel";
    empty.innerHTML = `<div class="panelTitle">Нет новостей под фильтры</div>
      <div class="hint">Уменьши Impact минимум или отключи “Только HIGH”.</div>`;
    els.feed.appendChild(empty);
    return;
  }

  const newSet = new Set(newIds);

  for (const x of items){
    const level = impactLevel(x.impact);
    const badgeText = level === "high" ? "HIGH" : (level === "mid" ? "MID" : "LOW");

    const move = typeof x.price_move_pct_30m === "number" ? x.price_move_pct_30m : 0;
    const moveCls = moveClass(move);
    const moveSign = move > 0 ? "+" : "";
    const movedText = (typeof x.price_move_pct_30m === "number")
      ? `${moveSign}${move.toFixed(2)}%`
      : "—";

    const isNew = newSet.has(x.id);
    const isSeen = STATE.seenIds.has(x.id);

    const card = document.createElement("article");
    card.className = "card" + (isNew && !isSeen ? " new" : "");
    card.setAttribute("data-id", x.id);

    card.innerHTML = `
      <div class="cardHead">
        <div class="kicker">
          <div class="badge ${level}">${badgeText} · ${x.impact}</div>
          <div class="pair"><b>${escapeHtml(x.category || "News")}</b></div>
        </div>
        <div class="meta">
          <div>${formatTs(x.ts)}</div>
          <div>${escapeHtml(x.source || "—")}</div>
        </div>
      </div>

      <div class="cardBody">
        <div class="headline">${escapeHtml(x.title)}</div>
        <div class="summary">${escapeHtml(x.summary || "")}</div>

        <div class="row">
          <div class="pair move ${moveCls}">30m: <b>${movedText}</b></div>
          <div class="pair">ID: <b>${escapeHtml(x.id)}</b></div>
          <button class="btn ghost" type="button" data-action="seen">
            ${isSeen ? "Прочитано" : "Отметить прочитанным"}
          </button>
        </div>

        <div class="tagsRow">
          ${(x.tickers||[]).map(t => `<span class="tag">${escapeHtml(String(t).toUpperCase())}</span>`).join("")}
        </div>
      </div>
    `;

    card.querySelector('[data-action="seen"]').addEventListener("click", () => {
      STATE.seenIds.add(x.id);
      persistSeen();
      refresh(false);
    });

    els.feed.appendChild(card);
  }
}

function persistSeen(){
  LS.set("seenIds", Array.from(STATE.seenIds));
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
