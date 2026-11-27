# Metro Start

A tile Start screen inspired by Windows 8 for Chrome's new tab page, with folders, bookmark import, live widgets, a wallpaper gallery and offline games.

![Metro Start](docs/screenshots/start.png)

## Features

- **Tiles in the Windows 8 style.** Four sizes (small, medium, wide, large), the Metro color palette or any color. Each site tile shows its icon at the top left with the site's name in bold and its address underneath.
- **Tiles stay where you put them.** Drag a tile to any square and it stays there; an outline shows where it will land, and tiles in the way move aside. New tiles and imported bookmarks are added after your existing tiles, in order, in groups four tiles wide like Windows 8.
- **Folders, nested as deep as you like.** Folder tiles preview what's inside. Open a folder to see its path, jump back along it, or press Esc to go up one level.
- **Drag and drop.** Move tiles anywhere, drop a tile onto the middle of a folder to file it, or drag it out of an open folder to move it up a level. Hold a tile over the middle of another tile for half a second to make a folder of the two.
- **Bookmark import.** Pick whole bookmark folders or single sites. Tiles keep your bookmarks' order and folder structure, duplicates are skipped, bookmarks with long names get double-width tiles, and each tile gets a sharp icon from the site itself or the one Chrome saved. You can also replace everything on Start with your bookmarks while keeping your games. Undo reverses any import.
- **News feed tiles.** Add BBC News, NPR, The New York Times, The Guardian, The Verge, Ars Technica, Google News or any site with an RSS or Atom feed. New tiles use the **Headlines** style, like the Windows 8.1 News tile: the newest three stories with small pictures, each opening its own story. Switch a tile to **Top story** (one big photo and headline) with right-click → Style. Small tiles show the site's icon and how many stories are new. Tiles stay still (no flipping) and update quietly every 20 minutes. Right-click → **All headlines** lists the latest stories with thumbnails.
- **Clock, weather, news and markets** in the bottom bar. Weather comes from Open-Meteo for your location or a city you choose; headlines from Google News or any RSS feed; prices from Yahoo Finance.
- **More clocks and weather places.** Scroll over the clock to switch between your time and other cities (Los Angeles, New York, UTC and New Delhi to start with), and over the weather to switch between places you add. Dots under each show where you are.
- **Wallpaper gallery.** Landscapes, Seascapes, Cities, Night sky and Paintings, from Wikimedia Commons' community-chosen Featured Pictures. Your pick is saved locally, credited to its photographer, and works offline. You can also upload your own picture or pick a solid color.
- **Windows 8 parallax.** The wallpaper slides more slowly than the tiles as you scroll.
- **Ten offline games.** Solitaire, Minesweeper, Sudoku (with a daily puzzle), Cat Nap (a cat logic puzzle with a daily puzzle), 2048, Five Letters (a daily word game), Pairs (animal memory match), Snake, Blocks and Bricks. Progress and best scores are saved as you play. Lost your Games folder? **+ → Add a game → All games** brings it back.
- **Type to search.** Start typing anywhere to filter your tiles. Enter opens the first match; Shift+Enter searches the web.
- **Personalize** fonts, tile size, animations, flip-on-open, clock format, units and more. Export and import a backup of everything.

| Folders | Personalize |
| --- | --- |
| ![Games folder](docs/screenshots/folder.png) | ![Personalize panel](docs/screenshots/personalize.png) |

| Cat Nap | Pairs | Solitaire |
| --- | --- | --- |
| ![Cat Nap](docs/screenshots/catnap.png) | ![Pairs](docs/screenshots/pairs.png) | ![Solitaire](docs/screenshots/solitaire.png) |

| Five Letters | Minesweeper |
| --- | --- |
| ![Five Letters](docs/screenshots/five-letters.png) | ![Minesweeper](docs/screenshots/minesweeper.png) |

> The screenshots were taken without internet access, so tiles show letters. Once installed, they show each site's icon.

## Install

Metro Start isn't on the Chrome Web Store yet. To install it from this repository:

1. Download or clone this repository (**Code → Download ZIP**, then unzip it).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Open a new tab. If Chrome asks whether to keep the new tab page, choose **Keep it**.

To update, replace the folder with the new version and click the reload icon on the extension's card in `chrome://extensions`.

## Using it

- **Add** tiles, folders and games with the **+** button, or right-click empty space.
- **Right-click a tile** to edit it, resize it, move it to any folder, or delete it.
- **Personalize** (gear icon) holds the background, wallpaper gallery, tile options, clock and weather, widgets and backup.
- **Games:** Esc or the back arrow returns to Start. Arcade games pause when you switch tabs, and P pauses them too.

## Permissions

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Saves your tiles, settings, pictures and game progress in your Chrome profile. |
| `favicon` | Falls back to Chrome's saved site icons. |
| `geolocation` | Weather for where you are. You can pick a city instead. |
| `search` | Shift+Enter searches with your default search engine. |
| `bookmarks` (optional) | Asked only when you import bookmarks. |
| Site access (optional) | Asked only when needed: for the sites you're importing (to fetch sharp icons, given back right after), and for the News and Markets widgets. |

See [PRIVACY.md](PRIVACY.md) for what is sent where.

## Project layout

| Path | What it is |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3); overrides the new tab page |
| `newtab.html`, `styles.css` | Page markup and Metro styling |
| `app.js` | Tiles, folders, drag and drop, editor, menus, settings, search, import, games screen |
| `store.js` | Storage (`chrome.storage.local`, or `localStorage` when the page is opened directly) |
| `weather.js` | Weather and city search (Open-Meteo) |
| `widgets.js` | News and Markets widgets |
| `wallpapers.js` | Wallpaper gallery (Wikimedia Commons) |
| `games/` | The ten games; `core.js` holds shared helpers |
| `tests/` | Automated browser tests (Playwright) |
| `docs/screenshots/` | Images used in this README |

There's no build step: the files are loaded as they are.

## Tests

The `tests/` folder has an automated suite that drives the page in Chromium with Playwright and checks tiles, folders, drag and drop, bookmark import, widgets, weather, games, backups and parallax. All network calls are simulated, so it runs offline. See [tests/README.md](tests/README.md).

## Services used

- **Weather:** [Open-Meteo](https://open-meteo.com/) (no key); city names from [BigDataCloud](https://www.bigdatacloud.com/)'s free reverse geocoding.
- **News:** Google News RSS, or a feed you choose.
- **Markets:** Yahoo Finance's chart data. It's unofficial, may be delayed, and could stop working; the widget says so if it does.
- **Wallpapers:** [Wikimedia Commons](https://commons.wikimedia.org/) Featured Pictures. Each picture keeps its own license, and its credit is shown on screen.
- **Site icons:** Google's favicon service, the sites themselves during bookmark import, and Chrome's local icon cache.

## Credits

- The Five Letters word list is derived from the Hunspell en_US dictionary, built from SCOWL by Kevin Atkinson and others. See [games/WORDLIST-LICENSE.txt](games/WORDLIST-LICENSE.txt).
- Windows, Windows 8 and Metro are associated with Microsoft. This project is an independent tribute and is not affiliated with or endorsed by Microsoft.

## License

[MIT](LICENSE) © 2026 Alireza Farmad
