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
  commanders: "", gc: "", pmin: null, pmax: null, mvmin: null, mvmax: null, proxies: "", stores: new Set(["tcg", "ck"]), layout: "table" };
// Game Changers, from the cards behind each deck's bracket on Archidekt
const gameChangers = () => new Set([...deckMeta.values()].flatMap(m => (m.game_changers || "").split(" | ").filter(Boolean)));
let ixSort = { k: "qty", dir: -1 };   // most copies first
const STORE_KEYS = { tcg: "price_tcgplayer", ck: "price_cardkingdom", cm: "price_cardmarket" };
const currentDeckIds = () => realDecks().filter(d => !isStale(d)).map(d => d.id);
const checkedDecks = () => currentDeckIds().filter(id => !ix.skip.has(id));
// The Type filter always lists every card type, then the supertypes (older cards say "Tribal",
// now "Kindred"; both count as Kindred). "Token" joins when proxies are shown alone, since
// proxied tokens from "Tokens & Extras" only appear then.
const MAIN_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land", "Kindred", "Legendary", "Basic", "Snow"];
const typeWords = line => {
  const words = (line || "").split(" — ")[0].split(" ").filter(Boolean).map(w => w === "Tribal" ? "Kindred" : w);
  return [...new Set(words)];
};
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

// Card bling (0-100), from your real copies of a card:
//   flex      60  dollars per copy above the card's cheapest printing, on a log curve against the
//                 biggest such premium in your collection (that card gets the full 60)
//   upgraded  30  share of copies worth more than the cheapest printing (pricier printing or foil)
//   foil      10  share of copies that are foil
// added straight up (no extra curve, so cheap cards stay low). Dollars, not ratios, drive flex here: $48 over a
// $5 card is far more bling than 27 cents over a 2-cent basic land.
function cardBling(b, foils, real, top) {
  const premium = Math.max(0, b.value - b.cheapest) / real;
  const flex = top > 0 ? 60 * Math.log1p(premium) / Math.log1p(top) : 0;
  const raw = Math.min(60, flex) + 30 * b.upgrades / real + 10 * foils / real;
  return raw;
}
// The biggest per-copy premium over the cheapest printing among all real cards, per store
const premiumCache = new Map();
function maxPremium(store) {
  if (premiumCache.has(store)) return premiumCache.get(store);
  let top = 0;
  for (const d of realDecks()) if (!isStale(d)) for (const r of d.rows) {
    if (isProxy(r)) continue;
    const v = priceIn(r, STORE_KEYS[store]) ?? 0, min = +r[`${store}_min`] || 0;
    if (min) top = Math.max(top, v - min);
  }
  premiumCache.set(store, top);
  return top;
}

