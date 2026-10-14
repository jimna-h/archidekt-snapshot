// Decks tab: value chart, biggest movers, swaps, paper vs proxied, curve, and the card list.

// ---------- chart ----------
const SERIES = [
  { k: "total", label: "Total", color: "var(--series-1)" },
  { k: "paper", label: "Paper", color: "var(--series-paper)" },
  { k: "proxy", label: "Proxies", color: "var(--series-proxy)", dash: true },
];
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function drawChart(pts, changes = []) {
  const wrap = $("chart"), svg = wrap.querySelector("svg"), tip = wrap.querySelector(".tip");
  const last = pts[pts.length - 1];
  $("legend").innerHTML = SERIES.map(sr => `<span class="item"><span class="key ${sr.dash ? "dash" : ""}" style="border-color:${sr.color}"></span>${sr.label} <b>${money(last[sr.k])}</b></span>`).join("");

  const W = svg.clientWidth || 800, H = 280, m = { t: 12, r: 68, b: 28, l: 56 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const vals = pts.flatMap(p => SERIES.map(sr => p[sr.k]));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || Math.max(hi * 0.1, 1);
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const t0 = +new Date(pts[0].date), t1 = +new Date(last.date);
  const x = p => m.l + (t1 === t0 ? iw / 2 : (+new Date(p.date) - t0) / (t1 - t0) * iw);
  const y = v => m.t + ih - (v - lo) / (hi - lo) * ih;

  let g = "";
  for (let v = lo; v <= hi + 1e-9; v += step) {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">$${v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : Math.round(v)}</text>`;
  }
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="var(--axis)"/>`;
  const n = Math.min(pts.length, Math.max(2, Math.floor(iw / 110)));
  const tickIdx = pts.length === 1 ? [0] : [...new Set(Array.from({ length: n }, (_, i) => Math.round(i * (pts.length - 1) / (n - 1))))];
  for (const i of tickIdx) {
    const p = pts[i], anchor = pts.length > 1 && i === 0 ? "start" : pts.length > 1 && i === pts.length - 1 ? "end" : "middle";
    g += `<text x="${x(p)}" y="${H - 8}" text-anchor="${anchor}">${shortDate(p.date)}</text>`;
  }
  for (const sr of [...SERIES].reverse()) {
    const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p[sr.k]).toFixed(1)}`).join("");
    g += `<path d="${path}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${sr.dash ? `stroke-dasharray="6 4"` : ""}/>`;
    g += `<circle cx="${x(last)}" cy="${y(last[sr.k])}" r="4" fill="${sr.color}" stroke="var(--surface)" stroke-width="2"/>`;
  }
  const swapAt = new Map(changes.map(c => [c.date, c]));
  for (const p of pts) if (swapAt.has(p.date) && p !== last)
    g += `<circle cx="${x(p)}" cy="${y(p.total)}" r="5" fill="var(--surface)" stroke="var(--series-1)" stroke-width="2"/>`;
  const labels = SERIES.map(sr => ({ sr, y: y(last[sr.k]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  const overflow = labels[labels.length - 1].y - (m.t + ih);
  if (overflow > 0) labels.forEach(l => l.y -= overflow);
  for (const l of labels) g += `<text x="${x(last) + 10}" y="${l.y + 4}" style="fill:var(--text-secondary)">${l.sr.label}</text>`;
  g += `<line class="xh" y1="${m.t}" y2="${m.t + ih}" stroke="var(--axis)" stroke-dasharray="3 3" visibility="hidden"/>`;
  for (const sr of SERIES) g += `<circle class="hd" data-k="${sr.k}" r="4.5" fill="${sr.color}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`;
  g += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  svg.innerHTML = g;

  const xh = svg.querySelector(".xh"), hds = [...svg.querySelectorAll(".hd")];
  svg.onpointermove = e => {
    const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) * (W / r.width);
    let best = pts[0]; for (const p of pts) if (Math.abs(x(p) - mx) < Math.abs(x(best) - mx)) best = p;
    xh.setAttribute("x1", x(best)); xh.setAttribute("x2", x(best)); xh.setAttribute("visibility", "visible");
    for (const h of hds) { h.setAttribute("cx", x(best)); h.setAttribute("cy", y(best[h.dataset.k])); h.setAttribute("visibility", "visible"); }
    const sw = swapAt.get(best.date), cnt = l => l.reduce((s, c) => s + c.qty, 0);
    tip.innerHTML = `<div class="muted">${fmtDate(best.date)}</div>` + SERIES.map(sr =>
      `<div class="row"><span class="key ${sr.dash ? "dash" : ""}" style="border-color:${sr.color}"></span>${sr.label}<b>${money(best[sr.k])}</b></div>`).join("")
      + (sw ? `<div class="muted">${cnt(sw.added)} in, ${cnt(sw.removed)} out</div>` : "");
    const px = x(best) * r.width / W, py = y(best.total) * r.height / H;
    tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth) + "px";
    tip.style.top = (py - tip.offsetHeight - 12 > 0 ? py - tip.offsetHeight - 12 : py + 16) + "px";
    tip.style.opacity = 1;
  };
  svg.onpointerleave = () => { tip.style.opacity = 0; xh.setAttribute("visibility", "hidden"); hds.forEach(h => h.setAttribute("visibility", "hidden")); };
}

// ---------- biggest movers ----------
function renderMovers(d) {
  $("moverWindow").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.w === moverWindow));
  const from = dayOnOrAfter(addDays(latestDate, -moverWindow));
  const box = $("movers");
  if (!from || from === latestDate) { box.innerHTML = `<div class="swaps-empty">Needs more than a day of history.</div>`; return; }
  const seen = new Set(), list = [];
  for (const r of d.rows) {
    const k = printKey(r); if (seen.has(k)) continue; seen.add(k);
    const now = priceIn(r), then = priceOn(from, k);
    if (now == null || then == null || Math.abs(now - then) < 0.005) continue;
    list.push({ name: r.card_name, set: r.set_code, finish: r.finish, change: now - then, pct: (now - then) / then * 100 });
  }
  const up = list.filter(c => c.change > 0).sort((a, b) => b.change - a.change).slice(0, 6);
  const down = list.filter(c => c.change < 0).sort((a, b) => a.change - b.change).slice(0, 6);
  const col = (title, l) => `<div><div class="mini-h">${title}</div>${l.length ? `<ol>${l.map(c => `
    <li><span class="nm"><span class="card-name">${esc(c.name)}</span><span class="printing">${esc(c.set.toUpperCase())}${c.finish !== "Normal" ? ", " + esc(c.finish.toLowerCase()) : ""}</span></span>
      <span class="num ${tone(c.change)}">${signed(c.change)}</span><span class="pct ${tone(c.change)}">${c.pct > 0 ? "+" : ""}${c.pct.toFixed(0)}%</span></li>`).join("")}</ol>`
    : `<div class="muted">None</div>`}</div>`;
  box.innerHTML = col(`Up since ${shortDate(from)}, per copy`, up) + col(`Down since ${shortDate(from)}, per copy`, down);
}
$("moverWindow").addEventListener("click", e => {
  const b = e.target.closest("button[data-w]"); if (!b) return;
  moverWindow = +b.dataset.w; renderMovers(decks.get(selected)); syncUrl();
});

