// Shared core: CSV loading, helpers, app state, data loading, prices and the tab switcher.
// The page's scripts are plain (non-module) scripts loaded in order and share top-level names.

// =====================================================================================
// Data files (see track_prices.py):
//   totals.csv      per deck per day: card count + total/paper/proxy value at each store
//   latest.csv      today's cards in every deck, with prices and proxy flag
//   decklists.csv   change log of deck contents (full list on a deck's first day, then diffs)
//   card_prices/YYYY-MM.csv   one price row per printing per day (last two months loaded;
//                   older months load on demand for decklist history)
//   decks.csv, cards.csv      names/commanders, and type line / mana value / colors
// =====================================================================================

// ---------- CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.some(v => v !== "")).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const money = v => v == null || Number.isNaN(v) ? "–" : "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const shortDate = d => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const signed = d => `${d > 0 ? "+" : d < 0 ? "−" : "±"}${money(Math.abs(d))}`;
const tone = d => d > 0.005 ? "up" : d < -0.005 ? "down" : "muted";
const deltaCell = d => d == null ? `<td class="num muted">–</td>` : `<td class="num ${tone(d)}">${signed(d)}</td>`;
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const fmtCount = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
const isProxy = r => String(r.proxied).toLowerCase() === "true";
const printKey = r => `${r.card_name}|${r.set_code}|${r.finish}`;

function delta(el, d, base) {
  el.classList.remove("up", "down", "muted");
  if (d == null) { el.textContent = "–"; return; }
  const pct = base ? ` (${d >= 0 ? "+" : ""}${(d / base * 100).toFixed(1)}%)` : "";
  el.textContent = signed(d) + pct; el.classList.add(tone(d));
}
function sortBy(arr, { k, dir }) {
  return arr.sort((a, b) => {
    const x = a[k], y = b[k];
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) : x - y) * dir;
  });
}
function markSort(table, s) {
  table.querySelectorAll("th").forEach(th => {
    if (th.dataset.k === s.k) th.setAttribute("aria-sort", s.dir > 0 ? "ascending" : "descending");
    else th.removeAttribute("aria-sort");
  });
}

// ---------- state ----------
const SRC = { price_tcgplayer: "tcg", price_cardkingdom: "ck", price_cardmarket: "cm" };
const STORE_NAMES = { tcg: "TCGplayer", ck: "Card Kingdom", cm: "Cardmarket" };
let source = "price_tcgplayer";
const src = () => SRC[source];
const ALL = "__all", AVG = "__avg";

let dates = [], latestDate = null;
let decks = new Map();              // id -> { id, name, virtual, totals: Map(date -> row), rows: [latest rows], log: [] }
let tokenRows = [];   // data/tokens.csv: which tokens each card makes
// data/token_proxies.csv: proxied tokens in each deck's "Tokens & Extras" (deck id -> rows)
let tokenProxies = new Map();
let cardInfo = new Map(), commandersOf = new Map(), commanderArt = new Map(), deckMeta = new Map();
const priceDays = new Map();         // date -> Map(printKey -> row)   (loaded months only)
const loadedMonths = new Set();
let selected = ALL, tagFilter = null, asOf = null, moverWindow = 30, view = "pricesView";
let deckSort = { k: "name", dir: 1 }, cardSort = { k: "total", dir: -1 };

const realDecks = () => [...decks.values()].filter(d => !d.virtual);
const deckName = id => decks.get(id)?.name || `Deck #${id}`;

// ---------- loading ----------
const getText = (url, optional) => fetch(url, { cache: "no-store" })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
  .catch(e => { if (optional) return null; throw e; });

