// Header links, shareable URLs, event wiring, and startup. Loaded last.

// ---------- EDH Hipster Quotient ----------
// Sends every current deck's commanders over in its link: one "c" per deck, "|" between
// partners (see that project's README).
const HQ_URL = "https://jimna-h.github.io/edhrec-hipster-quotient/";
function setHipsterLink() {
  const q = new URLSearchParams();
  for (const d of sortBy(realDecks().filter(d => !isStale(d)), { k: "name", dir: 1 })) {
    const cmds = [...(commandersOf.get(d.id) || [])].slice(0, 2);
    if (cmds.length) q.append("c", cmds.join("|"));
  }
  const n = q.getAll("c").length;
  $("hqLink").hidden = !n;
  $("hqLink").href = HQ_URL + "#" + q.toString().replace(/%7C/g, "|");
  $("hqLink").title = `Opens EDH Hipster Quotient with the commanders of your ${n} deck${n === 1 ? "" : "s"} filled in`;
}

// ---------- shareable links ----------
// The address holds the tab plus that tab's deck and filters, e.g.
//   #decks?deck=4279849&price=ck&on=2026-09-11&show=proxied&q=sol
//   #cards?q=elf&colors=W,G,-R&types=Creature,-Land&skip=4279849&sets=SLD,-LTR&cmd=only&proxied=only&stores=tcg,ck,cm&layout=grid
// (#proxies links from before the Proxies tab was merged into Cards still open, as Proxies only.)
// Switching tab or deck adds a history entry (so Back works); filter tweaks replace it.
const VIEW_SLUG = { pricesView: "decks", indexView: "cards", cardsView: "business" };
// older addresses: #search was the Cards tab, #proxies its proxies-only view
const OLD_SLUGS = { search: "indexView", proxies: "indexView" };
const SLUG_VIEW = Object.fromEntries(Object.entries(VIEW_SLUG).map(([k, v]) => [v, k]));
const PRICE_SLUG = { price_tcgplayer: "tcg", price_cardkingdom: "ck", price_cardmarket: "cm" };
const SLUG_PRICE = Object.fromEntries(Object.entries(PRICE_SLUG).map(([k, v]) => [v, k]));
const sortStr = st => (st.dir < 0 ? "-" : "") + st.k;
const readSort = (str, st) => { if (str) { st.dir = str.startsWith("-") ? -1 : 1; st.k = str.replace(/^-/, ""); } };
const csvList = str => (str || "").split(",").map(x => x.trim()).filter(Boolean);
let urlReady = false, lastNav = "";

function buildUrl() {
  const q = new URLSearchParams();
  if (source !== "price_tcgplayer" && view === "pricesView") q.set("price", PRICE_SLUG[source]);
  if (view === "pricesView") {
    if (selected !== ALL) q.set("deck", selected === AVG ? "average" : selected);
    if (asOf && asOf !== latestDate) q.set("on", asOf);
    if (tagFilter) q.set("show", tagFilter === "Proxied" ? "proxied" : "paper");
    if ($("search").value.trim()) q.set("q", $("search").value.trim());
    if (moverWindow !== 30) q.set("movers", moverWindow);
    if (sortStr(deckSort) !== "name") q.set("sort", sortStr(deckSort));
    if (sortStr(cardSort) !== "-total") q.set("cards", sortStr(cardSort));
  } else if (view === "indexView") {
    const modes = map => [...map].map(([k, m]) => (m === "out" ? "-" : "") + k).join(",");
    if (ix.search) q.set("q", ix.search);
    if (ix.colors.size) q.set("colors", modes(ix.colors));
    if (ix.types.size) q.set("types", modes(ix.types));
    if (ix.subtype) q.set("sub", ix.subtype);
    if (ix.sets.length) q.set("sets", ix.sets.join(","));
    if (ix.skip.size) q.set("skip", [...ix.skip].join(","));
    if (checkedDecks().length > 1 && ix.match === "every") q.set("match", "every");
    if (ix.commanders) q.set("cmd", ix.commanders);
    if (ix.proxies) q.set("proxied", ix.proxies);
    if ([...ix.stores].sort().join(",") !== "ck,tcg") q.set("stores", [...ix.stores].join(","));
    if (ix.layout === "grid") q.set("layout", "grid");
    if (sortStr(ixSort) !== "-qty") q.set("sort", sortStr(ixSort));
  }
  const qs = q.toString().replace(/%2C/g, ",");
  return "#" + VIEW_SLUG[view] + (qs ? "?" + qs : "");
}

function syncUrl() {
  if (!urlReady) return;
  const next = buildUrl();
  if (next === location.hash) return;
  const nav = view + "|" + (view === "pricesView" ? selected : "");
  if (nav !== lastNav) history.pushState(null, "", next); else history.replaceState(null, "", next);
  lastNav = nav;
}