// ---------- swaps ----------
function renderSwaps(changes) {
  const box = $("changes");
  if (!changes.length) {
    box.innerHTML = `<div class="swaps-empty">No swaps yet.</div>`;
    return;
  }
  const n = l => l.reduce((s, c) => s + c.qty, 0);
  const list = (l, sign) => l.length ? l.map(c => `
      <li><span class="sign ${sign === "+" ? "in" : "out"}">${sign}</span>${c.qty > 1 ? c.qty + "× " : ""}${esc(c.name)}
        <span class="num muted">${money(c.price)}</span></li>`).join("") : `<li class="muted">—</li>`;
  box.innerHTML = [...changes].reverse().map(c => `
    <div class="swap">
      <div class="swap-head">
        <b>${fmtDate(c.date)}</b>
        <span class="muted">${n(c.added)} in, ${n(c.removed)} out${c.since && daysBetween(c.since, c.date) > 1 ? ` since ${fmtDate(c.since)}` : ""}</span>
        <span class="num ${tone(c.net)}">${signed(c.net)}</span>
      </div>
      <div class="swap-cols">
        <ul><li class="col-h">In</li>${list(c.added, "+")}</ul>
        <ul><li class="col-h">Out</li>${list(c.removed, "−")}</ul>
      </div>
    </div>`).join("");
}