async function loadMonth(month) {
  if (loadedMonths.has(month)) return;
  loadedMonths.add(month);
  const text = await getText(`data/card_prices/${month}.csv`, true);
  if (!text) return;
  for (const r of parseCSV(text)) {
    if (!priceDays.has(r.date)) priceDays.set(r.date, new Map());
    priceDays.get(r.date).set(printKey(r), r);
  }
}
const monthOf = d => d.slice(0, 7);
const prevMonth = d => { const t = new Date(d.slice(0, 7) + "-01T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() - 1); return t.toISOString().slice(0, 7); };

async function start() {
  const [totalsT, latestT, logT, decksT, cardsT, folderT, tokensT, tokenProxyT] = await Promise.all([
    getText("data/totals.csv"), getText("data/latest.csv"), getText("data/decklists.csv"),
    getText("data/decks.csv", true), getText("data/cards.csv", true), getText("data/folder.csv", true),
    getText("data/tokens.csv", true), getText("data/token_proxies.csv", true)]);
  tokenRows = tokensT ? parseCSV(tokensT) : [];
  for (const r of tokenProxyT ? parseCSV(tokenProxyT) : []) {
    r.qty = +r.quantity || 0; r.token = true;
    (tokenProxies.get(r.deck_id) || tokenProxies.set(r.deck_id, []).get(r.deck_id)).push(r);
  }
  const folderId = folderT ? parseCSV(folderT)[0]?.folder_id : null;
  if (folderId) { $("folderLink").href = `https://archidekt.com/folders/${encodeURIComponent(folderId)}`; $("folderLink").hidden = false; }
  const totals = parseCSV(totalsT), latest = parseCSV(latestT), log = parseCSV(logT);
  const deckRows = decksT ? parseCSV(decksT) : [];
  deckMeta = new Map(deckRows.map(d => [d.deck_id, d]));
  cardInfo = new Map((cardsT ? parseCSV(cardsT) : []).map(c => [c.card_name, c]));
  commandersOf = new Map(deckRows.map(d => [d.deck_id, new Set((d.commanders || "").split(" | ").filter(Boolean))]));
  commanderArt = new Map(deckRows.map(d => {
    const names = (d.commanders || "").split(" | "), ids = (d.commander_ids || "").split(" | ");
    return [d.deck_id, names.map((name, i) => ({ name, id: ids[i] || "" })).filter(c => c.name)];
  }));
  const names = new Map(deckRows.map(d => [d.deck_id, d.deck_name]));

  dates = [...new Set(totals.map(r => r.date))].sort();
  latestDate = dates[dates.length - 1];
  const ensure = id => decks.get(id) || decks.set(id, { id, name: names.get(id) || `Deck #${id}`, totals: new Map(), rows: [], log: [] }).get(id);
  for (const r of totals) ensure(r.deck_id).totals.set(r.date, r);
  for (const r of latest) { r.qty = +r.quantity || 0; ensure(r.deck_id).rows.push(r); }
  for (const r of log.sort((a, b) => a.date.localeCompare(b.date))) { r.qty = +r.quantity || 0; ensure(r.deck_id).log.push(r); }
  addCombined();

  await Promise.all([loadMonth(monthOf(latestDate)), loadMonth(prevMonth(latestDate))]);

  const current = realDecks().filter(d => !isStale(d)).length;
  // whose collection this is (the Archidekt owner of most of the decks), for anyone opening a shared link
  const owners = new Map();
  for (const m of deckMeta.values()) if (m.owner) owners.set(m.owner, (owners.get(m.owner) || 0) + 1);
  const owner = [...owners].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (owner) document.title = `${owner}'s decks · Archidekt Snapshot`;
  $("subtitle").textContent = (owner ? `${owner}'s ` : "") + `${current} deck${current === 1 ? "" : "s"} · updated ${fmtDate(latestDate)}` +
    (dates.length > 1 ? ` · tracked since ${fmtDate(dates[0])}` : "");
  $("tabs").hidden = false;
  setHipsterLink();
  renderDeckCards();
  applyUrl();
  urlReady = true;
  history.replaceState(null, "", buildUrl());
}

// Combined "decks": the whole collection (all decks summed) and the average deck (that
// total divided by how many decks were snapshotted that day).
function addCombined() {
  const sum = new Map(), count = new Map();
  for (const d of realDecks()) for (const [date, t] of d.totals) {
    count.set(date, (count.get(date) || 0) + 1);
    const s = sum.get(date) || {};
    for (const [k, v] of Object.entries(t)) if (k !== "date" && k !== "deck_id") s[k] = (s[k] || 0) + (+v || 0);
    sum.set(date, s);
  }
  const scaled = div => new Map([...sum].map(([date, s]) => [date, Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / div(date)]))]));
  const rows = mergeRows(realDecks().filter(d => !isStale(d)).flatMap(d => d.rows));
  decks.set(ALL, { id: ALL, virtual: true, name: "Whole collection", totals: scaled(() => 1), rows, log: [] });
  decks.set(AVG, { id: AVG, virtual: true, name: "Average deck", totals: scaled(d => count.get(d)), rows: [], log: [], noCards: true });
}
// Same printing + proxy status across decks becomes one row with summed quantity.
function mergeRows(list) {
  const m = new Map();
  for (const r of list) {
    const k = printKey(r) + "|" + r.proxied, e = m.get(k);
    if (e) e.qty += r.qty; else m.set(k, { ...r });
  }
  return [...m.values()];
}

