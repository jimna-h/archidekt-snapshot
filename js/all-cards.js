// Cards tab: every card across the current decks, with filters, store prices, a
// replacement-cost summary (e.g. for proxies), a table or image grid, and the deck overlap grid.

// ---------- all cards ----------
// Filters:
//   colors / types        Map(value -> "in" | "out"); clicking cycles off -> in -> out -> off
//                         ("Exclude lands" is a shortcut for Land -> out)
//   name search           a leading "-" excludes names containing the rest
//   subtype / sets        space- or comma-separated terms; a leading "-" excludes that term
//   skip                  decks left out (every deck starts checked); only checked decks' copies count
//   match                 "every": with two or more checked decks, only cards in all of them
//   commanders / gc       "" (either), "only", or "none" (gc = Game Changers)
//   pmin / pmax           price per copy (cheapest compared store), null = no bound
//   proxies               "" (all copies), "only" (proxy copies only), "none" (paper copies only)
// Like the set and deck filters, the proxy filter limits which copies count, so copies,
// prices and totals always describe exactly the copies shown.
const ix = { search: "", colors: new Map(), types: new Map(), subtype: "", sets: [], skip: new Set(), match: "any",
  commanders: "", gc: "", pmin: null, pmax: null, proxies: "", stores: new Set(["tcg", "ck"]), layout: "table" };
// Game Changers, from the cards behind each deck's bracket on Archidekt
const gameChangers = () => new Set([...deckMeta.values()].flatMap(m => (m.game_changers || "").split(" | ").filter(Boolean)));
let ixSort = { k: "qty", dir: -1 };   // most copies first
const STORE_KEYS = { tcg: "price_tcgplayer", ck: "price_cardkingdom", cm: "price_cardmarket" };
const currentDeckIds = () => realDecks().filter(d => !isStale(d)).map(d => d.id);
const checkedDecks = () => currentDeckIds().filter(id => !ix.skip.has(id));
const MAIN_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land", "Legendary", "Tribal", "Kindred"];
const COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };
const isBasic = name => (cardInfo.get(name)?.type_line || "").startsWith("Basic ");
const keysWith = (map, mode) => [...map].filter(([, m]) => m === mode).map(([k]) => k);
const cycle = (map, key) => { const m = map.get(key); m === "in" ? map.set(key, "out") : m === "out" ? map.delete(key) : map.set(key, "in"); };
// "elf -druid, bird" -> { yes: ["elf", "bird"], no: ["druid"] }
const splitTerms = text => {
  const yes = [], no = [];
  for (const t of text.split(/[\s,;]+/).filter(Boolean)) {
    if (/^[-!]./.test(t)) no.push(t.slice(1)); else if (!/^[-!]$/.test(t)) yes.push(t);
  }
  return { yes, no };
};

let gcSet = new Set();
// Front face only, so a spell // land card (e.g. a modal double-faced card) still counts as a spell
const isLand = name => /\bLand\b/.test((cardInfo.get(name)?.type_line || "").split(" // ")[0].split(" — ")[0]);