// ---------- paper vs proxied ----------
function renderTags(d, s) {
  const groups = new Map([["Paper", { name: "Paper", proxy: false, v: val(d, s.last, "paper") || 0, n: 0 }],
                           ["Proxied", { name: "Proxied", proxy: true, v: val(d, s.last, "proxy") || 0, n: 0 }]]);
  const rows = d.id === AVG ? decks.get(ALL).rows : d.rows;
  for (const r of rows) groups.get(isProxy(r) ? "Proxied" : "Paper").n += r.qty;
  if (d.id === AVG) { const k = realDecks().filter(x => !isStale(x)).length || 1; for (const g of groups.values()) g.n /= k; }
  const list = [...groups.values()].filter(g => g.n > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(...list.map(g => g.v), 0.01);
  if (tagFilter && !list.some(g => g.name === tagFilter)) tagFilter = null;
  $("tags").innerHTML = list.map(g => `
    <div class="tagrow ${g.name === tagFilter ? "active" : ""}" data-tag="${g.name}">
      <span class="chip">${g.name} <span class="muted">${fmtCount(g.n)} card${g.n === 1 ? "" : "s"}</span></span>
      <div class="bar"><div style="width:${(g.v / max * 100).toFixed(1)}%;background:${g.proxy ? "var(--series-proxy)" : "var(--series-paper)"}"></div></div>
      <span class="num">${money(g.v)}</span>
    </div>`).join("");
}

// ---------- mana curve & types ----------
const TYPE_LIST = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"];
function renderCurve(d) {
  const curve = new Array(8).fill(0), types = new Map(TYPE_LIST.map(t => [t, 0]));
  let known = 0;
  for (const r of d.rows) {
    const info = cardInfo.get(r.card_name); if (!info) continue;
    known += r.qty;
    const ts = (info.type_line || "").split(" — ")[0].split(" ");
    for (const t of ts) if (types.has(t)) types.set(t, types.get(t) + r.qty);
    if (!ts.includes("Land") && info.mana_value !== "") curve[Math.min(7, Math.floor(+info.mana_value))] += r.qty;
  }
  const cmax = Math.max(...curve, 1);
  $("curve").innerHTML = curve.map((n, i) => `
    <div class="col"><span class="v">${n || ""}</span><span class="b" style="height:${(n / cmax * 100).toFixed(1)}%"></span><span class="k">${i === 7 ? "7+" : i}</span></div>`).join("");
  const tl = [...types].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]), tmax = Math.max(...tl.map(t => t[1]), 1);
  $("types").innerHTML = tl.map(([t, n]) => `
    <div class="t"><span>${t}</span><div class="bar"><div style="width:${(n / tmax * 100).toFixed(1)}%"></div></div><span class="num">${n}</span></div>`).join("")
    || `<div class="muted">Card types arrive with the next daily run.</div>`;
}

