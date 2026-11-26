# Tests

`regression.py` opens `newtab.html` in Chromium with [Playwright](https://playwright.dev/python/) and checks the main features end to end:

- default tiles and the Games folder, drag and drop, nested folders, the tile editor
- bookmark import (folders kept, duplicates and bookmarklets skipped, sharp icons, erase-and-import, undo)
- weather, News and Markets widgets
- search, backup round-trip, flip-on-open
- the games (saved progress, Solitaire auto-finish, Minesweeper first click, Five Letters, Snake, Sudoku)
- parallax and the wallpaper gallery
- the right-click menu and its submenus
- news feed tiles (RSS and Atom, finding a site's feed, pictures in each place feeds put them, all sizes, All headlines, site access)
- more clocks and weather places (scrolling, arrow keys, trackpads, the Personalize lists)

Every network request is answered with simulated data (weather, headlines, prices, Wikimedia, websites), and the Chrome extension APIs are stubbed, so the suite runs offline and gives the same results every time.

`extension.py` loads the folder as a real unpacked extension (so Chrome's own storage is used) and checks that tiles stay where you put them: dragging to an empty square, dragging onto another tile, quick resizes, reloading and a second tab.

## Run

```bash
pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/regression.py
python tests/extension.py
```

Each check prints `PASS` or `FAIL`, followed by a total. The script exits with code 1 if anything fails, so it can run in CI.

To use a particular browser binary, set `CHROME_PATH`:

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" python tests/regression.py
```

`fixtures/` holds the stand-in images the simulated services return (the `story*.jpg` landscapes are drawn by a script, not real photos).
