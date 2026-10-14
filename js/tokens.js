// Tokens tab: every token (and emblem) the current decks can make, which cards make it and
// in which decks. Data: data/tokens.csv (from Scryfall's related cards, refreshed daily).

// ---------- tokens ----------
// Filters work like the Cards tab: colors/types cycle off -> in -> out; skip = decks left out.
const tk = { search: "", colors: new Map(), types: new Map(), skip: new Set(), match: "any", layout: "full" };
// Placeholders that aren't real tokens (Scryfall's generic "Copy" card); the daily job skips them too
const IGNORED_TOKENS = new Set(["Copy"]);
const tkCheckedDecks = () => currentDeckIds().filter(id => !tk.skip.has(id));
let tkSort = { k: "decks", dir: -1 };
const TOKEN_TYPES = ["Creature", "Artifact", "Enchantment", "Land", "Emblem", "Dungeon"];

// Rows either name a card that makes the token, or a deck that lists the token in its
// "Tokens & Extras" category (which also picks the token's picture; see track_prices.py).
function tokenList() {
  const byCard = new Map(), byDeck = new Map();
  for (const t of tokenRows) {
    if (IGNORED_TOKENS.has(t.token_name)) continue;   // older data may still list these
    const [map, key] = t.card_name ? [byCard, t.card_name] : [byDeck, t.deck_id];
    (map.get(key) || map.set(key, []).get(key)).push(t);
  }
  const tokens = new Map();
  const entry = t => {
    let e = tokens.get(t.token_id);
    if (!e) tokens.set(t.token_id, e = { ...t, name: t.token_name, type: t.type_line, id: t.image_id,
      types: t.type_line.split(" — ")[0].split(" "), color: t.colors, makers: new Map(), listedIn: new Set(), perDeck: new Map() });
    return e;
  };
  for (const d of realDecks()) {
    if (isStale(d) || tk.skip.has(d.id)) continue;
    for (const name of new Set(d.rows.map(r => r.card_name))) for (const t of byCard.get(name) || []) {
      const e = entry(t);
      (e.makers.get(name) || e.makers.set(name, new Set()).get(name)).add(d.id);
      e.perDeck.set(d.id, { qty: 1, cmd: false, proxy: false });
    }
    for (const t of byDeck.get(d.id) || []) {
      const e = entry(t);
      e.listedIn.add(d.id);
      e.perDeck.set(d.id, { qty: 1, cmd: false, proxy: false });
    }
  }
  return [...tokens.values()].map(e => ({ ...e, decks: e.perDeck.size, makerCount: e.makers.size }));
}

function tkMatches(t) {
  if (tk.search) {
    const q = tk.search, hay = [t.name, t.type, t.text, ...t.makers.keys()].join(" ").toLowerCase();
    const neg = /^[-!]/.test(q), term = neg ? q.slice(1) : q;
    if (term && hay.includes(term) === neg) return false;
  }
  const id = t.color || "", hasColor = k => k === "C" ? id === "" : id.includes(k);
  const cin = keysWith(tk.colors, "in"), cout = keysWith(tk.colors, "out");
  if (cin.length && !cin.some(hasColor)) return false;
  if (cout.some(hasColor)) return false;
  const tin = keysWith(tk.types, "in"), tout = keysWith(tk.types, "out");
  if (tin.length && !t.types.some(x => tin.includes(x))) return false;
  if (tout.some(x => t.types.includes(x))) return false;
  const n = tkCheckedDecks().length;
  if (tk.match === "every" && n > 1 && t.perDeck.size < n) return false;
  return true;
}