// ---------- cards + decklist history ----------
function renderAsOf(d) {
  const sel = $("asOf");
  const days = d.virtual ? [...new Set(realDecks().flatMap(x => x.log.map(r => r.date)))] : [...new Set(d.log.map(r => r.date))];
  const opts = [...new Set([latestDate, ...days])].sort().reverse();
  if (asOf && !opts.includes(asOf)) asOf = null;
  sel.innerHTML = opts.map(o => `<option value="${o}" ${o === (asOf || latestDate) ? "selected" : ""}>${o === latestDate ? "Today" : fmtDate(o)}</option>`).join("");
  sel.closest("label").hidden = opts.length < 2;
}

async function cardsFor(d) {
  if (!asOf || asOf === latestDate) return { date: latestDate, rows: d.rows, past: false };
  const ids = d.virtual ? realDecks().map(x => x.id) : [d.id];
  const rows = mergeRows(ids.flatMap(id => [...stateOn(decks.get(id), asOf).values()].map(({ row, qty }) => ({ ...row, qty }))));
  await loadMonth(monthOf(asOf));
  // that day's prices; fall back to the nearest later day we have
  const day = priceDays.has(asOf) ? asOf : dayOnOrAfter(asOf);
  for (const r of rows) for (const c of Object.keys(SRC)) r[c] = priceDays.get(day)?.get(printKey(r))?.[c] ?? "";
  return { date: asOf, rows, past: true };
}

let cardsToken = 0;
async function renderCards(d) {
  const token = ++cardsToken;
  const { date, rows, past } = await cardsFor(d);
  if (token !== cardsToken) return;
  const from = dayOnOrAfter(addDays(latestDate, -30));
  const q = $("search").value.trim().toLowerCase();
  let list = rows.map(r => {
    const p = priceIn(r), then = !past && from && from !== latestDate ? priceOn(from, printKey(r)) : null;
    const info = cardInfo.get(r.card_name);
    return { name: r.card_name, color: info?.color_identity ?? null, mv: info?.mana_value === "" || info?.mana_value == null ? null : +info.mana_value, set: r.set_code, finish: r.finish, qty: r.qty, tag: isProxy(r) ? "Proxied" : "Paper", proxy: isProxy(r),
             price: p, total: p == null ? null : p * r.qty, d30: p != null && then != null ? (p - then) * r.qty : null };
  });
  if (tagFilter) list = list.filter(c => c.tag === tagFilter);
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
  sortBy(list, cardSort);
  const label = tagFilter === "Proxied" ? "Proxied cards" : tagFilter === "Paper" ? "Paper cards" : "Cards";
  $("cardsTitle").textContent = `${label} (${list.length})${past ? `, ${fmtDate(date)}` : ""}`;
  $("cardTable").querySelector('th[data-k="d30"]').hidden = past;
  $("cardTable").tBodies[0].innerHTML = list.map(c => `
    <tr>
      <td><span class="card-name">${esc(c.name)}</span><span class="printing">${esc(c.set.toUpperCase())}${c.finish && c.finish !== "Normal" ? ", " + esc(c.finish.toLowerCase()) : ""}</span></td>
      <td class="ind">${c.proxy ? `<span class="badge proxy">Proxy</span>` : ""}</td>
      <td class="num">${c.qty}</td>
      <td class="num">${money(c.price)}</td>
      <td class="num">${money(c.total)}</td>
      ${past ? "" : deltaCell(c.d30)}
    </tr>`).join("") || `<tr><td colspan="6" class="muted">No cards match.</td></tr>`;
  markSort($("cardTable"), cardSort);
  const cs = sortStr(cardSort), sel = $("cardSortSel");
  [...sel.options].forEach(o => { if (/d30/.test(o.value)) o.hidden = o.disabled = past; });
  sel.value = [...sel.options].some(o => o.value && !o.disabled && o.value === cs) ? cs : "";
  syncUrl();
}
$("cardSortSel").addEventListener("change", e => { readSort(e.target.value, cardSort); renderCards(decks.get(selected)); });
$("asOf").addEventListener("change", e => { asOf = e.target.value; renderCards(decks.get(selected)); });