function indexCards() {
  const byName = new Map();
  for (const d of realDecks()) {
    if (isStale(d) || ix.skip.has(d.id)) continue;
    const cmds = commandersOf.get(d.id) || new Set();
    // proxied tokens (from "Tokens & Extras") join the list only when showing proxies alone
    const rows = ix.proxies === "only" ? d.rows.concat(tokenProxies.get(d.id) || []) : d.rows;
    for (const r of rows) {
      // the set and proxy filters limit which copies count
      const set = r.set_code.toUpperCase();
      if (setFilter.yes && !setFilter.yes.has(set)) continue;
      if (setFilter.no.has(set)) continue;
      if (ix.proxies === "only" && !isProxy(r)) continue;
      if (ix.proxies === "none" && isProxy(r)) continue;
      // tokens are kept apart from a real card of the same name (e.g. Ajani's Pridemate)
      const key = (r.token ? "token:" : "") + r.card_name;
      let c = byName.get(key);
      if (!c) {
        const info = (r.token ? r : cardInfo.get(r.card_name)) || {};
        const [types, subtypes = ""] = (info.type_line || "").split(" — ");
        const typesOf = typeWords(info.type_line);
        if (r.token && !typesOf.includes("Token")) typesOf.unshift("Token");
        byName.set(key, c = { key, token: !!r.token, name: r.card_name, type: info.type_line || "", types: typesOf, subtypes,
          mv: info.mana_value === "" || info.mana_value == null ? null : +info.mana_value,
          color: info.color_identity ?? null, qty: 0, perDeck: new Map(), commander: false, proxied: false,
          tcg: null, ck: null, cm: null, tot: { tcg: 0, ck: 0, cm: 0 }, mix: 0, id: "",
          bl: { tcg: { value: 0, cheapest: 0, upgrades: 0 }, ck: { value: 0, cheapest: 0, upgrades: 0 }, cm: { value: 0, cheapest: 0, upgrades: 0 } }, realN: 0, foilN: 0, printings: new Set(), sets: new Map() });
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
      // bling counts real copies only: their price vs the card's cheapest printing
      if (!isProxy(r)) {
        c.realN += r.qty; c.rowsHaveMin ||= r.tcg_min != null && r.tcg_min !== "" || r.ck_min != null && r.ck_min !== ""; if ((r.finish || "Normal") !== "Normal") c.foilN += r.qty;
        for (const s of Object.keys(STORE_KEYS)) {
          const v = priceIn(r, STORE_KEYS[s]) ?? 0, min = +r[`${s}_min`] || 0, b = c.bl[s];
          b.value += v * r.qty; b.cheapest += (min ? Math.min(min, v) : v) * r.qty;
          if (min && v > min + 0.005) b.upgrades += r.qty;
        }
      }
      const e = c.perDeck.get(d.id) || { qty: 0, cmd: false, proxy: false };
      e.qty += r.qty; e.cmd ||= cmds.has(r.card_name); e.proxy ||= isProxy(r);
      c.perDeck.set(d.id, e);
      c.commander ||= e.cmd; c.proxied ||= e.proxy;
    }
  }
  return [...byName.values()].map(c => {
    const [bestStore, best] = [...ix.stores].map(s => [s, c[s]]).filter(([, p]) => p != null).sort((a, b) => a[1] - b[1])[0] || [null, null];
    // card bling uses the first compared store (TCGplayer unless it's unticked)
    const bs = ["tcg", "ck", "cm"].find(s => ix.stores.has(s)) || "tcg";
    const bling = c.realN && c.rowsHaveMin ? cardBling(c.bl[bs], c.foilN, c.realN, maxPremium(bs)) : null;
    return { ...c, decks: c.perDeck.size, bestStore, best, price: best, bling, setList: [...c.sets.keys()].sort().join(", ") };
  });
}

// Typed set terms -> set codes. An exact code matches itself; otherwise it matches every
// set you play that starts with it ("MH" -> MH1, MH2, MH3). "-LTR" excludes.
let setFilter = { yes: null, no: new Set() };
function resolveSets() {
  const all = setCounts().map(([set]) => set), unknown = [];
  // Token sets are the main set's code with a T in front (TFRA = FRA's tokens), so a typed code
  // also covers its token set. Only proxied tokens' sets count as token sets, so "HB" never
  // reaches Theros Beyond Death (THB).
  const tokenSets = new Set([...tokenProxies.values()].flat().map(r => r.set_code.toUpperCase()).filter(x => x.startsWith("T")));
  const base = x => tokenSets.has(x) ? x.slice(1) : x;
  const expand = (terms, label) => {
    const out = new Set();
    for (const t of terms) {
      const exact = all.filter(x => x === t || (tokenSets.has(x) && base(x) === t));
      const hits = exact.length ? exact : all.filter(x => x.startsWith(t) || (tokenSets.has(x) && base(x).startsWith(t)));
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
  // deck cards plus proxied tokens, so token sets (e.g. TFRA) can be typed in the Sets box too
  for (const d of realDecks()) if (!isStale(d)) for (const r of d.rows.concat(tokenProxies.get(d.id) || [])) {
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
  if (ix.mvmin != null && !(c.mv >= ix.mvmin)) return false;
  if (ix.mvmax != null && !(c.mv != null && c.mv <= ix.mvmax)) return false;
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
  const typeList = ix.proxies === "only" || ix.types.has("Token") ? [...MAIN_TYPES, "Token"] : MAIN_TYPES;
  triDropdown($("ixTypeDD"), typeList.map(t => [t, t]), ix.types);
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

  // Three views of the same list; only the one showing is drawn.
  //   table: every detail in columns   grid (Images): card pictures   full: picture plus every detail
  const setsHtml = c => [...c.sets].sort((a, b) => a[0].localeCompare(b[0])).map(([set, n]) =>
    `<span class="set-code" title="${n} ${n === 1 ? "copy" : "copies"} from ${esc(set)}">${esc(set)}${c.sets.size > 1 && n > 1 ? `<span class="muted"> ×${n}</span>` : ""}</span>`).join(" ");
  const chipsHtml = c => `<div class="where">${deckChips(c).map(({ name, e }) => `<span class="dchip ${e.cmd ? "cmd" : ""} ${e.proxy ? "proxy" : ""}">${esc(name)}${e.qty > 1 ? " ×" + e.qty : ""}</span>`).join("")}</div>`;
  const cheapestTip = (c, s) => c.printings.size > 1 && c[s] != null ? `title="Cheapest of the ${c.printings.size} printings you play"` : "";
  const priceCell = (c, s) => `<td class="num ${c.bestStore === s ? "best" : ""} ${ix.stores.has(s) ? "" : "muted"}" ${cheapestTip(c, s)}>${money(c[s])}</td>`;
  const copyText = n => `${n} ${n === 1 ? "copy" : "copies"}`;
  const layout = ix.layout;
  $("indexTable").tBodies[0].innerHTML = layout !== "table" ? "" : list.map((c, i) => `
    <tr>
      <td class="rownum">${i + 1}</td>
      <td><span class="card-name">${esc(c.name)}</span>${c.commander ? ` <span class="badge">Commander</span>` : ""}${c.token ? ` <span class="badge">Token</span>` : ""}</td>
      <td class="type-col">${esc(c.type || "–")}</td>
      <td class="num">${c.mv ?? "–"}</td>
      <td>${pipsHtml(c.color)}</td>
      <td class="num">${c.qty}</td>
      <td class="num">${c.bling == null ? `<span class="muted">–</span>` : Math.round(c.bling)}</td>
      ${priceCell(c, "tcg")}${priceCell(c, "ck")}${priceCell(c, "cm")}
      <td class="sets-col"><span class="m-only">${copyText(c.qty)}</span> ${setsHtml(c)}</td>
      <td>${chipsHtml(c)}</td>
      <td class="m-best"><b>${money(c.best)}</b><span>${ixSort.k === "bling" && c.bling != null ? `Bling ${Math.round(c.bling)}` : c.bestStore ? STORE_NAMES[c.bestStore] : "No price"}</span></td>
    </tr>`).join("")
    || `<tr><td colspan="12" class="muted empty-row">No cards match.</td></tr>`;
  $("ixGrid").innerHTML = layout !== "grid" ? "" : list.map(c => `
    <figure class="px-tile" title="${esc(c.name)}\n${esc(deckChips(c).map(({ name, e }) => name + (e.qty > 1 ? " ×" + e.qty : "")).join("\n"))}">
      <div class="px-img"><div class="ph">${esc(c.name)}</div>${cardImg(c)}${c.qty > 1 ? `<span class="px-qty">×${c.qty}</span>` : ""}</div>
      <figcaption><b class="num">${money(c.best)}</b><span class="muted">${c.bestStore ? STORE_NAMES[c.bestStore] : "No price"}</span></figcaption>
    </figure>`).join("") || `<div class="muted">No cards match.</div>`;
  $("ixFull").innerHTML = layout !== "full" ? "" : list.map(c => `
    <article class="fcard">
      <div class="px-img"><div class="ph">${esc(c.name)}</div>${cardImg(c)}</div>
      <div class="fbody">
        <h4><span class="card-name">${esc(c.name)}</span>${c.commander ? ` <span class="badge">Commander</span>` : ""}${c.token ? ` <span class="badge">Token</span>` : ""}</h4>
        <div class="ftype">${esc(c.type || "–")}</div>
        <div class="fmeta">${pipsHtml(c.color)}<span>MV ${c.mv ?? "–"}</span><span>${copyText(c.qty)}</span>${c.bling != null ? `<span>Bling ${Math.round(c.bling)}</span>` : ""}</div>
        <div class="fprices">${Object.keys(STORE_NAMES).map(s => `<div class="${c.bestStore === s ? "best" : ""} ${ix.stores.has(s) ? "" : "muted"}" ${cheapestTip(c, s)}><span>${STORE_NAMES[s]}</span><b class="num">${money(c[s])}</b></div>`).join("")}</div>
        <div class="fsets">${setsHtml(c)}</div>
        ${chipsHtml(c)}
      </div>
    </article>`).join("") || `<div class="muted">No cards match.</div>`;
  $("ixGrid").hidden = layout !== "grid"; $("ixFull").hidden = layout !== "full"; $("ixTableBox").hidden = layout !== "table";
  $("ixLayout").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.l === ix.layout)));
  markSort($("indexTable"), ixSort);
  const ixs = sortStr(ixSort); $("ixSortSel").value = [...$("ixSortSel").options].some(o => o.value && o.value === ixs) ? ixs : "";
  renderOverlap(list);
  $("ixClear").disabled = !filtersActive();
  syncUrl();
}

// Deck overlap grid, shared by the Cards and Tokens tabs. sets: [{ id, name, items: Set }] for
// each checked deck; each cell counts the items a pair of decks has in common.
function drawOverlap(grid, sets, noun) {
  const ds = sortBy(sets, { k: "name", dir: 1 });
  const shared = (a, b) => { let n = 0; for (const c of a.items) if (b.items.has(c)) n++; return n; };
  let max = 1; const m = ds.map(a => ds.map(b => { const n = a === b ? null : shared(a, b); if (n > max) max = n; return n; }));
  const shade = n => `color-mix(in oklab, var(--series-1) ${Math.round(8 + n / max * 62)}%, var(--surface))`;
  // Each pair appears once, below the diagonal, as a staircase: row i holds deck i's counts
  // with the decks before it, then deck i's own name (in the diagonal cell, running right)
  // heads the column of counts directly beneath it.
  const n = ds.length, cols = n - 1;
  const cell = (a, b, v) => v === 0 ? `<td><div class="zero">0</div></td>` :
    `<td><button data-a="${esc(a.id)}" data-b="${esc(b.id)}" style="background:${shade(v)};${v / max > 0.6 ? "color:#fff" : ""}" title="${esc(a.name)} and ${esc(b.name)} share ${v} ${v === 1 ? noun.replace(/s$/, "") : noun}">${v}</button></td>`;
  grid.innerHTML = n < 2 ? "" : `<tbody>` + ds.map((a, i) => `<tr>
      <th class="rowh" title="${esc(a.name)}">${i ? esc(a.name) : ""}</th>
      ${ds.slice(0, i).map((b, j) => cell(a, b, m[i][j])).join("")}
      ${i < cols ? `<th class="colh" title="${esc(a.name)}"><span>${esc(a.name)}</span></th>` : ""}
    </tr>`).join("") + `</tbody>`;
}
// Hover lights up the cell's row and column; clicking a number calls onPick(deckA, deckB).
function wireOverlap(grid, onPick) {
  const clear = () => grid.querySelectorAll(".colhl, .rowhl").forEach(c => c.classList.remove("colhl", "rowhl"));
  grid.addEventListener("mouseover", e => {
    const cell = e.target.closest("td, th"), col = cell ? cell.cellIndex : -1;
    clear();
    if (col > 0) grid.querySelectorAll("tr").forEach(tr => tr.cells[col]?.classList.add("colhl"));
    if (cell?.tagName === "TD") cell.parentElement.querySelector("th.rowh")?.classList.add("rowhl");
  });
  grid.addEventListener("mouseleave", clear);
  grid.addEventListener("click", e => { const b = e.target.closest("button[data-a]"); if (b) onPick(b.dataset.a, b.dataset.b); });
}
const scrollToResults = el => el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

// Cards: how many of the cards shown (basic lands aside) each pair of checked decks shares,
// so it follows every filter above.
function renderOverlap(list) {
  const checked = new Set(checkedDecks()), byDeck = new Map([...checked].map(id => [id, new Set()]));
  for (const c of list) if (!isBasic(c.name)) for (const id of c.perDeck.keys()) byDeck.get(id)?.add(c.key);
  drawOverlap($("overlapGrid"), realDecks().filter(d => checked.has(d.id)).map(d => ({ id: d.id, name: d.name, items: byDeck.get(d.id) })), "cards");
}
wireOverlap($("overlapGrid"), (a, b) => {
  ix.skip = new Set(currentDeckIds().filter(id => id !== a && id !== b)); ix.match = "every";
  renderIndex(); scrollToResults($("indexView").querySelector(".results-bar"));
});

$("ixSearch").addEventListener("input", e => { ix.search = e.target.value.trim().toLowerCase(); renderIndex(); });
$("ixSubtype").addEventListener("input", e => { ix.subtype = e.target.value.trim().toLowerCase(); renderIndex(); });
// either/or switches: Copies (proxies), Commanders, Game Changers
const SEGS = { ixProxies: "proxies", ixCommanders: "commanders", ixGC: "gc" };
for (const [id, key] of Object.entries(SEGS))
  $(id).addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { ix[key] = b.dataset.v; renderIndex(); } });