function indexCards() {
  const byName = new Map();
  for (const d of realDecks()) {
    if (isStale(d) || ix.skip.has(d.id)) continue;
    const cmds = commandersOf.get(d.id) || new Set();
    for (const r of d.rows) {
      // the set and proxy filters limit which copies count
      const set = r.set_code.toUpperCase();
      if (setFilter.yes && !setFilter.yes.has(set)) continue;
      if (setFilter.no.has(set)) continue;
      if (ix.proxies === "only" && !isProxy(r)) continue;
      if (ix.proxies === "none" && isProxy(r)) continue;
      let c = byName.get(r.card_name);
      if (!c) {
        const info = cardInfo.get(r.card_name) || {};
        const [types, subtypes = ""] = (info.type_line || "").split(" — ");
        byName.set(r.card_name, c = { name: r.card_name, type: info.type_line || "", types: types.split(" ").filter(Boolean), subtypes,
          mv: info.mana_value === "" || info.mana_value == null ? null : +info.mana_value,
          color: info.color_identity ?? null, qty: 0, perDeck: new Map(), commander: false, proxied: false,
          tcg: null, ck: null, cm: null, tot: { tcg: 0, ck: 0, cm: 0 }, mix: 0, id: "", printings: new Set(), sets: new Map() });
      }
      c.qty += r.qty;
      c.printings.add(printKey(r));
      c.sets.set(set, (c.sets.get(set) || 0) + r.qty);
      if (!c.id && r.scryfall_id) c.id = r.scryfall_id;   // a printing you play, for the card image
      // per store: the cheapest printing you play (per copy), and what all these copies cost there
      for (const [s, col] of Object.entries(STORE_KEYS)) {
        const p = priceIn(r, col);
        if (p != null && (c[s] == null || p < c[s])) c[s] = p;
        c.tot[s] += (p ?? 0) * r.qty;
      }
      // each copy bought wherever it's cheapest among the compared stores
      const opts = [...ix.stores].map(s => priceIn(r, STORE_KEYS[s])).filter(p => p != null);
      if (opts.length) c.mix += Math.min(...opts) * r.qty;
      const e = c.perDeck.get(d.id) || { qty: 0, cmd: false, proxy: false };
      e.qty += r.qty; e.cmd ||= cmds.has(r.card_name); e.proxy ||= isProxy(r);
      c.perDeck.set(d.id, e);
      c.commander ||= e.cmd; c.proxied ||= e.proxy;
    }
  }
  return [...byName.values()].map(c => {
    const [bestStore, best] = [...ix.stores].map(s => [s, c[s]]).filter(([, p]) => p != null).sort((a, b) => a[1] - b[1])[0] || [null, null];
    return { ...c, decks: c.perDeck.size, bestStore, best, price: best, setList: [...c.sets.keys()].sort().join(", ") };
  });
}