function readUrl() {
  const [slug, qs = ""] = location.hash.replace(/^#/, "").split("?");
  const q = new URLSearchParams(qs);
  view = SLUG_VIEW[slug] || OLD_SLUGS[slug] || "pricesView";
  source = SLUG_PRICE[q.get("price")] || "price_tcgplayer";
  $("source").value = source;
  // reset everything, then apply what the link specifies
  selected = ALL; asOf = null; tagFilter = null; moverWindow = 30; $("search").value = "";
  Object.assign(deckSort, { k: "name", dir: 1 }); Object.assign(cardSort, { k: "total", dir: -1 });
  Object.assign(ix, { search: "", subtype: "", sets: [], match: "any", commanders: "", proxies: "", layout: "table" });
  ix.colors = new Map(); ix.types = new Map(); ix.skip = new Set(); ix.stores = new Set(["tcg", "ck"]); Object.assign(ixSort, { k: "qty", dir: -1 });
  const known = id => decks.has(id) && !decks.get(id).virtual;

  if (view === "pricesView") {
    const dk = q.get("deck");
    selected = dk === "average" ? AVG : dk && known(dk) ? dk : ALL;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get("on") || "")) asOf = q.get("on");
    tagFilter = q.get("show") === "proxied" ? "Proxied" : q.get("show") === "paper" ? "Paper" : null;
    $("search").value = q.get("q") || "";
    if (q.get("movers") === "7") moverWindow = 7;
    readSort(q.get("sort"), deckSort); readSort(q.get("cards"), cardSort);
  } else if (view === "indexView") {
    // "W,-R" style lists ("-" = excluded); older links used "WG" for colors
    const readModes = (str, ok = () => true) => new Map(csvList(str).map(x => x.startsWith("-") ? [x.slice(1), "out"] : [x, "in"]).filter(([k]) => ok(k)));
    const colorStr = (q.get("colors") || "").toUpperCase();
    ix.colors = readModes(/[,-]/.test(colorStr) ? colorStr : colorStr.split("").join(","), k => k in COLOR_NAMES);
    ix.search = (q.get("q") || "").toLowerCase();
    ix.types = readModes(q.get("types"));
    ix.subtype = (q.get("sub") || "").toLowerCase();
    ix.sets = csvList(q.get("sets")).map(x => x.toUpperCase());
    ix.skip = new Set(csvList(q.get("skip")).filter(known));
    // older links listed decks to include ("decks=1,2"; excluded ones had a "-")
    const only = csvList(q.get("decks")).filter(x => !x.startsWith("-") && known(x));
    if (only.length) ix.skip = new Set(currentDeckIds().filter(id => !only.includes(id)));
    ix.match = q.get("match") === "every" ? "every" : "any";
    const tri = v => v === "1" || v === "only" ? "only" : v === "none" ? "none" : "";
    ix.commanders = tri(q.get("cmd")); ix.proxies = tri(q.get("proxied"));
    if (slug === "proxies") {   // the old Proxies tab
      ix.proxies = "only";
      if (q.get("lands") === "no") ix.types.set("Land", "out");
      if (!q.get("sort")) Object.assign(ixSort, { k: "best", dir: 1 });
    }
    const st = csvList(q.get("stores")).filter(x => STORE_NAMES[x]);
    if (st.length) ix.stores = new Set(st);
    ix.layout = q.get("layout") === "grid" ? "grid" : "table";
    readSort(q.get("sort") === "price" ? "best" : q.get("sort") === "-price" ? "-best" : q.get("sort"), ixSort);
  }
  // put the form controls in step with the state
  $("deckSortSel").value = deckSort.k;
  document.querySelectorAll(".ix-store").forEach(c => c.checked = ix.stores.has(c.value));
  $("ixSearch").value = ix.search; $("ixSubtype").value = ix.subtype; $("ixSets").value = ix.sets.join(" ");
  $("ixCommanders").value = ix.commanders; $("ixProxies").value = ix.proxies;
  lastNav = view + "|" + (view === "pricesView" ? selected : "");
}

function applyUrl() {
  readUrl();
  showView(view);
  render(); renderIndex();
}
addEventListener("popstate", () => { urlReady = false; applyUrl(); urlReady = true; });

$("copyLink").addEventListener("click", async () => {
  const btn = $("copyLink"), link = location.href;
  try { await navigator.clipboard.writeText(link); btn.textContent = "Link copied"; }
  catch { prompt("Copy this link:", link); }
  setTimeout(() => btn.textContent = "Copy link", 1600);
});

// ---------- events ----------
function sortClick(table, getState, after) {
  table.tHead.addEventListener("click", e => {
    const k = e.target.closest("th")?.dataset.k; if (!k) return;
    const state = getState();
    state.dir = state.k === k ? -state.dir : (["name", "type", "color"].includes(k) ? 1 : -1); state.k = k; after();
  });
}
sortClick($("indexTable"), () => ixSort, renderIndex);
sortClick($("cardTable"), () => cardSort, () => renderCards(decks.get(selected)));
$("deckSortSel").addEventListener("change", e => { deckSort.k = e.target.value; deckSort.dir = e.target.value === "name" ? 1 : -1; renderDecks(); syncUrl(); });
$("deckList").addEventListener("click", e => {
  const b = e.target.closest(".deck-item"); if (!b) return;
  selected = b.dataset.id; tagFilter = null; asOf = null; $("search").value = ""; render();
  if (matchMedia("(max-width: 900px)").matches) $("deckTitle").scrollIntoView({ block: "start" });
});
$("tags").addEventListener("click", e => {
  const row = e.target.closest(".tagrow"); if (!row || decks.get(selected).noCards) return;
  tagFilter = tagFilter === row.dataset.tag ? null : row.dataset.tag;
  renderTags(decks.get(selected), deckStats(decks.get(selected))); renderCards(decks.get(selected));
});
$("search").addEventListener("input", () => renderCards(decks.get(selected)));
$("source").addEventListener("change", e => { source = e.target.value; render(); renderIndex(); });
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => decks.size && drawChart(
  deckStats(decks.get(selected)).ds.map(x => ({ date: x, total: val(decks.get(selected), x), paper: val(decks.get(selected), x, "paper"), proxy: val(decks.get(selected), x, "proxy") })),
  decks.get(selected).noCards ? [] : deckSwaps(decks.get(selected))), 150); });

start().catch(err => { console.error(err); $("subtitle").textContent = "No data loaded yet"; $("loadError").hidden = false; });
