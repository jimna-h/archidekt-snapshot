// Proxies tab.

// ---------- proxies tab ----------
const px = { skip: new Set(), noLands: false, stores: new Set(["tcg", "ck"]), layout: "table" };   // skip: decks left out
let pxSort = { k: "best", dir: 1 };   // cheapest first
function renderProxies() {
  const list = new Map();
  for (const d of realDecks()) {
    if (isStale(d) || px.skip.has(d.id)) continue;
    for (const r of d.rows) if (isProxy(r) && !(px.noLands && isLand(r.card_name))) {
      const k = printKey(r);
      const e = list.get(k) || { name: r.card_name, set: r.set_code, finish: r.finish, id: r.scryfall_id, qty: 0, decks: new Map(),
        tcg: num(r.price_tcgplayer), ck: num(r.price_cardkingdom), cm: num(r.price_cardmarket) };
      e.qty += r.qty; e.decks.set(d.id, (e.decks.get(d.id) || 0) + r.qty); list.set(k, e);
    }
  }
  const rows = [...list.values()].map(e => {
    const options = [...px.stores].map(s => [s, e[s]]).filter(([, p]) => p != null);
    const [bestStore, bestPrice] = options.sort((a, b) => a[1] - b[1])[0] || [null, null];
    return { ...e, bestStore, best: bestPrice, cost: bestPrice == null ? null : bestPrice * e.qty };   // best is per copy, cost covers every copy
  });
  sortBy(rows, pxSort);
  const copies = rows.reduce((s, r) => s + r.qty, 0), total = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const storeTotal = s => rows.reduce((t, r) => t + (r[s] ?? 0) * r.qty, 0);
  const deckCount = new Set(rows.flatMap(r => [...r.decks.keys()])).size;
  $("pxSummary").innerHTML = `
    <div><div class="lbl" title="Buying each card where it's cheapest">Cost to replace every proxy</div><div class="big num" style="text-align:left">${money(total)}</div></div>
    <div class="alt"><div>${copies} ${copies === 1 ? "copy" : "copies"} · ${deckCount} deck${deckCount === 1 ? "" : "s"}</div>
      ${Object.keys(STORE_NAMES).map(s => `<div class="${px.stores.has(s) ? "" : "off"}">${STORE_NAMES[s]} only: ${money(storeTotal(s))}</div>`).join("")}</div>`;
  let running = 0;
  $("proxyTable").tBodies[0].innerHTML = rows.map(r => {
    running += r.cost ?? 0;
    const cell = s => `<td class="num ${r.bestStore === s ? "best" : ""} ${px.stores.has(s) ? "" : "muted"}">${money(r[s])}</td>`;
    return `<tr>
      <td><span class="card-name">${esc(r.name)}</span><span class="printing">${esc(r.set.toUpperCase())}${r.finish !== "Normal" ? ", " + esc(r.finish.toLowerCase()) : ""}</span></td>
      <td><div class="where">${sortBy([...r.decks].map(([id, q]) => ({ name: deckName(id), q })), { k: "name", dir: 1 }).map(x => `<span class="dchip">${esc(x.name)}${x.q > 1 ? " ×" + x.q : ""}</span>`).join("")}</div></td>
      <td class="num ${r.qty === 1 ? "one" : ""}">${r.qty}</td>${cell("tcg")}${cell("ck")}${cell("cm")}
      <td class="num">${money(r.best)}</td>
      <td class="num muted">${money(running)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="muted">No cards match.</td></tr>`;
  $("pxGrid").innerHTML = rows.map(r => {
    const decksTip = sortBy([...r.decks].map(([id, q]) => ({ name: deckName(id), q })), { k: "name", dir: 1 })
      .map(x => x.name + (x.q > 1 ? " ×" + x.q : "")).join("\n");
    const each = r.bestStore ? r[r.bestStore] : null;
    return `<figure class="px-tile" title="${esc(r.name)} (${esc(r.set.toUpperCase())})\n${esc(decksTip)}">
      <div class="px-img"><div class="ph">${esc(r.name)}</div>${cardImg(r)}${r.qty > 1 ? `<span class="px-qty">×${r.qty}</span>` : ""}</div>
      <figcaption><b class="num">${money(each)}</b><span class="muted">${r.bestStore ? STORE_NAMES[r.bestStore] : "No price"}</span></figcaption>
    </figure>`;
  }).join("") || `<div class="muted">No cards match.</div>`;
  const grid = px.layout === "grid";
  $("pxGrid").hidden = !grid; $("pxTableBox").hidden = grid;
  $("pxGridSort").value = ["best", "-best", "name"].includes(sortStr(pxSort)) ? sortStr(pxSort) : "";
  $("pxLayout").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.l === px.layout)));
  markSort($("proxyTable"), pxSort);
  fillDeckDropdown($("pxDeckDD"), px.skip);
  $("pxLands").setAttribute("aria-pressed", String(px.noLands));
  syncUrl();
}
// Card image for the exact printing, straight from Scryfall's image server by its id
function cardImg(r) {
  const id = (r.id || "").toLowerCase();
  return /^[0-9a-f-]{36}$/.test(id)
    ? `<img src="https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg" alt="${esc(r.name)}" loading="lazy" decoding="async" onerror="this.remove()">`
    : "";
}
$("pxLayout").addEventListener("click", e => {
  const b = e.target.closest("button[data-l]"); if (!b) return;
  px.layout = b.dataset.l; renderProxies();
});
$("pxGridSort").addEventListener("change", e => { readSort(e.target.value, pxSort); renderProxies(); });
document.querySelectorAll(".px-store").forEach(c => c.addEventListener("change", () => {
  c.checked ? px.stores.add(c.value) : px.stores.delete(c.value);
  if (!px.stores.size) { px.stores.add(c.value); c.checked = true; }
  renderProxies();
}));
const currentDeckIds = () => realDecks().filter(d => !isStale(d)).map(d => d.id);
$("pxDeckDD").addEventListener("change", e => {
  const v = e.target.value;
  if (v === "*") px.skip = e.target.checked ? new Set() : new Set(currentDeckIds());
  else e.target.checked ? px.skip.delete(v) : px.skip.add(v);
  renderProxies();
});
$("pxLands").addEventListener("click", () => { px.noLands = !px.noLands; renderProxies(); });
// Front face only, so a spell // land card (e.g. a modal double-faced card) still counts as a spell
const isLand = name => /\bLand\b/.test((cardInfo.get(name)?.type_line || "").split(" // ")[0].split(" — ")[0]);

// Every deck starts checked; unchecking one leaves it out (skip holds the unchecked ones).
function fillDeckDropdown(dd, skip) {
  const items = sortBy(realDecks().filter(d => !isStale(d)).map(d => ({ id: d.id, name: d.name })), { k: "name", dir: 1 });
  const left = items.filter(x => !skip.has(x.id)).length;
  dd.querySelector(".panel").innerHTML =
    `<label class="all"><input type="checkbox" value="*" ${left === items.length ? "checked" : ""}> All decks</label>` +
    items.map(x => `<label><input type="checkbox" value="${esc(x.id)}" ${skip.has(x.id) ? "" : "checked"}> ${esc(x.name)}</label>`).join("");
  const all = dd.querySelector('input[value="*"]'); all.indeterminate = left > 0 && left < items.length;
  const badge = dd.querySelector(".count-badge"); badge.textContent = `${left}/${items.length}`;
}