// Typed set terms -> set codes. An exact code matches itself; otherwise it matches every
// set you play that starts with it ("MH" -> MH1, MH2, MH3). "-LTR" excludes.
let setFilter = { yes: null, no: new Set() };
function resolveSets() {
  const all = setCounts().map(([set]) => set), unknown = [];
  const expand = (terms, label) => {
    const out = new Set();
    for (const t of terms) {
      const hits = all.includes(t) ? [t] : all.filter(x => x.startsWith(t));
      hits.length ? hits.forEach(h => out.add(h)) : unknown.push(label + t);
    }
    return out;
  };
  const { yes, no } = splitTerms(ix.sets.join(" "));
  setFilter = { yes: yes.length ? expand(yes, "") : null, no: expand(no, "-") };
  return { matched: setFilter.yes ? [...setFilter.yes].filter(x => !setFilter.no.has(x)).sort() : [], excluded: [...setFilter.no].sort(), unknown };
}
let setCountsCache = null;
function setCounts() {
  if (setCountsCache) return setCountsCache;
  const m = new Map();
  for (const d of realDecks()) if (!isStale(d)) for (const r of d.rows) {
    const set = r.set_code.toUpperCase(); m.set(set, (m.get(set) || 0) + r.qty);
  }
  return setCountsCache = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function ixMatches(c) {
  const name = c.name.toLowerCase();
  if (ix.search) {
    const neg = /^[-!]/.test(ix.search), term = neg ? ix.search.slice(1) : ix.search;
    if (term && name.includes(term) === neg) return false;
  }
  if (ix.subtype) {
    const sub = c.subtypes.toLowerCase(), { yes, no } = splitTerms(ix.subtype);
    if (yes.length && !yes.some(t => sub.includes(t))) return false;
    if (no.some(t => sub.includes(t))) return false;
  }
  const id = c.color || "", hasColor = k => k === "C" ? id === "" && c.color != null : id.includes(k);
  const colorsIn = keysWith(ix.colors, "in"), colorsOut = keysWith(ix.colors, "out");
  if (colorsIn.length && !colorsIn.some(hasColor)) return false;
  if (colorsOut.some(hasColor)) return false;
  const typesIn = keysWith(ix.types, "in"), typesOut = keysWith(ix.types, "out");
  if (typesIn.length && !c.types.some(t => typesIn.includes(t))) return false;
  if (typesOut.some(t => c.types.includes(t))) return false;
  const n = checkedDecks().length;
  if (ix.match === "every" && n > 1 && c.perDeck.size < n) return false;
  if (ix.commanders === "only" && !c.commander) return false;
  if (ix.commanders === "none" && c.commander) return false;
  if (ix.gc) { const g = gcSet.has(c.name); if (ix.gc === "only" ? !g : g) return false; }
  if (ix.pmin != null && !(c.best >= ix.pmin)) return false;
  if (ix.pmax != null && !(c.best <= ix.pmax)) return false;
  return true;
}
const pipsHtml = id => id == null ? `<span class="muted">?</span>` :
  `<span class="pips">${(id || "C").split("").map(k => `<span class="pip ${k}">${k}</span>`).join("")}</span>`;

// Dropdown whose rows cycle off -> include -> exclude.
function triDropdown(dd, items, map) {
  dd.querySelector(".panel").innerHTML = `<div class="tri-hint">Click once to include, twice to exclude</div>` +
    (items.map(([v, label]) => {
      const st = map.get(v) || "";
      return `<button type="button" class="tri" data-v="${esc(v)}" data-state="${st}" role="checkbox"
        aria-checked="${st === "in"}" aria-label="${esc(label)}${st === "out" ? ", excluded" : ""}"><span class="box"></span>${esc(label)}</button>`;
    }).join("") || `<div class="muted">Nothing yet</div>`);
  const nIn = keysWith(map, "in").length, nOut = keysWith(map, "out").length, badge = dd.querySelector(".count-badge");
  badge.hidden = !map.size;
  badge.textContent = nIn && nOut ? `${nIn} · not ${nOut}` : nOut ? `not ${nOut}` : nIn;
  badge.classList.toggle("not", !nIn && nOut > 0);
}

// Every deck starts checked; unchecking one leaves its copies out.
function fillDeckDropdown() {
  const items = sortBy(realDecks().filter(d => !isStale(d)).map(d => ({ id: d.id, name: d.name })), { k: "name", dir: 1 });
  const left = items.filter(x => !ix.skip.has(x.id)).length;
  $("ixDeckDD").querySelector(".panel").innerHTML =
    `<select id="ixMatch" aria-label="Which checked decks" ${left > 1 ? "" : "disabled"}>
       <option value="any" ${ix.match === "any" ? "selected" : ""}>Cards in any checked deck</option>
       <option value="every" ${ix.match === "every" ? "selected" : ""}>Only cards in every checked deck</option>
     </select>` +
    `<label class="all"><input type="checkbox" value="*" ${left === items.length ? "checked" : ""}> All decks</label>` +
    items.map(x => `<label><input type="checkbox" value="${esc(x.id)}" ${ix.skip.has(x.id) ? "" : "checked"}> ${esc(x.name)}</label>`).join("");
  $("ixDeckDD").querySelector('input[value="*"]').indeterminate = left > 0 && left < items.length;
  $("ixDeckDD").querySelector(".count-badge").textContent = `${left}/${items.length}`;
}

// Card image for a printing you play, straight from Scryfall's image server by its id
function cardImg(c) {
  const id = (c.id || "").toLowerCase();
  return /^[0-9a-f-]{36}$/.test(id)
    ? `<img src="https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg" alt="${esc(c.name)}" loading="lazy" decoding="async" onerror="this.remove()">`
    : "";
}
const deckChips = c => sortBy([...c.perDeck].map(([id, e]) => ({ e, name: deckName(id) })), { k: "name", dir: 1 });

function renderIndex() {
  const typesPresent = new Set([...cardInfo.values()].flatMap(c => (c.type_line || "").split(" — ")[0].split(" ")));
  triDropdown($("ixTypeDD"), MAIN_TYPES.filter(t => typesPresent.has(t)).map(t => [t, t]), ix.types);
  fillDeckDropdown();
  $("ixLands").setAttribute("aria-pressed", String(ix.types.get("Land") === "out"));
  const sets = resolveSets();
  $("ixColors").innerHTML = "WUBRGC".split("").map(k => {
    const st = ix.colors.get(k) || "";
    return `<button data-c="${k}" data-state="${st}" aria-pressed="${st === "in"}"
      title="${COLOR_NAMES[k]}${st === "in" ? " (included)" : st === "out" ? " (excluded)" : ""}. Click to include, again to exclude."><span class="pip ${k}">${k}</span></button>`;
  }).join("");

  gcSet = gameChangers(); syncSegs();
  const list = sortBy(indexCards().filter(ixMatches), ixSort);
  const copies = list.reduce((s, c) => s + c.qty, 0), mix = list.reduce((s, c) => s + c.mix, 0);
  const deckCount = new Set(list.flatMap(c => [...c.perDeck.keys()])).size;
  const storeTotal = s => list.reduce((t, c) => t + c.tot[s], 0);
  $("ixSummary").innerHTML = `
    <div><div class="lbl" title="Each copy at whichever compared store is cheapest">${ix.proxies === "only" ? "Cost to replace these proxies" : "Value at the cheapest store"}</div>
      <div class="big num" style="text-align:left">${money(mix)}</div></div>
    <div class="alt"><div>${list.length} card${list.length === 1 ? "" : "s"} · ${copies} ${copies === 1 ? "copy" : "copies"} · ${deckCount} deck${deckCount === 1 ? "" : "s"}</div>
      ${Object.keys(STORE_NAMES).map(s => `<div class="${ix.stores.has(s) ? "" : "off"}">${STORE_NAMES[s]} only: ${money(storeTotal(s))}</div>`).join("")}</div>`;
  const notes = [
    sets.matched.length ? `From ${sets.matched.join(", ")}` : setFilter.yes ? "From no set you play" : "",
    sets.excluded.length ? `Not from ${sets.excluded.join(", ")}` : "",
    sets.unknown.length ? `No cards match ${sets.unknown.join(", ")}` : "",
    cardInfo.size ? "" : "Types arrive with the next run",
  ].filter(Boolean);
  $("ixResult").textContent = notes.join(" · "); $("ixResult").hidden = !notes.length;

  const priceCell = (c, s) => `<td class="num ${c.bestStore === s ? "best" : ""} ${ix.stores.has(s) ? "" : "muted"}"
      ${c.printings.size > 1 && c[s] != null ? `title="Cheapest of the ${c.printings.size} printings you play"` : ""}>${money(c[s])}</td>`;
  $("indexTable").tBodies[0].innerHTML = list.map((c, i) => `
    <tr>
      <td class="rownum">${i + 1}</td>
      <td><span class="card-name">${esc(c.name)}</span>${c.commander ? ` <span class="badge">Commander</span>` : ""}</td>
      <td class="type-col">${esc(c.type || "–")}</td>
      <td class="num">${c.mv ?? "–"}</td>
      <td>${pipsHtml(c.color)}</td>
      <td class="num">${c.qty}</td>
      ${priceCell(c, "tcg")}${priceCell(c, "ck")}${priceCell(c, "cm")}
      <td class="sets-col"><span class="m-only">${c.qty} ${c.qty === 1 ? "copy" : "copies"}</span> ${[...c.sets].sort((a, b) => a[0].localeCompare(b[0])).map(([set, n]) =>
        `<span class="set-code" title="${n} ${n === 1 ? "copy" : "copies"} from ${esc(set)}">${esc(set)}${c.sets.size > 1 && n > 1 ? `<span class="muted"> ×${n}</span>` : ""}</span>`).join(" ")}</td>
      <td><div class="where">${deckChips(c).map(({ name, e }) => `<span class="dchip ${e.cmd ? "cmd" : ""} ${e.proxy ? "proxy" : ""}">${esc(name)}${e.qty > 1 ? " ×" + e.qty : ""}</span>`).join("")}</div></td>
      <td class="m-best"><b>${money(c.best)}</b><span>${c.bestStore ? STORE_NAMES[c.bestStore] : "No price"}</span></td>
    </tr>`).join("")
    || `<tr><td colspan="11" class="muted empty-row">No cards match.</td></tr>`;
  $("ixGrid").innerHTML = list.map(c => `
    <figure class="px-tile" title="${esc(c.name)}\n${esc(deckChips(c).map(({ name, e }) => name + (e.qty > 1 ? " ×" + e.qty : "")).join("\n"))}">
      <div class="px-img"><div class="ph">${esc(c.name)}</div>${cardImg(c)}${c.qty > 1 ? `<span class="px-qty">×${c.qty}</span>` : ""}</div>
      <figcaption><b class="num">${money(c.best)}</b><span class="muted">${c.bestStore ? STORE_NAMES[c.bestStore] : "No price"}</span></figcaption>
    </figure>`).join("") || `<div class="muted">No cards match.</div>`;
  const grid = ix.layout === "grid";
  $("ixGrid").hidden = !grid; $("ixTableBox").hidden = grid;
  $("ixLayout").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.l === ix.layout)));
  markSort($("indexTable"), ixSort);
  const ixs = sortStr(ixSort); $("ixSortSel").value = [...$("ixSortSel").options].some(o => o.value && o.value === ixs) ? ixs : "";
  renderOverlap(list);
  $("ixClear").disabled = !filtersActive();
  syncUrl();
}