function fillTokenDecks() {
  const items = sortBy(realDecks().filter(d => !isStale(d)).map(d => ({ id: d.id, name: d.name })), { k: "name", dir: 1 });
  const left = items.filter(x => !tk.skip.has(x.id)).length;
  $("tkDeckDD").querySelector(".panel").innerHTML =
    `<select id="tkMatch" aria-label="Which checked decks" ${left > 1 ? "" : "disabled"}>
       <option value="any" ${tk.match === "any" ? "selected" : ""}>Tokens from any checked deck</option>
       <option value="every" ${tk.match === "every" ? "selected" : ""}>Only tokens every checked deck makes</option>
     </select>` +
    `<label class="all"><input type="checkbox" value="*" ${left === items.length ? "checked" : ""}> All decks</label>` +
    items.map(x => `<label><input type="checkbox" value="${esc(x.id)}" ${tk.skip.has(x.id) ? "" : "checked"}> ${esc(x.name)}</label>`).join("");
  $("tkDeckDD").querySelector('input[value="*"]').indeterminate = left > 0 && left < items.length;
  $("tkDeckDD").querySelector(".count-badge").textContent = `${left}/${items.length}`;
}

const ptText = t => t.power !== "" || t.toughness !== "" ? `${t.power}/${t.toughness}` : "";
const tokenTitle = t => `<span class="card-name">${esc(t.name)}</span>${ptText(t) ? ` <span class="pt">${esc(ptText(t))}</span>` : ""}`;
// "{T}" style symbols stay as text; " / " separates lines
const tokenText = t => esc(t.text || "").replace(/ \/ /g, "<br>");
const makersHtml = t => t.makers.size
  ? [...t.makers.keys()].sort((a, b) => a.localeCompare(b)).map(n => `<span class="maker">${esc(n)}</span>`).join(", ")
  : `<span class="muted">Listed with the deck's tokens</span>`;
const tokenChips = t => `<div class="where">${deckChips(t).map(({ name }) => `<span class="dchip">${esc(name)}</span>`).join("")}</div>`;

function renderTokens() {
  const typesPresent = new Set(tokenRows.flatMap(t => t.type_line.split(" — ")[0].split(" ")));
  triDropdown($("tkTypeDD"), TOKEN_TYPES.filter(t => typesPresent.has(t)).map(t => [t, t]), tk.types);
  fillTokenDecks();
  $("tkColors").innerHTML = "WUBRGC".split("").map(k => {
    const st = tk.colors.get(k) || "";
    return `<button data-c="${k}" data-state="${st}" aria-pressed="${st === "in"}" title="${COLOR_NAMES[k]}"><span class="pip ${k}">${k}</span></button>`;
  }).join("");

  const all = tokenList(), list = sortBy(all.filter(tkMatches), tkSort);
  const makers = new Set(list.flatMap(t => [...t.makers.keys()])), decksN = new Set(list.flatMap(t => [...t.perDeck.keys()])).size;
  $("tkSummary").innerHTML = !tokenRows.length
    ? `<div class="alt">Tokens arrive with the next daily snapshot.</div>`
    : `<div><div class="lbl">Tokens</div><div class="big num" style="text-align:left">${list.length}</div></div>
       <div class="alt"><div>made by ${makers.size} card${makers.size === 1 ? "" : "s"} · in ${decksN} deck${decksN === 1 ? "" : "s"}</div>
         ${list.length < all.length ? `<div>${all.length - list.length} more hidden by filters</div>` : ""}</div>`;

  const layout = tk.layout, empty = `<div class="muted">No tokens match.</div>`;
  const byColor = tkSort.k === "color", gridHead = (id, n) => `<div class="group-head">${colorHeadHtml(id, n)}</div>`;
  $("tokenTable").tBodies[0].innerHTML = layout !== "table" ? "" : withColorHeads(list, byColor, (t, i) => `
    <tr>
      <td class="rownum">${i + 1}</td>
      <td>${tokenTitle(t)}</td>
      <td class="type-col">${esc(t.type)}</td>
      <td>${pipsHtml(t.color)}</td>
      <td class="tk-text">${tokenText(t)}</td>
      <td class="tk-makers">${makersHtml(t)}</td>
      <td>${tokenChips(t)}</td>
    </tr>`, (id, n) => `<tr class="group-row"><td colspan="7">${colorHeadHtml(id, n)}</td></tr>`) || `<tr><td colspan="7" class="muted empty-row">No tokens match.</td></tr>`;
  $("tkGrid").innerHTML = layout !== "grid" ? "" : withColorHeads(list, byColor, t => `
    <figure class="px-tile" title="${esc(t.name)}\nMade by ${esc([...t.makers.keys()].join(", "))}">
      <div class="px-img"><div class="ph">${esc(t.name)}</div>${cardImg(t)}</div>
      <figcaption><b>${esc(t.name)}${ptText(t) ? " " + esc(ptText(t)) : ""}</b><span class="muted">${t.decks} deck${t.decks === 1 ? "" : "s"}</span></figcaption>
    </figure>`, gridHead) || empty;
  $("tkFull").innerHTML = layout !== "full" ? "" : withColorHeads(list, byColor, t => `
    <article class="fcard">
      <div class="px-img"><div class="ph">${esc(t.name)}</div>${cardImg(t)}</div>
      <div class="fbody">
        <h4>${tokenTitle(t)}</h4>
        <div class="ftype">${esc(t.type)}</div>
        ${t.text ? `<div class="tk-text">${tokenText(t)}</div>` : ""}
        <div class="tk-made">${t.makers.size ? `<span class="flabel">Made by</span> ` : ""}${makersHtml(t)}</div>
        ${tokenChips(t)}
      </div>
    </article>`, gridHead) || empty;
  $("tkTableBox").hidden = layout !== "table"; $("tkGrid").hidden = layout !== "grid"; $("tkFull").hidden = layout !== "full";
  $("tkLayout").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.l === layout)));
  $("tkSortSel").value = sortStr(tkSort);
  if (!$("tkSortSel").value) $("tkSortSel").value = "-decks";
  markSort($("tokenTable"), tkSort);
  $("tkClear").disabled = !(tk.search || tk.colors.size || tk.types.size || tk.skip.size || tk.match !== "any");
  // Deck overlap: how many of the tokens shown each pair of checked decks both make
  const checked = new Set(tkCheckedDecks()), byDeck = new Map([...checked].map(id => [id, new Set()]));
  for (const t of list) for (const id of t.perDeck.keys()) byDeck.get(id)?.add(t.token_id);
  drawOverlap($("tkOverlapGrid"), realDecks().filter(d => checked.has(d.id)).map(d => ({ id: d.id, name: d.name, items: byDeck.get(d.id) })), "tokens");
  syncUrl();
}

