# Archidekt Snapshot

A GitHub Action that, once a day, snapshots every deck in one [Archidekt](https://archidekt.com) folder: the cards in each deck, their current prices, and whether each card is a proxy. It builds up a price and decklist history over time (see [Data files](#data-files)).

`index.html` (Archidekt Snapshot) has four tabs:
- **Decks**: each deck's value over time (total, paper and proxies), biggest price movers, card swaps, mana curve and card types, and the decklist on any past date. Includes a whole-collection view and an average-deck view, and a picker for which store's prices to use.
- **Cards**: every card across every deck, with filters (name, colors, types, subtypes, sets, price per copy, mana value, decks, proxies or paper, commanders, Game Changers, Exclude lands), each card's price at TCGplayer, Card Kingdom and Cardmarket with the cheapest in bold, and a summary of what the shown copies cost. Choose "Proxies only" to see what it would cost to replace your proxies. Shows as a table, a grid of card images, or a full view with each card's picture and every detail, plus a grid of how many cards each pair of decks shares. (This replaces the old Proxies and Search tabs, and the old [edh-ledger](https://github.com/jimna-h/edh-ledger) project.)
- **Tokens**: every token and emblem your decks can make (from Scryfall's related cards), with which cards make it and which decks they're in. Filter by color, type and deck, and view as a table, token images, or a full view with each token's picture, rules text and makers.
- **Business cards**: a Magic-card-sized card for each deck (color-identity frame, commander art, bracket, Game Changers and a QR code to the deck), laid out to print nine to a letter page and sleeve with the deck, or download as a zip of 300 dpi PNGs, one per card.

The page address always reflects the tab, deck and filters you have open, so you can bookmark or share any view (the Share button sends it).

Turn on GitHub Pages (Settings → Pages → Deploy from a branch → `main`, `/ (root)`) to view it online.

Builds on the Archidekt API approach from [LandBase](https://github.com/jimna-h/LandBase).

The page is plain static files, no build step: `index.html` (structure), `css/style.css`, and `js/` with `core.js` (data loading, shared helpers, tab switching), `decks.js`, `all-cards.js` and `deck-cards.js` for the tabs, and `app.js` (links, shareable URLs, startup). The scripts are ordinary scripts loaded in order and share top-level names. After editing anything in `css/`, `js/` or `vendor/`, run `python tools/stamp_assets.py` so visitors' browsers pick up the new files instead of cached copies.

## Make your own

This repo is a template, so anyone can have their own copy tracking their own folder. It takes about five minutes and needs a GitHub account.

1. **Get your folder number.** On Archidekt, put your decks in a folder and open it. The number at the end of the address is the id, e.g. `archidekt.com/folders/781767` → `781767`. The folder and its decks must be **public**.
2. **Copy this repo.** At the top of this page, click **Use this template → Create a new repository**. Name it anything, keep it **Public** (free GitHub Pages and unlimited Actions minutes need that).
3. **Point it at your folder.** In your new repo: **Settings → Secrets and variables → Actions → Variables → New repository variable**, name `ARCHIDEKT_FOLDER_ID`, value your folder number. Optionally add `TIMEZONE` (e.g. `America/New_York`, default `America/Denver`) for which day snapshots count as.
4. **Take the first snapshot.** **Actions** tab → **Daily snapshot** → **Run workflow**. It takes a minute or two. The copy starts with the original owner's data; this first run notices the different folder and replaces it with yours.
5. **Turn on the site.** **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`, Save. A minute later your site is at `https://<your-username>.github.io/<repo-name>/`.

After that it runs on its own every morning (13:17 UTC), with two backup runs later in the day in case GitHub skips one. If a run fails to push, check **Settings → Actions → General → Workflow permissions** is **Read and write**.

On a phone, open the site and use **Add to Home Screen** (Safari's share menu, or Chrome's ⋮ menu) to get it as an app.

Only decks directly inside the folder are tracked; subfolders are ignored.

Within each deck, a card is only recorded if its primary (first) category is included in the deck, so Maybeboard, Sideboard and any custom category with "included in deck" turned off are skipped. Uncategorized cards are recorded.

## Data files

Decks are always identified by their Archidekt deck id. The files are laid out so the page only downloads a couple of megabytes however long this runs.

| File | What's in it | Size over time |
|---|---|---|
| `data/latest.csv` | Today's cards in every deck: `deck_id`, `card_name`, `quantity`, `set_code`, `finish`, the three prices, `proxied`, `scryfall_id` (the exact printing, for card images) | Rewritten daily, stays ~60 KB |
| `data/totals.csv` | One row per deck per day: card count, and total / paper / proxy value at each store (`tcg_*`, `ck_*`, `cm_*`) | ~1 KB a day |
| `data/decklists.csv` | Change log of deck contents. A deck's full list on its first day, then only entries whose quantity changed (`0` = removed). Swaps and decklist history are rebuilt from this | Grows only when you change decks |
| `data/card_prices/YYYY-MM.csv` | One row per printing per day with the three prices, shared across decks | ~1.3 MB a month; the page loads the last two months |
| `data/decks.csv` | One row per deck: latest name, commanders, the Scryfall id of each commander's printing (for its art; the commander marked as featured on Archidekt comes first), first and last seen | Tiny |
| `data/decks.csv` (continued) | Also each deck's Archidekt bracket, owner, the date it was last edited, and the cards behind its bracket: Game Changers, nonland tutors, mass land denial, extra turns, and complete two-card combos with their total mana value | |
| `data/folder.csv` | The Archidekt folder id, for the page's folder link | Tiny |
| `data/cards.csv` | One row per card name: type line, mana value, color identity | Tiny |
| `data/tokens.csv` | Which tokens (and emblems) each card makes, from Scryfall's related cards: token name, type, power/toughness, colors, rules text, and a printing for its image | Tiny |

Prices are Archidekt's: TCGplayer, Card Kingdom and Cardmarket, using the foil price for foil copies. A deck that disappears from the folder for 10 days has all of its history deleted.

Re-running on the same day replaces that day's rows rather than duplicating them.

## Running locally

```bash
pip install -r requirements.txt
python track_prices.py 781767
```