// Deck overlap: how many of the cards shown (basic lands aside) each pair of checked decks shares,
// so it follows every filter above.
function renderOverlap(list) {
  const checked = new Set(checkedDecks()), byDeck = new Map([...checked].map(id => [id, new Set()]));
  for (const c of list) if (!isBasic(c.name)) for (const id of c.perDeck.keys()) byDeck.get(id)?.add(c.name);
  const ds = sortBy(realDecks().filter(d => checked.has(d.id)).map(d => ({ id: d.id, name: d.name, cards: byDeck.get(d.id) })), { k: "name", dir: 1 });
  const shared = (a, b) => { let n = 0; for (const c of a.cards) if (b.cards.has(c)) n++; return n; };
  let max = 1; const m = ds.map(a => ds.map(b => { const n = a === b ? null : shared(a, b); if (n > max) max = n; return n; }));
  const shade = n => `color-mix(in oklab, var(--series-1) ${Math.round(8 + n / max * 62)}%, var(--surface))`;
  // Each pair appears once, below the diagonal, as a staircase: row i holds deck i's counts
  // with the decks before it, then deck i's own name (in the diagonal cell, running right)
  // heads the column of counts directly beneath it.
  const n = ds.length, cols = n - 1;
  const cell = (a, b, v) => v === 0 ? `<td><div class="zero">0</div></td>` :
    `<td><button data-a="${esc(a.id)}" data-b="${esc(b.id)}" style="background:${shade(v)};${v / max > 0.6 ? "color:#fff" : ""}" title="${esc(a.name)} and ${esc(b.name)} share ${v} cards">${v}</button></td>`;
  $("overlapGrid").innerHTML = n < 2 ? "" : `<tbody>` + ds.map((a, i) => `<tr>
      <th class="rowh" title="${esc(a.name)}">${i ? esc(a.name) : ""}</th>
      ${ds.slice(0, i).map((b, j) => cell(a, b, m[i][j])).join("")}
      ${i < cols ? `<th class="colh" title="${esc(a.name)}"><span>${esc(a.name)}</span></th>` : ""}
    </tr>`).join("") + `</tbody>`;
}
// Highlight the hovered cell's column as well as its row
$("overlapGrid").addEventListener("mouseover", e => {
  const cell = e.target.closest("td, th"), col = cell ? cell.cellIndex : -1;
  $("overlapGrid").querySelectorAll(".colhl, .rowhl").forEach(c => c.classList.remove("colhl", "rowhl"));
  if (col > 0) $("overlapGrid").querySelectorAll("tr").forEach(tr => tr.cells[col]?.classList.add("colhl"));
  if (cell?.tagName === "TD") cell.parentElement.querySelector("th.rowh")?.classList.add("rowhl");
});
$("overlapGrid").addEventListener("mouseleave", () => $("overlapGrid").querySelectorAll(".colhl, .rowhl").forEach(c => c.classList.remove("colhl", "rowhl")));
$("overlapGrid").addEventListener("click", e => {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  ix.skip = new Set(currentDeckIds().filter(id => id !== b.dataset.a && id !== b.dataset.b)); ix.match = "every";
  renderIndex();
  $("indexTable").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});