const syncSegs = () => { for (const [id, key] of Object.entries(SEGS)) $(id).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === ix[key]))); };
const readPrice = el => { const v = el.value.trim(); return v === "" || isNaN(+v) ? null : +v; };
for (const [id, key] of [["ixPmin", "pmin"], ["ixPmax", "pmax"], ["ixMvmin", "mvmin"], ["ixMvmax", "mvmax"]])
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
  ix.pmin != null || ix.pmax != null || ix.mvmin != null || ix.mvmax != null ||
  ix.colors.size || ix.types.size || ix.skip.size);
$("ixClear").addEventListener("click", () => {
  Object.assign(ix, { search: "", subtype: "", sets: [], commanders: "", gc: "", pmin: null, pmax: null, mvmin: null, mvmax: null, proxies: "", match: "any" });
  ix.colors.clear(); ix.types.clear(); ix.skip.clear();
  $("ixSearch").value = $("ixSubtype").value = $("ixSets").value = $("ixPmin").value = $("ixPmax").value = $("ixMvmin").value = $("ixMvmax").value = ""; renderIndex();
});
// close open dropdowns on outside clicks; composedPath() still knows where the click
// started even if that element was just redrawn
document.addEventListener("click", e => { const path = e.composedPath(); document.querySelectorAll("details.dd[open]").forEach(d => { if (!path.includes(d)) d.open = false; }); });
