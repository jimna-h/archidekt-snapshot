// Deck cards tab: printable business cards, print and PNG download.

// ---------- deck cards ----------
// One Magic-card-sized (2.5 × 3.5 in) card per deck: color-identity frame, art, the deck's
// Archidekt bracket and the cards behind it, and a QR code to the deck. Laid out like a
// Magic card: name + color "mana cost", art, type line (commanders), text box, and the
// bracket where power/toughness would be.
const FRAME = { W: "#e8dcbc", U: "#2268ad", B: "#36302e", R: "#c4402c", G: "#2a7748", gold: "#c9a03a", C: "#a3a8ad" };
// Magic's own ordering for color pairs and triples (e.g. Bant is G-W-U, Rakdos is B-R)
const PAIR_ORDER = ["WU", "UB", "BR", "RG", "GW", "WB", "UR", "BG", "RW", "GU"];
const TRIO_ORDER = ["WUB", "UBR", "BRG", "RGW", "GWU", "WBG", "URW", "BGU", "RWB", "GUR"];
const sameLetters = (a, b) => a.length === b.length && [...a].every(c => b.includes(c));
function orderedColors(id) {
  const list = id.length === 2 ? PAIR_ORDER : id.length === 3 ? TRIO_ORDER : null;
  return (list && list.find(x => sameLetters(x, id))) || "WUBRG".split("").filter(c => id.includes(c)).join("");
}
// The frame: one color solid, two or three as bands, four or more gold, none silver.
function frameFill(id) {
  if (!id) return FRAME.C;
  if (id.length >= 4) return `linear-gradient(135deg, #b98a26, ${FRAME.gold} 45%, #e2c46e 70%, #b98a26)`;
  const cs = orderedColors(id).split(""), w = 100 / cs.length;
  return cs.length === 1 ? FRAME[cs[0]]
    : `linear-gradient(90deg, ${cs.map((c, i) => `${FRAME[c]} ${i * w}% ${(i + 1) * w}%`).join(", ")})`;
}
const deckIdentity = id => {
  const letters = new Set();
  for (const c of commanderArt.get(id) || []) for (const l of cardInfo.get(c.name)?.color_identity || "") letters.add(l);
  return "WUBRG".split("").filter(l => letters.has(l)).join("");
};
const listOf = s => (s || "").split(" | ").filter(Boolean);
const BRACKET_NAMES = { 1: "Exhibition", 2: "Core", 3: "Upgraded", 4: "Optimized", 5: "cEDH" };
const cardTitle = name => name.replace(/^\d+\.\s*/, "");   // drop the folder numbering ("3. ")
const shortYear = d => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function qrSvg(text) {
  if (typeof qrcode !== "function") return "";
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  // a 2-module white margin (quiet zone) so phone cameras pick the code out reliably
  return qr.createSvgTag({ cellSize: 2, margin: 4, scalable: true, alt: "QR code to the deck on Archidekt" });
}

function deckCardHtml(d) {
  const meta = deckMeta.get(d.id) || {}, id = deckIdentity(d.id);
  const cmds = commanderArt.get(d.id) || [];
  const gc = listOf(meta.game_changers), turns = listOf(meta.extra_turns);
  const url = `https://archidekt.com/decks/${d.id}`;
  // every name goes in; fitGameChangers() trims the list to what fits and adds "+X more"
  const gcRows = gc.length ? gc.map(n => `<li>${esc(n)}</li>`).join("") : `<li class="mc-none">None</li>`;
  return `
    <article class="mcard" data-id="${esc(d.id)}" role="button" tabindex="0" style="--frame:${frameFill(id)}" aria-label="${esc(cardTitle(d.name))} deck card. Click to include or leave out of the printout.">
      <div class="mc-frame"><div class="mc-inner">
        <div class="mc-art ${cmds.length > 1 ? "pair" : ""}">${cmds.slice(0, 2).map(c => artImg(c)).join("")}</div>
        <div class="mc-body">
          <h4 class="mc-name">${esc(cardTitle(d.name))}</h4>
          <div class="mc-cmd">${cmds.map((c, i) => `<span>${i ? "&amp; " : ""}${esc(c.name.split(" // ")[0])}</span>`).join("")}</div>
          <div class="mc-row">
            <div class="mc-section">
              <div class="mc-label"><span>Game Changers</span><b>${gc.length}</b></div>
              <ul class="mc-list" data-names="${esc(JSON.stringify(gc))}">${gcRows}</ul>
              ${turns.length ? `<div class="mc-label" title="${esc(turns.join(", "))}"><span>Extra turns</span><b>${turns.length}</b></div>` : ""}
            </div>
            <div class="mc-side">
              ${meta.bracket ? `<div class="mc-bracket" title="Bracket ${esc(meta.bracket)}${BRACKET_NAMES[meta.bracket] ? ": " + BRACKET_NAMES[meta.bracket] : ""}">B${esc(meta.bracket)}</div>` : `<span></span>`}
              <div class="mc-qr">${qrSvg(url)}</div>
            </div>
          </div>
        </div>
      </div></div>
      <footer class="mc-foot"><span>archidekt.com/decks/${esc(d.id)}</span><span>${esc([meta.owner, meta.updated ? `updated ${shortYear(meta.updated)}` : ""].filter(Boolean).join(", "))}</span></footer>
    </article>`;
}