const isStale = d => !d.virtual && ![...d.totals.keys()].includes(latestDate);
const deckDates = d => [...d.totals.keys()].sort();
const val = (d, date, part = "total") => { const t = d.totals.get(date); return t ? +t[`${src()}_${part}`] || 0 : null; };

// Bling score (0-100). The parts are measured among real (non-proxy) cards only:
//   flex      60  of the money in the real cards, the share spent above their cheapest printings
//   upgraded  30  share of real cards worth more than their cheapest printing (pricier printing or foil)
//   foil      10  share of real cards that are foil
// For a deck, that raw score is multiplied by the share of the deck that's real (lots of proxies
// hold a deck back). Then it's curved with a square root so the middle of the range spreads out:
//   bling = 100 * sqrt(raw/100 * real/all)
// The same formula scores a single card from its real copies (Cards tab).
const BLING_TIERS = [[80, "Crown jewel"], [60, "Gilded"], [40, "Upgraded"], [20, "Sleeved"], [0, "Bulk"]];
function blingFrom({ value, cheapest, upgrades, foils, real, total = real }) {
  if (!(real > 0) || !(total > 0)) return null;
  cheapest = Math.min(cheapest, value);
  const flex = value > 0 ? 60 * (1 - cheapest / value) : 0;
  const upgraded = 30 * upgrades / real;
  const foil = 10 * foils / real;
  const raw = flex + upgraded + foil, realShare = real / total;
  const score = 100 * Math.sqrt(Math.max(0, raw) / 100 * realShare);
  return { score, raw, realShare, flex, upgraded, foil, real, foils, upgrades, N: total, value, cheapest, tier: BLING_TIERS.find(([min]) => score >= min)[1] };
}
// A deck's bling on one day, from its saved totals; null before bling was tracked.
function blingOn(d, date) {
  const t = d.totals.get(date), s = src();
  if (!t || t[`${s}_upgraded`] == null || t[`${s}_upgraded`] === "") return null;
  return blingFrom({ value: +t[`${s}_paper`] || 0, cheapest: +t[`${s}_paper_min`] || 0, upgrades: +t[`${s}_upgraded`] || 0,
    foils: +t.foil_cards || 0, real: +t.paper_cards || 0, total: +t.cards || 0 });
}

// ---------- prices ----------
const priceIn = (row, column = source) => num(row?.[column]);
// Price of a printing on a given day (from the loaded months), or null.
const priceOn = (date, key, column = source) => priceIn(priceDays.get(date)?.get(key), column);
// The earliest loaded day on or after `target`.
function dayOnOrAfter(target) {
  const loaded = [...priceDays.keys()].sort();
  return loaded.find(d => d >= target) ?? null;
}

// ---------- decklist log ----------
// State of a deck's list on `date`: Map(entryKey -> { row, qty }).
function stateOn(d, date) {
  const st = new Map();
  for (const r of d.log) {
    if (r.date > date) break;
    const k = printKey(r) + "|" + r.proxied;
    if (r.qty) st.set(k, { row: r, qty: r.qty }); else st.delete(k);
  }
  return st;
}
// Swaps: per change date, which card names went in and out (by name, so reprints and
// proxy-to-paper upgrades don't count). A deck's first day is its baseline, not a swap.
function deckSwaps(d) {
  const ids = d.virtual ? realDecks().map(x => x.id) : [d.id];
  const byDate = new Map();       // date -> Map(name -> net qty change)
  for (const id of ids) {
    const deck = decks.get(id), names = new Map();   // name -> qty
    const firstDay = deck.log[0]?.date;
    const perKey = new Map();
    for (const r of deck.log) {
      const k = printKey(r) + "|" + r.proxied;
      const before = perKey.get(k) || 0;
      perKey.set(k, r.qty);
      // baseline: the deck's first day only counts as "in" for the whole collection,
      // and only when the deck arrived after tracking began
      if (r.date === firstDay && (!d.virtual || firstDay === dates[0])) continue;
      const m = byDate.get(r.date) || new Map();
      m.set(r.card_name, (m.get(r.card_name) || 0) + (r.qty - before));
      byDate.set(r.date, m);
    }
  }
  const out = [];
  for (const date of [...byDate.keys()].sort()) {
    const added = [], removed = [];
    for (const [name, n] of byDate.get(date)) {
      const price = latestPriceByName(name);
      if (n > 0) added.push({ name, qty: n, price }); else if (n < 0) removed.push({ name, qty: -n, price });
    }
    if (!added.length && !removed.length) continue;
    const sum = l => l.reduce((s, c) => s + (c.price ?? 0) * c.qty, 0);
    added.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)); removed.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    const prev = dates.filter(x => x < date).pop();
    out.push({ date, since: prev, added, removed, net: sum(added) - sum(removed) });
  }
  return out;
}
// Current price for a card name: the cheapest printing in today's decks, else the most
// recent price we have for any printing of it (for cards that have since left).
let nameCache = { source: null, map: null };
function latestPriceByName(name) {
  if (nameCache.source !== source) {
    const map = new Map();
    for (const d of realDecks()) for (const r of d.rows) {
      const p = priceIn(r); if (p != null && (!map.has(r.card_name) || p < map.get(r.card_name))) map.set(r.card_name, p);
    }
    for (const day of [...priceDays.keys()].sort().reverse()) for (const r of priceDays.get(day).values()) {
      const p = priceIn(r); if (p != null && !map.has(r.card_name)) map.set(r.card_name, p);
    }
    nameCache = { source, map };
  }
  return nameCache.map.get(name) ?? null;
}