$("tkSearch").addEventListener("input", e => { tk.search = e.target.value.trim().toLowerCase(); renderTokens(); });
$("tkColors").addEventListener("click", e => { const b = e.target.closest("button[data-c]"); if (b) { cycle(tk.colors, b.dataset.c); renderTokens(); } });
$("tkTypeDD").addEventListener("click", e => {
  const b = e.target.closest("button.tri"); if (!b) return;
  cycle(tk.types, b.dataset.v); renderTokens();
  $("tkTypeDD").querySelector(`button.tri[data-v="${CSS.escape(b.dataset.v)}"]`)?.focus();
});
$("tkDeckDD").addEventListener("change", e => {
  const v = e.target.value;
  if (e.target.id === "tkMatch") { tk.match = v; renderTokens(); return; }
  if (v === "*") tk.skip = e.target.checked ? new Set() : new Set(currentDeckIds());
  else e.target.checked ? tk.skip.delete(v) : tk.skip.add(v);
  renderTokens();
});
$("tkLayout").addEventListener("click", e => { const b = e.target.closest("button[data-l]"); if (b) { tk.layout = b.dataset.l; renderTokens(); } });
$("tkSortSel").addEventListener("change", e => { readSort(e.target.value, tkSort); renderTokens(); });
$("tkClear").addEventListener("click", () => {
  tk.search = ""; tk.match = "any"; tk.colors.clear(); tk.types.clear(); tk.skip.clear(); $("tkSearch").value = ""; renderTokens();
});
wireOverlap($("tkOverlapGrid"), (a, b) => {
  tk.skip = new Set(currentDeckIds().filter(id => id !== a && id !== b)); tk.match = "every";
  renderTokens(); scrollToResults($("tokensView").querySelector(".results-bar"));
});