$("ixSearch").addEventListener("input", e => { ix.search = e.target.value.trim().toLowerCase(); renderIndex(); });
$("ixSubtype").addEventListener("input", e => { ix.subtype = e.target.value.trim().toLowerCase(); renderIndex(); });
// either/or switches: Copies (proxies), Commanders, Game Changers
const SEGS = { ixProxies: "proxies", ixCommanders: "commanders", ixGC: "gc" };
for (const [id, key] of Object.entries(SEGS))
  $(id).addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { ix[key] = b.dataset.v; renderIndex(); } });
const syncSegs = () => { for (const [id, key] of Object.entries(SEGS)) $(id).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === ix[key]))); };
const readPrice = el => { const v = el.value.trim(); return v === "" || isNaN(+v) ? null : +v; };
for (const [id, key] of [["ixPmin", "pmin"], ["ixPmax", "pmax"]])
  $(id).addEventListener("input", e => { ix[key] = readPrice(e.target); renderIndex(); });
$("ixDeckDD").addEventListener("change", e => {
  const v = e.target.value;
  if (e.target.id === "ixMatch") ix.match = v;
  else if (v === "*") ix.skip = e.target.checked ? new Set() : new Set(currentDeckIds());
  else e.target.checked ? ix.skip.delete(v) : ix.skip.add(v);
  renderIndex();
});
$("ixLands").addEventListener("click", () => { ix.types.get("Land") === "out" ? ix.types.delete("Land") : ix.types.set("Land", "out"); renderIndex(); });
$("ixLayout").addEventListener("click", e => { const b = e.target.closest("button[data-l]"); if (b) { ix.layout = b.dataset.l; renderIndex(); } });
document.querySelectorAll(".ix-store").forEach(c => c.addEventListener("change", () => {
  c.checked ? ix.stores.add(c.value) : ix.stores.delete(c.value);
  if (!ix.stores.size) { ix.stores.add(c.value); c.checked = true; }
  renderIndex();
}));
$("ixColors").addEventListener("click", e => {
  const b = e.target.closest("button[data-c]"); if (!b) return;
  cycle(ix.colors, b.dataset.c); renderIndex();
});
// keep the dropdown open (and focus on the same row) while clicking through states
for (const [dd, map] of [["ixTypeDD", () => ix.types]])
  $(dd).addEventListener("click", e => {
    const b = e.target.closest("button.tri"); if (!b) return;
    cycle(map(), b.dataset.v); renderIndex();
    $(dd).querySelector(`button.tri[data-v="${CSS.escape(b.dataset.v)}"]`)?.focus();
  });