// ---------- stats ----------
function deckStats(d) {
  const ds = deckDates(d), last = ds[ds.length - 1], first = ds[0];
  const value = val(d, last);
  return {
    id: d.id, virtual: !!d.virtual, name: d.name, value, last, ds,
    cards: d.totals.get(last) ? +d.totals.get(last).cards : 0,
    dFirst: ds.length > 1 ? value - val(d, first) : null, firstVal: val(d, first),
    lastSwap: d.virtual && d.id === AVG ? null : (deckSwaps(d).at(-1)?.date ?? null),
    bling: blingOn(d, last)?.score ?? null,
    stale: isStale(d),
  };
}

// ---------- commander art (Scryfall) ----------
// The art crop of the exact printing in the deck, from Scryfall's image server. If that file
// isn't there, fall back to Scryfall's API, which redirects to the right image.
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const artUrl = id => `https://cards.scryfall.io/art_crop/front/${id[0]}/${id[1]}/${id}.jpg`;
const artFallback = id => `https://api.scryfall.com/cards/${id}?format=image&version=art_crop`;
function artImg(c, cls = "") {
  if (!SCRYFALL_ID.test(c.id)) return `<span class="art-missing ${cls}" title="${esc(c.name)}"></span>`;
  return `<img class="${cls}" src="${artUrl(c.id)}" alt="${esc(c.name)}" loading="lazy" decoding="async"
    onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='${artFallback(c.id)}'}else{this.replaceWith(Object.assign(document.createElement('span'),{className:'art-missing ${cls}'}))}">`;
}
// Deck thumbnail: one art, or two halves for a partner pair.
const thumbHtml = id => {
  const cs = (commanderArt.get(id) || []).slice(0, 2);
  return `<span class="thumb ${cs.length > 1 ? "pair" : ""}" aria-hidden="true">${cs.map(c => artImg(c)).join("")}</span>`;
};

// ---------- views ----------
function showView(v) {
  view = v;
  for (const id of ["pricesView", "indexView", "tokensView", "cardsView"]) $(id === "pricesView" ? "app" : id).hidden = v !== id;
  document.documentElement.dataset.view = v;   // print styles only apply on the Business cards tab
  if (v === "cardsView" && $("cardSheet").children.length) fitGameChangers();   // can only measure while visible
  $("tabs").querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === v));
  syncUrl();
}
$("tabs").addEventListener("click", e => { const b = e.target.closest("button[data-view]"); if (b) showView(b.dataset.view); });

function render() { renderDecks(); renderDeck(); syncUrl(); }

