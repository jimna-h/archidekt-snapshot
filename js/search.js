// Search all decks tab, including the deck overlap grid.

// ---------- search all decks ----------
// Every filter can say "not":
//   colors / types / decks  Map(value -> "in" | "out"); clicking cycles off -> in -> out -> off
//   name search             a leading "-" excludes names containing the rest
//   subtype / sets          space- or comma-separated terms; a leading "-" excludes that term
//   commanders / proxies    "" (either), "only", or "none"
const ix = { search: "", colors: new Map(), types: new Map(), subtype: "", sets: [], decks: new Map(), match: "any", commanders: "", proxies: "" };
let ixSort = { k: "decks", dir: -1 };
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

// Card names in each current deck, for "not in deck X".
let deckNamesCache = null;
const namesInDeck = id => {
  if (!deckNamesCache) deckNamesCache = new Map(realDecks().map(d => [d.id, new Set(d.rows.map(r => r.card_name))]));
  return deckNamesCache.get(id) || new Set();
};

function indexCards() {
  const byName = new Map(), inDecks = keysWith(ix.decks, "in");
  for (const d of realDecks()) {
    if (isStale(d) || (inDecks.length && !inDecks.includes(d.id))) continue;
    const cmds = commandersOf.get(d.id) || new Set();
    for (const r of d.rows) {
      // a set filter limits which copies count
      const set = r.set_code.toUpperCase();
      if (setFilter.yes && !setFilter.yes.has(set)) continue;
      if (setFilter.no.has(set)) continue;
      let c = byName.get(r.card_name);
      if (!c) {
        const info = cardInfo.get(r.card_name) || {};
        const [types, subtypes = ""] = (info.type_line || "").split(" — ");
        byName.set(r.card_name, c = { name: r.card_name, type: info.type_line || "", types: types.split(" ").filter(Boolean), subtypes,
          mv: info.mana_value === "" || info.mana_value == null ? null : +info.mana_value,
          color: info.color_identity ?? null, qty: 0, perDeck: new Map(), commander: false, proxied: false,
          price: null, printings: new Set(), sets: new Map() });
      }
      c.qty += r.qty;
      // price = the cheapest printing among the ones you play
      c.printings.add(printKey(r));
      c.sets.set(set, (c.sets.get(set) || 0) + r.qty);
      const p = priceIn(r); if (p != null && (c.price == null || p < c.price)) c.price = p;
      const e = c.perDeck.get(d.id) || { qty: 0, cmd: false, proxy: false };
      e.qty += r.qty; e.cmd ||= cmds.has(r.card_name); e.proxy ||= isProxy(r);
      c.perDeck.set(d.id, e);
      c.commander ||= e.cmd; c.proxied ||= e.proxy;
    }
  }
  return [...byName.values()].map(c => ({ ...c, decks: c.perDeck.size,
    setList: [...c.sets.keys()].sort().join(", ") }));
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
  if (keysWith(ix.decks, "out").some(id => namesInDeck(id).has(c.name))) return false;
  const inDecks = keysWith(ix.decks, "in");
  if (ix.match === "every" && inDecks.length > 1 && c.perDeck.size < inDecks.length) return false;
  if (ix.commanders === "only" && !c.commander) return false;
  if (ix.commanders === "none" && c.commander) return false;
  if (ix.proxies === "only" && !c.proxied) return false;
  if (ix.proxies === "none" && c.proxied) return false;
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

function renderIndex() {
  const typesPresent = new Set([...cardInfo.values()].flatMap(c => (c.type_line || "").split(" — ")[0].split(" ")));
  triDropdown($("ixTypeDD"), MAIN_TYPES.filter(t => typesPresent.has(t)).map(t => [t, t]), ix.types);
  triDropdown($("ixDeckDD"), sortBy(realDecks().filter(d => !isStale(d)).map(d => ({ id: d.id, name: d.name })), { k: "name", dir: 1 }).map(d => [d.id, d.name]), ix.decks);
  const sets = resolveSets();
  $("ixMatch").hidden = keysWith(ix.decks, "in").length < 2; $("ixMatch").value = ix.match;
  $("ixColors").innerHTML = "WUBRGC".split("").map(k => {
    const st = ix.colors.get(k) || "";
    return `<button data-c="${k}" data-state="${st}" aria-pressed="${st === "in"}"
      title="${COLOR_NAMES[k]}${st === "in" ? " (included)" : st === "out" ? " (excluded)" : ""}. Click to include, again to exclude."><span class="pip ${k}">${k}</span></button>`;
  }).join("");

  const all = indexCards(), list = sortBy(all.filter(ixMatches), ixSort);
  const copies = list.reduce((s, c) => s + c.qty, 0);
  $("ixResult").textContent = `${list.length} of ${all.length} cards · ${copies} copies` +
    (sets.matched.length ? ` from ${sets.matched.join(", ")}` : setFilter.yes ? ` from no set you play` : "") +
    (sets.excluded.length ? `, not from ${sets.excluded.join(", ")}` : "") +
    (sets.unknown.length ? ` (no cards match ${sets.unknown.join(", ")})` : "") +
    (cardInfo.size ? "" : " · types arrive with the next run");
  const MAX = 400;
  $("indexTable").tBodies[0].innerHTML = list.slice(0, MAX).map((c, i) => `
    <tr>
      <td class="rownum">${i + 1}</td>
      <td><span class="card-name">${esc(c.name)}</span>${c.commander ? ` <span class="badge">Commander</span>` : ""}</td>
      <td class="type-col">${esc(c.type || "–")}</td>
      <td class="num">${c.mv ?? "–"}</td>
      <td>${pipsHtml(c.color)}</td>
      <td class="num">${c.decks}</td>
      <td class="num">${c.qty}</td>
      <td class="num" ${c.printings.size > 1 ? `title="Cheapest of the ${c.printings.size} printings you play"` : ""}>${money(c.price)}${c.printings.size > 1 ? `<div class="printings-note">cheapest of ${c.printings.size}</div>` : ""}</td>
      <td class="sets-col">${[...c.sets].sort((a, b) => a[0].localeCompare(b[0])).map(([set, n]) =>
        `<span class="set-code" title="${n} ${n === 1 ? "copy" : "copies"} from ${esc(set)}">${esc(set)}${c.sets.size > 1 && n > 1 ? `<span class="muted"> ×${n}</span>` : ""}</span>`).join(" ")}</td>
      <td><div class="where">${sortBy([...c.perDeck].map(([id, e]) => ({ e, name: deckName(id) })), { k: "name", dir: 1 })
        .map(({ name, e }) => `<span class="dchip ${e.cmd ? "cmd" : ""} ${e.proxy ? "proxy" : ""}">${esc(name)}${e.qty > 1 ? " ×" + e.qty : ""}</span>`).join("")}</div></td>
    </tr>`).join("") + (list.length > MAX ? `<tr><td colspan="10" class="muted">First ${MAX} shown. Narrow the filters for more.</td></tr>` : "")
    || `<tr><td colspan="10" class="muted">No cards match.</td></tr>`;
  markSort($("indexTable"), ixSort);
  const ixs = sortStr(ixSort); $("ixSortSel").value = [...$("ixSortSel").options].some(o => o.value && o.value === ixs) ? ixs : "";
  renderOverlap();
  syncUrl();
}

// Deck overlap: unique non-basic card names shared by each pair of current decks.
function renderOverlap() {
  const ds = sortBy(realDecks().filter(d => !isStale(d)).map(d => ({ id: d.id, name: d.name,
    cards: new Set(d.rows.map(r => r.card_name).filter(n => !isBasic(n))) })), { k: "name", dir: 1 });
  const shared = (a, b) => { let n = 0; for (const c of a.cards) if (b.cards.has(c)) n++; return n; };
  let max = 1; const m = ds.map(a => ds.map(b => { const n = a === b ? null : shared(a, b); if (n > max) max = n; return n; }));
  const shade = n => `color-mix(in oklab, var(--series-1) ${Math.round(8 + n / max * 62)}%, var(--surface))`;
  $("overlapGrid").innerHTML = `<thead><tr><th></th>${ds.map((d, j) => `<th class="colh" title="${esc(d.name)}">${j + 1}</th>`).join("")}</tr></thead><tbody>` +
    ds.map((a, i) => `<tr><th class="rowh" title="${esc(a.name)}">${i + 1}. ${esc(a.name.replace(/^\d+\.\s*/, ""))}</th>${ds.map((b, j) =>
      m[i][j] == null ? `<td><div class="self"></div></td>` : m[i][j] === 0 ? `<td><div class="zero">0</div></td>` :
      `<td><button data-a="${esc(a.id)}" data-b="${esc(b.id)}" style="background:${shade(m[i][j])};${m[i][j] / max > 0.6 ? "color:#fff" : ""}" title="${esc(a.name)} and ${esc(b.name)} share ${m[i][j]} cards">${m[i][j]}</button></td>`).join("")}</tr>`).join("") + `</tbody>`;
}
$("overlapGrid").addEventListener("click", e => {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  ix.decks = new Map([[b.dataset.a, "in"], [b.dataset.b, "in"]]); ix.match = "every";
  renderIndex();
  $("indexTable").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});

$("ixSearch").addEventListener("input", e => { ix.search = e.target.value.trim().toLowerCase(); renderIndex(); });
$("ixSubtype").addEventListener("input", e => { ix.subtype = e.target.value.trim().toLowerCase(); renderIndex(); });
$("ixCommanders").addEventListener("change", e => { ix.commanders = e.target.value; renderIndex(); });
$("ixProxies").addEventListener("change", e => { ix.proxies = e.target.value; renderIndex(); });
$("ixMatch").addEventListener("change", e => { ix.match = e.target.value; renderIndex(); });
$("ixColors").addEventListener("click", e => {
  const b = e.target.closest("button[data-c]"); if (!b) return;
  cycle(ix.colors, b.dataset.c); renderIndex();
});
// keep the dropdown open (and focus on the same row) while clicking through states
for (const [dd, map] of [["ixTypeDD", () => ix.types], ["ixDeckDD", () => ix.decks]])
  $(dd).addEventListener("click", e => {
    const b = e.target.closest("button.tri"); if (!b) return;
    cycle(map(), b.dataset.v); renderIndex();
    $(dd).querySelector(`button.tri[data-v="${CSS.escape(b.dataset.v)}"]`)?.focus();
  });
const parseSets = text => text.toUpperCase().split(/[\s,;]+/).map(x => x.replace(/[^A-Z0-9!-]/g, "")).filter(Boolean);
$("ixSets").addEventListener("input", e => { ix.sets = parseSets(e.target.value); renderIndex(); });
$("ixSortSel").addEventListener("change", e => { readSort(e.target.value, ixSort); renderIndex(); });
$("ixClear").addEventListener("click", () => {
  Object.assign(ix, { search: "", subtype: "", sets: [], commanders: "", proxies: "", match: "any" });
  ix.colors.clear(); ix.types.clear(); ix.decks.clear();
  $("ixSearch").value = $("ixSubtype").value = $("ixSets").value = ""; $("ixCommanders").value = $("ixProxies").value = ""; renderIndex();
});
// close open dropdowns on outside clicks; composedPath() still knows where the click
// started even if that element was just redrawn
document.addEventListener("click", e => { const path = e.composedPath(); document.querySelectorAll("details.dd[open]").forEach(d => { if (!path.includes(d)) d.open = false; }); });