const parseSets = text => text.toUpperCase().split(/[\s,;]+/).map(x => x.replace(/[^A-Z0-9!-]/g, "")).filter(Boolean);
$("ixSets").addEventListener("input", e => { ix.sets = parseSets(e.target.value); renderIndex(); });
$("ixSortSel").addEventListener("change", e => { readSort(e.target.value, ixSort); renderIndex(); });
// Anything narrowing the list (sort, stores and layout aren't filters)
const filtersActive = () => !!(ix.search || ix.subtype || ix.sets.length || ix.commanders || ix.gc || ix.proxies || ix.match !== "any" ||
  ix.pmin != null || ix.pmax != null ||
  ix.colors.size || ix.types.size || ix.skip.size);
$("ixClear").addEventListener("click", () => {
  Object.assign(ix, { search: "", subtype: "", sets: [], commanders: "", gc: "", pmin: null, pmax: null, proxies: "", match: "any" });
  ix.colors.clear(); ix.types.clear(); ix.skip.clear();
  $("ixSearch").value = $("ixSubtype").value = $("ixSets").value = $("ixPmin").value = $("ixPmax").value = ""; renderIndex();
});
// close open dropdowns on outside clicks; composedPath() still knows where the click
// started even if that element was just redrawn
document.addEventListener("click", e => { const path = e.composedPath(); document.querySelectorAll("details.dd[open]").forEach(d => { if (!path.includes(d)) d.open = false; }); });