function renderDecks() {
  const item = st => `
    <button class="deck-item ${st.id === selected ? "sel" : ""} ${st.virtual ? "combined" : ""} ${st.stale ? "stale" : ""}" data-id="${esc(st.id)}" aria-current="${st.id === selected}">
      ${st.virtual ? `<span class="thumb none" aria-hidden="true"></span>` : thumbHtml(st.id)}
      <span class="dname" title="${esc(st.name)}">${esc(st.name)}</span>
      <span class="dval num">${money(st.value)}</span>
      <span class="dmeta">${st.stale ? `Last in folder ${fmtDate(st.last)}` : deckSort.k === "bling" && st.bling != null ? `Bling ${Math.round(st.bling)}` : `${fmtCount(st.cards)} cards`}${!st.stale && st.lastSwap ? `, swapped ${shortDate(st.lastSwap)}` : ""}</span>
      <span class="ddelta num ${tone(st.dFirst)}">${st.dFirst == null ? "" : signed(st.dFirst)}</span>
    </button>`;
  const all = sortBy(realDecks().map(deckStats), deckSort);
  const real = [...all.filter(s => !s.stale), ...all.filter(s => s.stale)];
  $("deckList").innerHTML = item(deckStats(decks.get(ALL))) + item(deckStats(decks.get(AVG))) + `<div class="deck-sep" role="presentation"></div>` + real.map(item).join("");
}

// The bling stat in the deck header: score, tier, the three parts, and the change since bling
// was first recorded for this deck.
function renderBling(d, s) {
  const b = blingOn(d, s.last), box = $("heroBling");
  box.hidden = !b;
  if (!b) return;
  const firstDay = s.ds.find(x => blingOn(d, x)), first = firstDay && firstDay !== s.last ? blingOn(d, firstDay) : null;
  const change = first ? b.score - first.score : null;
  $("blingVal").innerHTML = `${Math.round(b.score)}<span class="tier">${b.tier}</span>`;
  $("blingParts").innerHTML = `Flex ${Math.round(b.flex)}/60 · Upgraded ${Math.round(b.upgraded)}/30 · Foil ${Math.round(b.foil)}/10 · ${Math.round(b.realShare * 100)}% real` +
    (change != null && Math.round(change) ? ` · <span class="${change > 0 ? "up" : "down"}">${change > 0 ? "+" : ""}${Math.round(change)} since ${fmtDate(firstDay)}</span>` : "");
  box.title = `Measured on the ${fmtCount(b.real)} real cards (proxies don't count):\n` +
    `Flex: they're worth ${money(b.value)}; in their cheapest printings they'd be ${money(b.cheapest)}.\n` +
    `Upgraded: ${fmtCount(b.upgrades)} of them are worth more than their cheapest printing.\n` +
    `Foil: ${fmtCount(b.foils)} of them are foil.\n` +
    `Those parts add to ${Math.round(b.raw)}/100. ${Math.round(b.realShare * 100)}% of the deck is real, so the score is ` +
    `100 × √(${(b.raw / 100).toFixed(2)} × ${b.realShare.toFixed(2)}) = ${Math.round(b.score)}.`;
}

function renderDeck() {
  const d = decks.get(selected), s = deckStats(d);
  $("deckTitle").textContent = s.name;
  const cmds = d.virtual ? [] : (commanderArt.get(d.id) || []);
  $("cmdBanner").hidden = $("cmdNames").hidden = !cmds.length;
  $("cmdBanner").className = "cmd-banner" + (cmds.length > 1 ? " pair" : "");
  $("cmdBanner").innerHTML = cmds.slice(0, 2).map(c => artImg(c)).join("");
  $("cmdNames").textContent = cmds.map(c => c.name).join(" and ");
  $("deckLink").hidden = s.virtual;
  if (!s.virtual) $("deckLink").href = `https://archidekt.com/decks/${encodeURIComponent(s.id)}`;
  for (const id of ["swapsCard", "cardsCard", "moversCard", "curveCard"]) $(id).hidden = !!d.noCards;
      if (d.noCards) tagFilter = null;
  $("heroLbl").textContent = s.stale ? `Value on ${fmtDate(s.last)} (left folder)` : `Value on ${fmtDate(s.last)}`;
  $("heroVal").textContent = money(s.value);
  delta($("heroFirst"), s.dFirst, s.firstVal);
  renderBling(d, s);
  const missing = d.rows.filter(r => priceIn(r) == null).length;
  const swaps = d.noCards ? [] : deckSwaps(d);
  $("chartNote").textContent = [
    s.ds.length < 2 ? "First snapshot" : "",
    swaps.length ? "○ decklist changed" : "",
    missing ? `${missing} unpriced` : "",
  ].filter(Boolean).join(" · ");
  drawChart(s.ds.map(x => ({ date: x, total: val(d, x), paper: val(d, x, "paper"), proxy: val(d, x, "proxy") })), swaps);
  renderTags(d, s);
  if (d.noCards) return;
  renderMovers(d);
  renderSwaps(swaps);
  renderCurve(d);
  renderAsOf(d);
  renderCards(d);
}