const skipPrint = new Set();
function updatePrintCount() {
  const all = $("cardSheet").querySelectorAll(".mcard").length, n = all - skipPrint.size;
  $("printCount").textContent = `${n} of ${all} cards selected`;
  $("printAll").hidden = !skipPrint.size; $("printCards").disabled = $("pngCards").disabled = !n;
}
$("cardSheet").addEventListener("click", e => {
  const c = e.target.closest(".mcard"); if (!c) return;
  skipPrint.has(c.dataset.id) ? skipPrint.delete(c.dataset.id) : skipPrint.add(c.dataset.id);
  c.classList.toggle("skip", skipPrint.has(c.dataset.id)); c.setAttribute("aria-pressed", !skipPrint.has(c.dataset.id));
  updatePrintCount();
});
$("cardSheet").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mcard")) { e.preventDefault(); e.target.click(); } });
$("printAll").addEventListener("click", () => { skipPrint.clear(); $("cardSheet").querySelectorAll(".mcard.skip").forEach(c => { c.classList.remove("skip"); c.setAttribute("aria-pressed", true); }); updatePrintCount(); });

// Trim each card's Game Changers to the rows that fit, ending with "+X more" when some don't.
function fitGameChangers() {
  for (const card of $("cardSheet").querySelectorAll(".mcard")) {
    const section = card.querySelector(".mc-section"), list = card.querySelector(".mc-list");
    const names = JSON.parse(list.dataset.names || "[]");   // always start from the full list
    if (!names.length || !section.clientHeight) continue;   // nothing to trim, or the tab isn't showing yet
    const fill = shown => {
      list.innerHTML = names.slice(0, shown).map(n => `<li>${esc(n)}</li>`).join("") +
        (shown < names.length ? `<li class="mc-none">+${names.length - shown} more</li>` : "");
    };
    let shown = names.length;
    fill(shown);
    while (shown > 0 && section.scrollHeight > section.clientHeight + 1) fill(--shown);
  }
}

function renderDeckCards() {
  const list = sortBy(realDecks().filter(d => !isStale(d)), { k: "name", dir: 1 });
  $("cardSheet").innerHTML = list.map(deckCardHtml).join("") || `<div class="muted">No decks yet.</div>`;
  // load every card's art up front, so printing never catches an image that hasn't loaded yet
  $("cardSheet").querySelectorAll("img").forEach(img => img.loading = "eager");
  fitGameChangers();
  document.fonts?.ready.then(fitGameChangers);   // re-fit once the web fonts have loaded
  $("cardSheet").querySelectorAll(".mcard").forEach(c => { c.classList.toggle("skip", skipPrint.has(c.dataset.id)); c.setAttribute("aria-pressed", !skipPrint.has(c.dataset.id)); });
  updatePrintCount();
}
$("printCards").addEventListener("click", () => window.print());

// A minimal zip writer. PNGs are already compressed, so files are stored as-is
// (no compression), which keeps this to a few lines instead of another library.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {   // files: [{ name, bytes: Uint8Array }]
  const enc = new TextEncoder(), now = new Date(), parts = [], central = [];
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes), size = f.bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, size, 4], [22, size, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([at, v, n]) => n === 4 ? local.setUint32(at, v, true) : local.setUint16(at, v, true));
    parts.push(new Uint8Array(local.buffer), name, f.bytes);
    const cd = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, size, 4], [24, size, 4],
     [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([at, v, n]) => n === 4 ? cd.setUint32(at, v, true) : cd.setUint16(at, v, true));
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((t, p) => t + p.length, 0), end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdSize, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([at, v, n]) => n === 4 ? end.setUint32(at, v, true) : end.setUint16(at, v, true));
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// One PNG per selected card, at 300 dpi for the card's real size (750 × 1050 px), all in a
// zip (or just the PNG when only one card is selected). Each card is copied into an
// off-screen spot at true size first, because the on-screen cards are enlarged.
const fileName = name => (cardTitle(name).replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() || "deck") + ".png";
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
$("pngCards").addEventListener("click", async () => {
  const btn = $("pngCards"), label = btn.textContent;
  const cards = [...$("cardSheet").querySelectorAll(".mcard:not(.skip)")];
  if (!cards.length || typeof htmlToImage === "undefined") return;
  btn.disabled = true;
  const stage = Object.assign(document.createElement("div"), { className: "png-stage" });
  document.body.append(stage);
  try {
    const files = [], used = new Set();
    for (const [i, card] of cards.entries()) {
      btn.textContent = `Making ${i + 1} of ${cards.length}…`;
      const copy = card.cloneNode(true);
      copy.classList.remove("skip");
      stage.replaceChildren(copy);
      const blob = await htmlToImage.toBlob(copy, { pixelRatio: 750 / 240, width: 240, height: 336,
        style: { zoom: "1", margin: "0", boxShadow: "none", transform: "none" } });
      const deck = decks.get(card.dataset.id);
      let name = fileName(deck ? deck.name : card.dataset.id);
      for (let n = 2; used.has(name.toLowerCase()); n++) name = name.replace(/( \(\d+\))?\.png$/, ` (${n}).png`);
      used.add(name.toLowerCase());
      files.push({ name, blob, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (files.length === 1) saveBlob(files[0].blob, files[0].name);
    else saveBlob(makeZip(files), `Deck cards ${latestDate}.zip`);
    btn.textContent = files.length === 1 ? "Downloaded" : `Zipped ${files.length}`;
  } catch (err) {
    console.error(err); btn.textContent = "Couldn't make the images";
  } finally {
    stage.remove();
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2000);
  }
});
