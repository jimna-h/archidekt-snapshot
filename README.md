# Archidekt Snapshot

Daily snapshots of every deck in one public [Archidekt](https://archidekt.com) folder: cards, prices and proxies, built up into a history. A GitHub Action takes the snapshot each morning and a static site shows it ([mine](https://jimna-h.github.io/archidekt-snapshot/)).

## The site

- **Decks**: each deck's value over time, price movers, card swaps, mana curve, bling score and decklist on any past date. Also a whole-collection and an average-deck view.
- **Cards**: every card across all decks, with filters, prices at three stores, and how many cards each pair of decks shares. "Proxies only" shows what replacing your proxies would cost.
- **Tokens**: every token your decks make and which cards make them, with art from each deck's "Tokens & Extras".
- **Business cards**: a printable Magic-card-sized card per deck with a QR code to it.

**Sync** opens GitHub's Run workflow page for a fresh snapshot, and the site reloads once it's published. The Sync button will only work for you, as you need to be logged in in order to actually run the workflow.

### Bling score

How much you've spent on looks, 0–100. Each copy scores 0–1 by how far it is above the card's cheapest printing, needing both a big multiple and real dollars:

> (share of its price that's premium) × (premium ÷ (premium + $10))

$60 for a $10 card scores 0.69; $550 for a $500 card, 0.08; $1 for a 1¢ card, 0.09. Foils score at least 0.2, proxies 0. A card or deck scores 100 × √(average of its copies).

**Tiers:** 70+ Crown jewel · 50+ Gilded · 30+ Polished · 15+ Sleeved · below that, Bulk. Across 120+ public Commander decks, budget lists score about 10, a typical deck about 20, all-foil showpieces 60–80.

## Make your own

1. **Find your folder id**: the number at the end of your Archidekt folder's address (`archidekt.com/folders/781767` → `781767`). The folder and its decks must be public.
2. **Copy this repo**: **Use this template → Create a new repository**. Keep it public.
3. **Point it at your folder**: **Settings → Secrets and variables → Actions → Variables**, add `ARCHIDEKT_FOLDER_ID` with your folder id. Optionally add `TIMEZONE` (default `America/Denver`).
4. **Take the first snapshot**: **Actions → Daily snapshot → Run workflow**. This replaces the copied data with yours.
5. **Turn on the site**: **Settings → Pages**, deploy from branch `main`, folder `/ (root)`. It appears at `https://<you>.github.io/<repo>/`.

It then runs every morning (13:17 UTC, with two backup runs). If a run can't push, set **Settings → Actions → General → Workflow permissions** to **Read and write**.

**Good to know**
- Tag proxies with the Archidekt color tag called **Proxied** (or **Proxy** or **Proxies**). Filter the Cards tab to "Proxies only" for essentially a to-buy list.
- Only decks directly in the folder count. A card counts if its first category is included in the deck; Sideboard and Maybeboard never count, even though Archidekt includes Sideboard by default.
- A deck gone from the folder for 10 days has its history deleted.
- On a phone, **Add to Home Screen** installs it as an app.

## Data files

All in `data/`. Decks are keyed by Archidekt deck id. Re-running on the same day replaces that day's rows.

| File | Contents | Size |
|---|---|---|
| `latest.csv` | Today's cards in every deck: printing, quantity, finish, prices, proxy flag, Scryfall id, cheapest-printing prices | ~60 KB, rewritten daily |
| `totals.csv` | Per deck per day: value at each store (total / paper / proxy), card counts, bling | ~1 KB a day |
| `decklists.csv` | Change log of deck contents (full list on day one, then only changes) | Grows with swaps |
| `card_prices/YYYY-MM.csv` | Each printing's prices per day | ~1.3 MB a month |
| `decks.csv` | Per deck: name, commanders, bracket and the cards behind it, owner, first and last seen | Tiny |
| `cards.csv` | Per card: type line, mana value, color identity | Tiny |
| `tokens.csv` | Tokens each card makes (from Scryfall) | Tiny |
| `token_proxies.csv` | Proxied tokens in each deck's "Tokens & Extras" | Tiny |
| `folder.csv` | The folder id | Tiny |

Prices (and all other data) come from Archidekt (TCGplayer, Card Kingdom, Cardmarket).

Builds on [LandBase](https://github.com/jimna-h/LandBase) and replaces [edh-ledger](https://github.com/jimna-h/edh-ledger).
