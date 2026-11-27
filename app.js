'use strict';
/* Metro Start — a Windows 8–style tile Start screen for Chrome's new tab page. */

// ---------------------------------------------------------------- constants
const PALETTE = ['#2d89ef', '#2b5797', '#00aba9', '#1e7145', '#00a300', '#99b433', '#e3a21a', '#ffc40d',
  '#da532c', '#ee1111', '#b91d47', '#ff0097', '#9f00a7', '#7e3878', '#603cba', '#1d1d1d'];
const BACKGROUNDS = ['#1f0068', '#2b0d4f', '#001e4e', '#004050', '#00451f', '#4e0038', '#5a1e00', '#2d2d2d', '#000000'];
const SIZES = { small: [1, 1], medium: [2, 2], wide: [4, 2], large: [4, 4] };
const SIZE_NAMES = { small: 'Small', medium: 'Medium', wide: 'Wide', large: 'Large' };
const UNIT_PX = { compact: 60, normal: 70, large: 86 };
const MAX_ROWS = 12; // Start uses as many rows as fit on the screen, up to this
const SIZE_GLYPHS = {
  small: '<rect x="7" y="7" width="6" height="6"/>',
  medium: '<rect x="4" y="4" width="12" height="12"/>',
  wide: '<rect x="1.5" y="6" width="17" height="8.5"/>',
  large: '<rect x="2" y="2" width="16" height="16"/>',
};
const DEFAULT_SETTINGS = {
  userName: '',
  showTitle: true,
  bg: { color: '#1f0068', image: '', dim: 25, credit: null },
  tileScale: 'normal',
  font: 'rounded',
  animations: true,
  flipOpen: false,
  parallax: true,
  flipDefaultOff: false,
  gamesAdded: false,
  gamesAdded2: false,
  gamesAdded3: false,
  widgetPos: 'left',
  clock24: false,
  showWeather: true,
  showNews: true,
  newsTopic: 'top',
  newsFeed: '',
  showStocks: true,
  stocks: ['^GSPC', '^DJI', '^IXIC'],
  units: 'f',
  location: { mode: 'auto' },
  // extra clocks and weather places; scroll over the clock or weather to switch between them
  clocks: [
    { tz: 'America/Los_Angeles', name: 'Los Angeles' },
    { tz: 'America/New_York', name: 'New York' },
    { tz: 'UTC', name: 'UTC' },
    { tz: 'Asia/Kolkata', name: 'New Delhi' },
  ],
  places: [],
};

// ---------------------------------------------------------------- helpers
const $ = sel => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hasChrome = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const SPECIAL_SCHEME = /^(chrome|chrome-extension|edge|about|file):/i;
function normalizeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^(https?|ftp|mailto):/i.test(u) || SPECIAL_SCHEME.test(u)) return u;
  return 'https://' + u.replace(/^\/+/, '');
}
function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function prettyName(url) {
  const host = hostOf(url);
  if (!host) return url;
  const parts = host.split('.');
  const main = parts.length > 2 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2] || parts[0];
  return main.charAt(0).toUpperCase() + main.slice(1);
}
function faviconSrc(url) {
  const host = hostOf(url);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : '';
}
function localFavicon(url) {
  if (!hasChrome) return '';
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', url);
  u.searchParams.set('size', '64');
  return u.toString();
}

function openUrl(url, newTab = false) {
  if (SPECIAL_SCHEME.test(url) && hasChrome && chrome.tabs) {
    if (newTab) chrome.tabs.create({ url, active: false });
    else chrome.tabs.update({ url });
    return;
  }
  if (newTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
}

function webSearch(q) {
  if (hasChrome && chrome.search && chrome.search.query) chrome.search.query({ text: q, disposition: 'CURRENT_TAB' });
  else location.href = 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

function readImage(file, maxDim, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(type, quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a picture Chrome can read.')); };
    img.src = url;
  });
}

function pickFile(input) {
  return new Promise(resolve => {
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

// ---------------------------------------------------------------- state
let tiles = [];
let settings = structuredClone(DEFAULT_SETTINGS);
let openFolderId = null;
let searchQuery = '';
let drag = null;

function link(title, url, color, size = 'medium') {
  return { id: uid(), type: 'link', title, url, color, size, icon: { mode: 'favicon' } };
}
function defaultTiles() {
  return [
    {
      id: uid(), type: 'folder', title: 'Google', color: '#2d89ef', size: 'wide', children: [
        link('Google', 'https://www.google.com', '#2d89ef', 'wide'),
        link('Gmail', 'https://mail.google.com', '#b91d47'),
        link('Maps', 'https://maps.google.com', '#1e7145', 'small'),
        link('Drive', 'https://drive.google.com', '#e3a21a', 'small'),
        link('Calendar', 'https://calendar.google.com', '#2b5797', 'small'),
        link('Photos', 'https://photos.google.com', '#da532c', 'small'),
        link('News', 'https://news.google.com', '#00aba9'),
      ],
    },
    {
      id: uid(), type: 'folder', title: 'Social', color: '#603cba', size: 'medium', children: [
        link('Reddit', 'https://www.reddit.com', '#da532c'),
        link('LinkedIn', 'https://www.linkedin.com', '#2b5797'),
        link('Facebook', 'https://www.facebook.com', '#2d89ef'),
        link('X', 'https://x.com', '#1d1d1d'),
      ],
    },
    link('Wikipedia', 'https://www.wikipedia.org', '#1d1d1d'),
    link('Amazon', 'https://www.amazon.com', '#e3a21a', 'wide'),
    {
      id: uid(), type: 'folder', title: 'Entertainment', color: '#b91d47', size: 'wide', children: [
        link('Netflix', 'https://www.netflix.com', '#b91d47', 'wide'),
        link('YouTube', 'https://www.youtube.com', '#ee1111'),
        link('Hulu', 'https://www.hulu.com', '#00a300'),
        link('Max', 'https://www.max.com', '#603cba'),
        link('Disney+', 'https://www.disneyplus.com', '#2b5797'),
        link('Prime Video', 'https://www.primevideo.com', '#00aba9'),
        link('Apple TV+', 'https://tv.apple.com', '#1d1d1d'),
        link('Spotify', 'https://open.spotify.com', '#1e7145'),
        link('Twitch', 'https://www.twitch.tv', '#9f00a7'),
      ],
    },
    gamesFolder(),
  ];
}
const GAME_ORDER = ['solitaire', 'minesweeper', 'sudoku', 'catnap', '2048', 'words', 'pairs', 'snake', 'blocks', 'bricks'];
const NEW_IN_1_9 = ['words', 'snake', 'blocks', 'bricks'];
const NEW_IN_1_12 = ['catnap', 'pairs'];
const gameTile = (game, size = 'medium') => ({ id: uid(), type: 'game', game, title: Games.LIST[game].title, color: Games.LIST[game].color, size });
// Just the games from a list of tiles, with any folders that hold games (other tiles in them are dropped)
function gamesOnly(list) {
  const out = [];
  for (const t of list) {
    if (t.type === 'game') out.push(t);
    else if (t.type === 'folder') {
      const kids = gamesOnly(t.children);
      if (kids.length) out.push({ ...t, children: kids });
    }
  }
  return out;
}
// Brings the Games folder back, or fills in any games missing from it
function restoreGames() {
  const have = new Set(everyTile().filter(x => x.tile.type === 'game').map(x => x.tile.game));
  const missing = GAME_ORDER.filter(g => !have.has(g));
  const folder = everyTile().map(x => x.tile).find(t => t.type === 'folder' && t.children.some(c => c.type === 'game'));
  if (!folder) {
    tiles.push(gamesFolder());
    commit();
    toast('Added the Games folder');
  } else if (missing.length) {
    missing.forEach(g => folder.children.push(gameTile(g)));
    commit();
    toast(`Added ${missing.length} game${missing.length === 1 ? '' : 's'} to “${folder.title}”`);
  } else {
    toast(`All the games are already in “${folder.title}”`);
  }
}
function gamesFolder() {
  return { id: uid(), type: 'folder', title: 'Games', color: '#00a300', size: 'medium', children: GAME_ORDER.map(g => gameTile(g)) };
}

const validPos = p => !!p && [p.g, p.c, p.r].every(n => Number.isInteger(n) && n >= 0) && p.c < 64 && p.g < 500 && p.r < 1000;
const MAX_DEPTH = 12; // nesting limit, only to protect against broken backups
function sanitizeTile(t, depth = 0) {
  if (!t || typeof t !== 'object') return null;
  const base = {
    id: typeof t.id === 'string' && t.id ? t.id : uid(),
    ...(validPos(t.pos) ? { pos: { g: t.pos.g, c: t.pos.c, r: t.pos.r } } : {}),
    title: String(t.title || '').slice(0, 80),
    color: /^#[0-9a-f]{3,8}$/i.test(t.color) ? t.color : PALETTE[0],
    size: SIZES[t.size] ? t.size : 'medium',
  };
  if (t.type === 'folder') {
    if (depth >= MAX_DEPTH) return null;
    const children = (Array.isArray(t.children) ? t.children : []).map(c => sanitizeTile(c, depth + 1)).filter(Boolean);
    return { ...base, type: 'folder', title: base.title || 'Folder', children };
  }
  if (t.type === 'game') {
    const g = Games.LIST[t.game];
    return g ? { ...base, type: 'game', game: t.game, title: base.title || g.title } : null;
  }
  if (t.type === 'feed') {
    const url = normalizeUrl(t.url);
    if (!hostOf(url)) return null;
    const site = hostOf(normalizeUrl(t.site)) ? normalizeUrl(t.site) : '';
    // style: 'list' = a few headlines with small pictures (Windows 8.1 News), 'top' = the newest story's big photo
    return { ...base, type: 'feed', url, site, style: t.style === 'list' ? 'list' : 'top', title: base.title || hostOf(site || url) };
  }
  const url = normalizeUrl(t.url);
  if (!url) return null;
  const mode = ['favicon', 'letter', 'image'].includes(t.icon && t.icon.mode) ? t.icon.mode : 'favicon';
  const icon = { mode };
  if (mode === 'image') {
    icon.src = String(t.icon.src || '');
    icon.fill = !!t.icon.fill;
    if (!icon.src) icon.mode = 'favicon';
  }
  if (t.icon && typeof t.icon.siteIcon === 'string' && /^(https?:|data:image\/)/.test(t.icon.siteIcon)) icon.siteIcon = t.icon.siteIcon;
  return { ...base, type: 'link', url, title: base.title || hostOf(url) || url, icon };
}
const sanitizeTiles = list => (Array.isArray(list) ? list : []).map(t => sanitizeTile(t, 0)).filter(Boolean);

function mergeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...s,
    bg: { ...DEFAULT_SETTINGS.bg, ...(s.bg || {}) },
    location: { ...DEFAULT_SETTINGS.location, ...(s.location || {}) },
    clocks: Array.isArray(s.clocks) ? s.clocks.filter(c => c && validTz(c.tz)).slice(0, MAX_CLOCKS).map(c => ({ tz: c.tz, name: String(c.name || c.tz).slice(0, 60) })) : structuredClone(DEFAULT_SETTINGS.clocks),
    places: Array.isArray(s.places) ? s.places.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, MAX_PLACES).map(p => ({ name: String(p.name || '').slice(0, 60), lat: p.lat, lon: p.lon })) : [],
  };
}
const MAX_CLOCKS = 8;
const MAX_PLACES = 6;
function validTz(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

async function load() {
  const stored = await Store.get('tiles', null);
  tiles = Array.isArray(stored) ? sanitizeTiles(stored) : defaultTiles();
  settings = mergeSettings(await Store.get('settings', null));
}

const recentSaves = [];
async function saveTiles() {
  recentSaves.push(JSON.stringify(tiles));
  if (recentSaves.length > 20) recentSaves.shift();
  try { await Store.set('tiles', tiles); } catch (e) { toast('Couldn’t save your tiles: ' + e.message); }
}
const saveTilesSoon = debounce(saveTiles, 300);
async function saveSettings() {
  try { await Store.set('settings', settings); } catch (e) { toast('Couldn’t save settings: ' + e.message); }
}
const saveSettingsSoon = debounce(saveSettings, 400);

// Finds a tile at any depth: { tile, list it sits in, parent folder (null on Start) }
function findTile(id, list = tiles, parent = null) {
  for (const t of list) {
    if (t.id === id) return { tile: t, list, parent };
    if (t.type === 'folder') {
      const found = findTile(id, t.children, t);
      if (found) return found;
    }
  }
  return null;
}
function findFolder(id) {
  const f = id && findTile(id);
  return f && f.tile.type === 'folder' ? f.tile : null;
}
// Folders from Start down to (not including) the tile
function pathTo(id) {
  const path = [];
  let f = findTile(id);
  while (f && f.parent) { path.unshift(f.parent); f = findTile(f.parent.id); }
  return path;
}
// Is `id` the folder itself or somewhere inside it?
function isInside(folder, id) {
  return folder.id === id || folder.children.some(c => c.type === 'folder' && isInside(c, id));
}
// Every tile at any depth, with its folder path
function everyTile(list = tiles, path = [], out = []) {
  for (const t of list) {
    out.push({ tile: t, path });
    if (t.type === 'folder') everyTile(t.children, [...path, t], out);
  }
  return out;
}
const allLinksDeep = () => everyTile().map(x => x.tile).filter(t => t.type === 'link');

function commit() {
  saveTiles();
  renderGrid();
  if (openFolderId) renderFolder();
}

function moveTile(id, toFolderId, refId = null, after = false) {
  const src = findTile(id);
  if (!src) return;
  const destFolder = toFolderId ? findFolder(toFolderId) : null;
  const dest = toFolderId ? destFolder && destFolder.children : tiles;
  if (!dest) return;
  // a folder can't go inside itself or one of its own subfolders
  if (src.tile.type === 'folder' && destFolder && isInside(src.tile, destFolder.id)) {
    toast('A folder can’t go inside itself.');
    return;
  }
  src.list.splice(src.list.indexOf(src.tile), 1);
  if (src.list !== dest) delete src.tile.pos;
  let idx = refId ? dest.findIndex(x => x.id === refId) : -1;
  if (idx < 0) idx = dest.length;
  else if (after) idx++;
  dest.splice(idx, 0, src.tile);
  commit();
}

function placeTileAt(id, spot) {
  if (tiles.some(x => x.id === id)) { placeIn(tiles, id, spot, GROUP_COLS, startRows, lastSpots); return; }
  const f = findFolder(openFolderId);
  if (f && f.children.some(x => x.id === id)) placeIn(f.children, id, { ...spot, g: 0 }, folderCols, FOLDER_ROWS, folderSpots);
}
function placeIn(list, id, spot, groupCols, rows, spotsNow) {
  const GROUP_COLS_ = groupCols;
  const t = list.find(x => x.id === id);
  if (!t) return;
  const [w, hh] = tileDims(t, rows, GROUP_COLS_);
  const target = { g: spot.g, c: Math.max(0, Math.min(spot.c, GROUP_COLS_ - w)), r: Math.max(0, Math.min(spot.r, rows - hh)) };
  // freeze everything where it's shown now, so nothing else shifts
  for (const x of list) {
    const sp = spotsNow.get(x.id);
    if (sp && x.id !== id) x.pos = { g: sp.group, c: sp.col, r: sp.row };
  }
  t.pos = target;
  const used = new Set();
  const cells = (g, c, r, ww, h2) => { const out = []; for (let a = c; a < c + ww; a++) for (let b = r; b < r + h2; b++) out.push(`${g},${a},${b}`); return out; };
  cells(target.g, target.c, target.r, w, hh).forEach(k => used.add(k));
  const moving = [];
  for (const x of list) {
    if (x === t || !x.pos) continue;
    const [xw, xh] = tileDims(x, rows, GROUP_COLS_);
    const mine = cells(x.pos.g, x.pos.c, x.pos.r, xw, xh);
    if (mine.some(k => used.has(k))) moving.push(x);
    else mine.forEach(k => used.add(k));
  }
  // each tile that was in the way goes to the closest free spot (same group first)
  const lastRow = Math.max(0, ...list.map(y => (y.pos ? y.pos.r + 4 : 0)));
  const searchRows = Math.min(rows, lastRow + 4);
  for (const x of moving) {
    const [xw, xh] = tileDims(x, rows, GROUP_COLS_);
    const from = x.pos.g * GROUP_COLS_ + x.pos.c;
    let best = null;
    const maxG = rows < FOLDER_ROWS ? Math.max(...list.map(y => (y.pos ? y.pos.g : 0))) + 1 : 0;
    for (let g = 0; g <= maxG; g++) {
      for (let r = 0; r + xh <= searchRows + xh; r++) {
        if (r + xh > rows) break;
        for (let c = 0; c + xw <= GROUP_COLS_; c++) {
          const ks = cells(g, c, r, xw, xh);
          if (ks.some(k => used.has(k))) continue;
          const d = Math.abs(g * GROUP_COLS_ + c - from) + Math.abs(r - x.pos.r) + (g !== x.pos.g ? 2 : 0);
          if (!best || d < best.d) best = { d, g, c, r };
        }
      }
    }
    x.pos = { g: best.g, c: best.c, r: best.r };
    cells(best.g, best.c, best.r, xw, xh).forEach(k => used.add(k));
  }
  // keep the list in the order you see it (search and new tiles follow this order)
  const at = x => (x.pos ? (x.pos.g * 1000 + x.pos.r) * 100 + x.pos.c : Infinity);
  list.sort((a, b) => at(a) - at(b));
  commit();
}

function deleteTile(id) {
  const f = findTile(id);
  if (!f) return;
  const snapshot = JSON.stringify(tiles);
  f.list.splice(f.list.indexOf(f.tile), 1);
  if (openFolderId && f.tile.type === 'folder' && isInside(f.tile, openFolderId)) closeFolder();
  commit();
  toast(`Deleted “${f.tile.title}”`, { label: 'Undo', run: () => { tiles = JSON.parse(snapshot); commit(); } });
}

// ---------------------------------------------------------------- DOM refs
const grid = $('#grid');
const scroller = $('#grid-scroller');
const searchInput = $('#search');
const infoBar = $('#info-bar');
const weatherWidget = $('#weather-widget');
const folderOverlay = $('#folder-overlay');
const folderGrid = $('#folder-grid');
const folderTitle = $('#folder-title');
const ctx = $('#ctx');
const settingsPanel = $('#settings');
const settingsScrim = $('#settings-scrim');

function openOverlay(el) {
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
}
function closeOverlay(el) {
  el.classList.remove('open');
  el.hidden = true;
}

// ---------------------------------------------------------------- tiles
function tileIcon(t) {
  const icon = t.icon || { mode: 'favicon' };
  const letter = () => h('span', { class: 'tile-letter' }, (t.title || hostOf(t.url) || '?').trim().charAt(0).toUpperCase());
  if (icon.mode === 'letter') return letter();
  // site icons: the one saved at import, then Google's icon service, then Chrome's own cache, then a letter
  const sources = (icon.mode === 'image' ? [icon.src] : [icon.siteIcon, faviconSrc(t.url), localFavicon(t.url)]).filter(Boolean);
  if (!sources.length) return letter();
  const img = h('img', {
    class: 'tile-icon' + (icon.mode === 'image' && icon.fill ? ' fill' : ''),
    src: sources[0], alt: '', draggable: 'false', loading: 'lazy', referrerpolicy: 'no-referrer',
  });
  let next = 1;
  img.addEventListener('error', () => {
    if (next < sources.length) img.src = sources[next++];
    else img.replaceWith(letter());
  });
  return img;
}

const FOLDER_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>';
function folderPreview(f) {
  const max = { small: 4, medium: 4, wide: 8, large: 9 }[f.size] || 4;
  const wrap = h('div', { class: 'folder-preview' });
  const kids = f.children.slice(0, max);
  for (const c of kids) {
    wrap.append(h('div', { class: 'mini' + (c.type === 'folder' ? ' mini-folder' : ''), style: { background: c.color } },
      c.type === 'folder' ? h('span', { class: 'mini-glyph', html: FOLDER_GLYPH })
        : c.type === 'game' ? (c.game === '2048' ? h('span', { class: 'mini-2048' }, '2048') : h('span', { class: 'mini-glyph', html: Games.GLYPHS[c.game] || '' }))
          : tileIcon(c)));
  }
  if (!kids.length) wrap.append(h('div', { class: 'folder-empty' }, f.size === 'small' ? '' : 'Empty'));
  return wrap;
}

function gameFace(t) {
  if (t.game === '2048') return h('div', { class: 'tile-face' }, h('span', { class: 'tile-2048' }, '2048'));
  return h('div', { class: 'tile-face' }, h('span', { class: 'game-glyph', html: Games.GLYPHS[t.game] || '' }));
}
// The address shown under a site's name: no "https://", no "www.", no trailing slash
function displayUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return url;
    const path = (u.pathname + u.search).replace(/\/+$/, '');
    return u.hostname.replace(/^www\./, '') + (path === '/' ? '' : path);
  } catch { return url; }
}
// ---- news feed tiles: the newest story's photo and headline (still; they update quietly when the feed refreshes)
const feedHome = t => t.site || (() => { try { return new URL(t.url).origin; } catch { return t.url; } })();
function feedTop(t) {
  const c = Feeds.cached(t.url);
  return c && c.items && c.items[0] ? c.items[0] : null;
}
function feedTileEl(t, { draggable = true, preview = false } = {}) {
  const [cols, rows] = SIZES[t.size] || SIZES.medium;
  const c = Feeds.cached(t.url);
  const items = (c && c.items) || [];
  const top = items[0] || (preview ? { title: 'The newest story from this feed shows here', image: '', date: 0 } : null);
  const photo = top && top.image && t.size !== 'small' ? top.image : '';
  const el = h(preview ? 'div' : 'a', {
    class: `tile size-${t.size} feed` + (photo ? ' has-photo' : ''),
    style: { background: t.color, ...(preview ? {} : { gridColumn: `span ${cols}`, gridRow: `span ${rows}` }) },
    dataset: preview ? {} : { id: t.id },
    draggable: draggable && !preview ? 'true' : 'false',
    href: preview ? null : (top && top.link) || feedHome(t),
    title: preview ? null : top ? `${t.title}\n${top.title}` : t.title,
  });
  const icon = h('span', { class: 'feed-icon' }, tileIcon({ title: t.title, url: feedHome(t), icon: { mode: 'favicon' } }));
  if (t.size === 'small') {
    const fresh = c && c.seen ? items.filter(i => i.date > c.seen).length : 0;
    el.append(h('div', { class: 'tile-face' }, tileIcon({ title: t.title, url: feedHome(t), icon: { mode: 'favicon' } })));
    if (fresh) el.append(h('span', { class: 'feed-badge' }, fresh > 9 ? '9+' : String(fresh)));
    return el;
  }
  if (t.style === 'list') return feedListFace(el, t, items, c, preview);
  if (photo) {
    el.append(h('div', { class: 'feed-photo' }, h('img', {
      src: photo, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false',
      onerror: e => { e.target.closest('.feed-photo').remove(); el.classList.remove('has-photo'); },
    })));
  }
  const meta = [t.title, top && Feeds.ago(top.date)].filter(Boolean).join(' · ');
  el.append(h('div', { class: 'feed-text' },
    top
      ? h('span', { class: 'feed-headline' }, top.title)
      : h('span', { class: 'feed-note' }, c && c.error ? c.error : c && c.needsAccess ? 'Select to let Metro Start read this feed' : 'Loading stories…'),
    h('span', { class: 'feed-meta' }, icon, h('span', { class: 'feed-meta-text' }, meta))));
  return el;
}

// Headlines style: the newest few stories, each with a small picture, and the site's icon in the corner.
// Each row opens its own story.
const FEED_ROWS = { large: 3, wide: 2, medium: 2 };
function feedListFace(el, t, items, c, preview) {
  el.classList.add('feed-list-style');
  el.classList.remove('has-photo');
  const sample = { title: 'Headlines from this feed show here', image: '', link: '' };
  const rows = (items.length ? items : preview ? [sample, sample, sample] : []).slice(0, FEED_ROWS[t.size] || 2);
  const icon = () => tileIcon({ title: t.title, url: feedHome(t), icon: { mode: 'favicon' } });
  // no picture boxes on medium tiles, or when none of the shown stories has a picture
  const withThumbs = t.size !== 'medium' && (rows.some(i => i.image) || (preview && !items.length));
  const list = h('div', { class: 'feed-rows' }, rows.map(i => h('div', {
    class: 'feed-row', dataset: i.link ? { link: i.link } : {}, title: preview ? null : i.title,
  },
  withThumbs ? h('span', { class: 'feed-row-thumb' + (i.image ? '' : ' no-pic') },
    i.image
      ? h('img', { src: i.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false',
        onerror: e => { const box = e.target.parentNode; e.target.remove(); box.classList.add('no-pic'); box.append(icon()); } })
      : icon()) : null,
  h('span', { class: 'feed-row-title' }, i.title))));
  if (!rows.length) list.append(h('span', { class: 'feed-note' }, c && c.error ? c.error : c && c.needsAccess ? 'Select to let Metro Start read this feed' : 'Loading stories…'));
  el.append(list, h('span', { class: 'feed-corner', title: preview ? null : t.title }, icon()));
  if (!preview) el.title = t.title;
  return el;
}

function tileEl(t, { draggable = true, preview = false } = {}) {
  if (t.type === 'feed') return feedTileEl(t, { draggable, preview });
  const isFolder = t.type === 'folder';
  const isGame = t.type === 'game';
  const isButton = (isFolder || isGame) && !preview;
  const [cols, rows] = SIZES[t.size] || SIZES.medium;
  const fill = !isFolder && t.icon && t.icon.mode === 'image' && t.icon.fill;
  const el = h(isFolder || isGame || preview ? 'div' : 'a', {
    class: `tile size-${t.size}` + (isFolder ? ' folder' : '') + (isGame ? ' game' : '') + (fill ? ' has-fill' : ''),
    style: { background: t.color, ...(preview ? {} : { gridColumn: `span ${cols}`, gridRow: `span ${rows}` }) },
    dataset: preview ? {} : { id: t.id },
    draggable: draggable && !preview ? 'true' : 'false',
    href: isFolder || isGame || preview ? null : t.url,
    tabindex: isButton ? '0' : null,
    role: isButton ? 'button' : null,
    title: preview ? null : isFolder ? `${t.title} (${t.children.length})` : isGame ? `Play ${t.title}` : `${t.title}\n${t.url}`,
  });
  if (isFolder) el.append(folderPreview(t), h('span', { class: 'tile-count' }, String(t.children.length), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
  else if (isGame) el.append(gameFace(t));
  else if (!fill && t.size !== 'small') {
    el.classList.add('site');
    el.append(h('div', { class: 'site-head' },
      h('div', { class: 'site-icon' }, tileIcon(t)),
      h('div', { class: 'site-text' },
        h('span', { class: 'site-name' }, t.title),
        h('span', { class: 'site-url' }, displayUrl(t.url)))));
    return el;
  }
  else el.append(h('div', { class: 'tile-face' }, tileIcon(t)));
  if (t.size !== 'small') {
    el.append(isFolder
      ? h('span', { class: 'tile-label' }, h('span', { class: 'label-glyph', html: FOLDER_GLYPH }), h('span', { class: 'label-text' }, t.title))
      : h('span', { class: 'tile-label' }, t.title));
  }
  return el;
}

// ---- layout: tiles keep their order. They flow left to right, top to bottom inside groups that are
// GROUP_COLS units wide (like Windows 8), and groups continue to the right. A tile only moves forward to find
// room, never back into an earlier gap, so what comes first in the list always comes first on screen.
const GROUP_COLS = 4;
function packTiles(list, groupCols, rows) {
  const used = new Set();
  const free = (c, r, w, hh) => {
    for (let x = c; x < c + w; x++) for (let y = r; y < r + hh; y++) if (used.has(`${x},${y}`)) return false;
    return true;
  };
  const perGroup = groupCols * rows;
  let cursor = 0;
  return list.map(t => {
    let [w, hh] = SIZES[t.size] || SIZES.medium;
    w = Math.min(w, groupCols);
    hh = Math.min(hh, rows);
    for (let i = cursor; ; i++) {
      const g = Math.floor(i / perGroup);
      const r = Math.floor((i % perGroup) / groupCols);
      const c = i % groupCols;
      if (c + w > groupCols || r + hh > rows) continue;
      const x = g * groupCols + c;
      // keep the tile inside its group (rows is finite for Start, effectively unlimited in a folder)
      if (!free(x, g * rows + r, w, hh)) continue;
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < hh; dy++) used.add(`${x + dx},${g * rows + r + dy}`);
      cursor = i + 1;
      return { group: g, col: c, row: r, w, h: hh };
    }
  });
}
// Start screen with saved positions. Tiles keep the square you put them on. Tiles without a position yet
// (new, imported, or from before 1.12.1) are placed in order after the last group in use, and that spot is saved.
// A tile that doesn't fit right now (for example, the window got shorter) is shown further along but keeps its saved spot.
const tileDims = (t, rows, cols = GROUP_COLS) => { const [w, hh] = SIZES[t.size] || SIZES.medium; return [Math.min(w, cols), Math.min(hh, rows)]; };
function layoutStart(list, rows) { return layoutFree(list, GROUP_COLS, rows, true); }
// In a folder there's a single group; new tiles go after the last tile rather than into earlier gaps.
function layoutFree(list, groupCols, rows, groups) {
  const GROUP_COLS_ = groupCols;
  const used = new Set();
  const free = (g, c, r, w, hh) => {
    if (c < 0 || r < 0 || c + w > GROUP_COLS_ || r + hh > rows) return false;
    for (let x = c; x < c + w; x++) for (let y = r; y < r + hh; y++) if (used.has(`${g},${x},${y}`)) return false;
    return true;
  };
  const take = (g, c, r, w, hh) => { for (let x = c; x < c + w; x++) for (let y = r; y < r + hh; y++) used.add(`${g},${x},${y}`); };
  const spots = new Array(list.length);
  list.forEach((t, i) => {
    const [w, hh] = tileDims(t, rows, GROUP_COLS_);
    const p = t.pos;
    if (p && (groups || p.g === 0) && free(p.g, p.c, p.r, w, hh)) { take(p.g, p.c, p.r, w, hh); spots[i] = { group: p.g, col: p.c, row: p.r, w, h: hh }; }
  });
  const perGroup = GROUP_COLS_ * rows;
  let cursor;
  if (groups) cursor = spots.reduce((m, sp) => (sp ? Math.max(m, sp.group) : m), 0) * perGroup;
  else cursor = spots.reduce((m, sp) => (sp ? Math.max(m, sp.row * GROUP_COLS_ + sp.col + 1) : m), 0);
  let changed = false;
  list.forEach((t, i) => {
    if (spots[i]) return;
    const [w, hh] = tileDims(t, rows, GROUP_COLS_);
    for (let k = cursor; ; k++) {
      const g = Math.floor(k / perGroup);
      const r = Math.floor((k % perGroup) / GROUP_COLS_);
      const c = k % GROUP_COLS_;
      if (!free(g, c, r, w, hh)) continue;
      take(g, c, r, w, hh);
      spots[i] = { group: g, col: c, row: r, w, h: hh };
      cursor = k + 1;
      if (!t.pos) { t.pos = { g, c, r }; changed = true; }
      break;
    }
  });
  return { spots, changed };
}
function applySpots(els, spots) {
  const groups = spots.reduce((n, p) => Math.max(n, p.group + 1), 1);
  const cols = [];
  for (let g = 0; g < groups; g++) cols.push(`repeat(${GROUP_COLS}, var(--unit))`, g < groups - 1 ? 'calc(var(--unit) * .3)' : '');
  grid.style.gridTemplateColumns = cols.filter(Boolean).join(' ');
  els.forEach((el, i) => {
    const p = spots[i];
    el.style.gridColumn = `${p.group * (GROUP_COLS + 1) + p.col + 1} / span ${p.w}`;
    el.style.gridRow = `${p.row + 1} / span ${p.h}`;
  });
}
// Search results: just the matches, packed in order
function placeOnStart(els, list, rows) {
  const spots = packTiles(list, GROUP_COLS, rows);
  const groups = spots.reduce((n, p) => Math.max(n, p.group + 1), 1);
  const cols = [];
  for (let g = 0; g < groups; g++) cols.push(`repeat(${GROUP_COLS}, var(--unit))`, g < groups - 1 ? 'calc(var(--unit) * .3)' : '');
  grid.style.gridTemplateColumns = cols.filter(Boolean).join(' ');
  els.forEach((el, i) => {
    const p = spots[i];
    el.style.gridColumn = `${p.group * (GROUP_COLS + 1) + p.col + 1} / span ${p.w}`;
    el.style.gridRow = `${p.row + 1} / span ${p.h}`;
  });
}
// A folder: one group as wide as the folder band, as many rows as needed
const FOLDER_ROWS = 999;
let folderCols = GROUP_COLS;
let folderSpots = new Map(); // where each tile in the open folder is shown right now
function placeInFolder(els, list) {
  const unit = UNIT_PX[settings.tileScale] || 70;
  const gap = Math.round(unit / 7);
  // the band's inner width (the folder grid itself may not be laid out yet)
  const inner = folderGrid.parentElement.clientWidth || Math.min(1100, window.innerWidth - 80);
  folderCols = Math.max(GROUP_COLS, Math.floor((inner - 8 + gap) / (unit + gap)));
  const { spots, changed } = layoutFree(list, folderCols, FOLDER_ROWS, false);
  folderGrid.style.gridTemplateColumns = `repeat(${folderCols}, var(--unit))`;
  els.forEach((el, i) => {
    el.style.gridColumn = `${spots[i].col + 1} / span ${spots[i].w}`;
    el.style.gridRow = `${spots[i].row + 1} / span ${spots[i].h}`;
  });
  folderSpots = new Map(list.map((t, i) => [t.id, spots[i]]));
  if (changed) saveTilesSoon();
}
let startRows = 6;
let lastSpots = new Map(); // where each Start tile is shown right now

function searchResults(q) {
  return everyTile().map(x => x.tile).filter(t => `${t.title} ${t.url || ''}`.toLowerCase().includes(q));
}

function renderGrid({ animate = false } = {}) {
  requestAnimationFrame(() => updateParallax());
  const q = searchQuery.trim().toLowerCase();
  const list = q ? searchResults(q) : tiles;
  const els = list.map(t => tileEl(t, { draggable: !q }));
  if (q) placeOnStart(els, list, startRows);
  else {
    const { spots, changed } = layoutStart(list, startRows);
    applySpots(els, spots);
    lastSpots = new Map(list.map((t, i) => [t.id, spots[i]]));
    if (changed) saveTilesSoon();
  }
  grid.replaceChildren(...els);
  const hint = $('#empty-hint');
  hint.hidden = list.length > 0;
  hint.textContent = q
    ? `No tiles match “${searchQuery.trim()}”. Press Enter to search the web.`
    : 'Your Start screen is empty. Select + to add a tile or import your bookmarks.';
  if (animate && settings.animations) entrance(grid);
}

function entrance(container) {
  const left = container.getBoundingClientRect().left;
  for (const el of container.children) {
    const dx = el.getBoundingClientRect().left - left;
    el.style.animationDelay = Math.min(dx * 0.35, 650) + 'ms';
    el.classList.add('enter');
    el.addEventListener('animationend', () => { el.classList.remove('enter'); el.style.animationDelay = ''; }, { once: true });
  }
}

function layoutGrid() {
  const unit = UNIT_PX[settings.tileScale] || 70;
  const gap = Math.round(unit / 7);
  const root = document.documentElement.style;
  root.setProperty('--unit', unit + 'px');
  root.setProperty('--gap', gap + 'px');
  const avail = scroller.clientHeight - 40; // grid's vertical padding
  let rows = Math.floor((avail + gap) / (unit + gap));
  rows = Math.min(MAX_ROWS, Math.max(4, rows - (rows % 2)));
  grid.style.gridTemplateRows = `repeat(${rows}, var(--unit))`;
  if (rows !== startRows) { startRows = rows; renderGrid(); }
}



// ---- flip on open: the tile turns over like a card, shows what's opening, then opens it
function flipThen(el, t, done) {
  if (!settings.flipOpen || !settings.animations || matchMedia('(prefers-reduced-motion: reduce)').matches || el.closest('.preview-stage')) { done(); return; }
  if (el.classList.contains('flipping')) return;
  el.style.transform = '';
  el.classList.add('flipping', 'flip-out');
  const back = t.type === 'folder' ? `${t.children.length} item${t.children.length === 1 ? '' : 's'}`
    : t.type === 'game' ? 'Play' : hostOf(t.url) || t.title;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; done(); setTimeout(() => resetFlip(el), 700); };
  el.addEventListener('animationend', () => {
    el.classList.remove('flip-out');
    el.append(h('div', { class: 'tile-back' }, h('span', { class: 'tile-back-text' }, back)));
    el.classList.add('flipped', 'flip-in');
    el.addEventListener('animationend', finish, { once: true });
  }, { once: true });
  setTimeout(finish, 900); // in case an animation event never arrives
}
function resetFlip(el) {
  el.classList.remove('flipping', 'flip-out', 'flip-in', 'flipped');
  el.querySelectorAll('.tile-back').forEach(b => b.remove());
}
// coming back with the browser's Back button can restore a half-flipped page
window.addEventListener('pageshow', () => document.querySelectorAll('.tile.flipping').forEach(resetFlip));

// ---- shared tile interactions (main grid + folder grid)
function bindTileEvents(container, getFolderId) {
  container.addEventListener('click', e => {
    const el = e.target.closest('.tile');
    if (!el) return;
    const f = findTile(el.dataset.id);
    if (!f) return;
    const t = f.tile;
    if (t.type === 'folder') { e.preventDefault(); flipThen(el, t, () => openFolder(t.id)); return; }
    if (t.type === 'game') { e.preventDefault(); flipThen(el, t, () => openGame(t.game)); return; }
    if (t.type === 'feed') {
      const c = Feeds.cached(t.url);
      if (c && c.needsAccess) { e.preventDefault(); allowFeed(t); return; }
      const row = t.style === 'list' && e.target.closest('.feed-row[data-link]');
      if (row) {
        e.preventDefault();
        Feeds.markSeen(t.url);
        if (e.ctrlKey || e.metaKey || e.shiftKey) openUrl(row.dataset.link, true);
        else flipThen(el, t, () => openUrl(row.dataset.link, false));
        return;
      }
      const top = feedTop(t);
      if (t.size === 'small' || !top) { e.preventDefault(); openHeadlines(t.id); return; }
      if (e.ctrlKey || e.metaKey || e.shiftKey) return; // the browser opens the story in a new tab
      e.preventDefault();
      Feeds.markSeen(t.url);
      flipThen(el, t, () => openUrl(top.link, false));
      return;
    }
    const newTab = e.ctrlKey || e.metaKey || e.shiftKey;
    if (newTab) {
      // the browser opens ordinary links in a new tab by itself
      if (SPECIAL_SCHEME.test(t.url)) { e.preventDefault(); openUrl(t.url, true); }
      return;
    }
    e.preventDefault();
    flipThen(el, t, () => openUrl(t.url, false));
  });
  container.addEventListener('auxclick', e => {
    const el = e.target.closest('.tile');
    const f = el && findTile(el.dataset.id);
    if (e.button === 1 && f && f.tile.type === 'link' && SPECIAL_SCHEME.test(f.tile.url)) { e.preventDefault(); openUrl(f.tile.url, true); }
    // middle-click on a headline opens that story (not the tile's top story) in a new tab
    const row = e.button === 1 && f && f.tile.type === 'feed' && e.target.closest('.feed-row[data-link]');
    if (row) { e.preventDefault(); openUrl(row.dataset.link, true); }
  });
  container.addEventListener('keydown', e => {
    const el = e.target.closest('.tile[role="button"]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });
  container.addEventListener('contextmenu', e => tileMenu(e, getFolderId()));

  // the Windows 8 "press" tilt: the tile leans away from where you press it
  container.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !settings.animations) return;
    const el = e.target.closest('.tile');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 16}deg) rotateX(${-y * 16}deg) scale(.97)`;
    const reset = () => {
      el.style.transform = '';
      window.removeEventListener('pointerup', reset);
      window.removeEventListener('pointercancel', reset);
      el.removeEventListener('dragstart', reset);
    };
    window.addEventListener('pointerup', reset);
    window.addEventListener('pointercancel', reset);
    el.addEventListener('dragstart', reset);
  });

  // drag and drop: reorder, or drop a link onto the middle of a folder to file it
  container.addEventListener('dragstart', e => {
    const el = e.target.closest && e.target.closest('.tile');
    if (!el || searchQuery) { e.preventDefault(); return; }
    // remember which square of the tile was grabbed, so it lands where it's dropped
    const r = el.getBoundingClientRect();
    const step = cellStep();
    drag = { id: el.dataset.id, grabC: Math.floor((e.clientX - r.left) / step), grabR: Math.floor((e.clientY - r.top) / step) };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.id);
    requestAnimationFrame(() => el.classList.add('dragging'));
    hideMenu();
  });
  container.addEventListener('dragover', e => {
    if (!drag || (container === grid && startDragOK()) || (container === folderGrid && folderDragOK())) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    const el = e.target.closest('.tile');
    if (container === grid && startDragOK()) return; // handled by the whole Start area below
    if (!el || el.dataset.id === drag.id) return;
    el.classList.add('drop-' + dropMode(el, e));
  });
  container.addEventListener('drop', e => {
    if (!drag || (container === grid && startDragOK()) || (container === folderGrid && folderDragOK())) return;
    e.preventDefault();
    e.stopPropagation();
    const id = drag.id;
    const el = e.target.closest('.tile');
    if (container === grid && startDragOK()) return; // handled by the whole Start area below
    clearDropMarks();
    if (!el) { moveTile(id, getFolderId()); return; }
    if (el.dataset.id === id) return;
    const mode = dropMode(el, e);
    if (mode === 'into') moveTile(id, el.dataset.id);
    else moveTile(id, getFolderId(), el.dataset.id, mode === 'after');
  });
}

// dragend fires on the original element, which may already be re-rendered away, so listen globally
document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
  folderOverlay.classList.remove('drop-out');
  clearDropMarks();
  drag = null;
});

function dropMode(el, e) {
  const target = findTile(el.dataset.id);
  const dragged = findTile(drag.id);
  const r = el.getBoundingClientRect();
  const rx = (e.clientX - r.left) / r.width;
  const canNest = target && dragged && target.tile.type === 'folder' &&
    (dragged.tile.type !== 'folder' || !isInside(dragged.tile, target.tile.id));
  if (canNest && rx > 0.22 && rx < 0.78) return 'into';
  return rx < 0.5 ? 'before' : 'after';
}

// ---- hold a tile over the middle of another tile to make a folder of the two
const COMBINE_HOLD = 500; // ms; a quick pass or a drop near the edge still just moves the tile
function overMiddle(el, e) {
  const r = el.getBoundingClientRect();
  const rx = (e.clientX - r.left) / r.width;
  const ry = (e.clientY - r.top) / r.height;
  return rx > 0.2 && rx < 0.8 && ry > 0.2 && ry < 0.8;
}
// Called on every dragover with the tile under the pointer (or null). True once the hold is complete.
function combineArmed(el, e) {
  const target = el && el.dataset.id !== drag.id ? findTile(el.dataset.id) : null;
  const dragged = findTile(drag.id);
  const ok = target && dragged && target.tile.type !== 'folder' && dragged.tile.type !== 'folder' && overMiddle(el, e);
  if (!ok) { drag.hold = null; return false; }
  const now = performance.now();
  if (!drag.hold || drag.hold.id !== target.tile.id) drag.hold = { id: target.tile.id, since: now };
  return now - drag.hold.since >= COMBINE_HOLD;
}
function combineTiles(dragId, targetId) {
  const a = findTile(targetId);
  const b = findTile(dragId);
  if (!a || !b || a.tile.type === 'folder' || b.tile.type === 'folder') return;
  const snapshot = JSON.stringify(tiles);
  // the folder takes the target's spot and size, so nothing else on the screen moves
  const inFolder = !!a.parent;
  const shown = (inFolder ? folderSpots : lastSpots).get(a.tile.id);
  for (const x of a.list) { // keep everything else exactly where it is shown now
    const sp = (inFolder ? folderSpots : lastSpots).get(x.id);
    if (sp && x.id !== b.tile.id) x.pos = { g: sp.group, c: sp.col, r: sp.row };
  }
  const folder = {
    id: uid(), type: 'folder',
    title: `${a.tile.title} + ${b.tile.title}`.slice(0, 80),
    color: a.tile.color, size: a.tile.size, children: [],
    ...(shown ? { pos: { g: shown.group, c: shown.col, r: shown.row } } : a.tile.pos ? { pos: { ...a.tile.pos } } : {}),
  };
  a.list.splice(a.list.indexOf(a.tile), 1, folder);
  b.list.splice(b.list.indexOf(b.tile), 1);
  for (const t of [a.tile, b.tile]) { delete t.pos; folder.children.push(t); }
  commit();
  toast(`Made the folder “${folder.title}”`, { label: 'Undo', run: () => { tiles = JSON.parse(snapshot); commit(); } });
}
// ---- Folder drag and drop by position: the whole folder band takes the drop
const folderDragOK = () => {
  const f = drag && openFolderId && findFolder(openFolderId);
  return !!f && f.children.some(t => t.id === drag.id);
};
function folderSpotUnder(e) {
  const step = cellStep();
  const box = folderGrid.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(folderGrid).paddingLeft) || 0;
  const x = e.clientX - box.left - pad + folderGrid.scrollLeft;
  const y = e.clientY - box.top - pad + folderGrid.scrollTop;
  const t = findFolder(openFolderId).children.find(x2 => x2.id === drag.id);
  const [w] = tileDims(t, FOLDER_ROWS, folderCols);
  return {
    g: 0,
    c: Math.max(0, Math.min(folderCols - w, Math.floor(x / step) - drag.grabC)),
    r: Math.max(0, Math.floor(y / step) - drag.grabR),
  };
}
function showFolderGhost(sp) {
  let ghost = folderGrid.querySelector('.drop-ghost');
  if (!ghost) { ghost = h('div', { class: 'drop-ghost' }); folderGrid.append(ghost); }
  const t = findFolder(openFolderId).children.find(x => x.id === drag.id);
  const [w, hh] = tileDims(t, FOLDER_ROWS, folderCols);
  ghost.style.gridColumn = `${sp.c + 1} / span ${w}`;
  ghost.style.gridRow = `${sp.r + 1} / span ${hh}`;
}
const folderBand = $('#folder-band');
folderBand.addEventListener('dragover', e => {
  if (!folderDragOK()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearDropMarks();
  const el = e.target.closest && e.target.closest('#folder-grid .tile');
  if (combineArmed(el, e)) { el.classList.add('drop-combine'); return; }
  if (el && el.dataset.id !== drag.id && dropMode(el, e) === 'into') { el.classList.add('drop-into'); return; }
  showFolderGhost(folderSpotUnder(e));
});
folderBand.addEventListener('drop', e => {
  if (!folderDragOK()) return;
  e.preventDefault();
  e.stopPropagation();
  const id = drag.id;
  const el = e.target.closest && e.target.closest('#folder-grid .tile');
  if (combineArmed(el, e)) { clearDropMarks(); combineTiles(id, el.dataset.id); return; }
  const into = el && el.dataset.id !== id && dropMode(el, e) === 'into';
  const spot = into ? null : folderSpotUnder(e);
  clearDropMarks();
  if (into) moveTile(id, el.dataset.id);
  else placeTileAt(id, spot);
});

// ---- Start drag and drop by position. The whole Start area takes the drop, including the empty space
// to the right of the last group and below the tiles, and it scrolls sideways near the edges.
scroller.addEventListener('dragover', e => {
  if (!startDragOK()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearDropMarks();
  const edge = 70;
  const box = scroller.getBoundingClientRect();
  if (e.clientX > box.right - edge) scroller.scrollLeft += 18;
  else if (e.clientX < box.left + edge) scroller.scrollLeft -= 18;
  const el = e.target.closest && e.target.closest('#grid .tile');
  // held over the middle of a tile: make a folder; over the middle of a folder: file it inside;
  // anywhere else: show where it will land
  if (combineArmed(el, e)) { el.classList.add('drop-combine'); return; }
  if (el && el.dataset.id !== drag.id && dropMode(el, e) === 'into') { el.classList.add('drop-into'); return; }
  showGhost(spotUnder(e));
});
scroller.addEventListener('drop', e => {
  if (!startDragOK()) return;
  e.preventDefault();
  const id = drag.id;
  const el = e.target.closest && e.target.closest('#grid .tile');
  if (combineArmed(el, e)) { clearDropMarks(); combineTiles(id, el.dataset.id); return; }
  const intoFolder = el && el.dataset.id !== id && dropMode(el, e) === 'into';
  const spot = intoFolder ? null : spotUnder(e);
  clearDropMarks();
  if (intoFolder) moveTile(id, el.dataset.id);
  else placeTileAt(id, spot);
});
const startDragOK = () => !searchQuery && drag && tiles.some(t => t.id === drag.id);
function cellStep() {
  const unit = UNIT_PX[settings.tileScale] || 70;
  return unit + Math.round(unit / 7);
}
// The square under the pointer, adjusted for where the tile was grabbed
function spotUnder(e) {
  const unit = UNIT_PX[settings.tileScale] || 70;
  const gap = Math.round(unit / 7);
  const step = unit + gap;
  const groupStride = GROUP_COLS * step + gap + unit * 0.3; // four tiles, the spacer column and its gaps
  const cs = getComputedStyle(grid);
  const box = grid.getBoundingClientRect();
  const x = e.clientX - box.left - parseFloat(cs.paddingLeft);
  const y = e.clientY - box.top - parseFloat(cs.paddingTop);
  const g = Math.max(0, Math.floor(x / groupStride));
  const c = Math.min(GROUP_COLS - 1, Math.max(0, Math.floor((x - g * groupStride) / step)));
  const r = Math.max(0, Math.floor(y / step));
  const t = tiles.find(x2 => x2.id === drag.id);
  const [w, hh] = tileDims(t, startRows);
  return {
    g,
    c: Math.max(0, Math.min(GROUP_COLS - w, c - drag.grabC)),
    r: Math.max(0, Math.min(startRows - hh, r - drag.grabR)),
  };
}
function showGhost(sp) {
  let ghost = grid.querySelector('.drop-ghost');
  if (!ghost) { ghost = h('div', { class: 'drop-ghost' }); grid.append(ghost); }
  const t = tiles.find(x => x.id === drag.id);
  const [w, hh] = tileDims(t, startRows);
  ghost.style.gridColumn = `${sp.g * (GROUP_COLS + 1) + sp.c + 1} / span ${w}`;
  ghost.style.gridRow = `${sp.r + 1} / span ${hh}`;
  // the grid may need a new group on the right for the outline to show
  const groupsNow = (grid.style.gridTemplateColumns.match(/repeat/g) || []).length;
  if (sp.g + 1 > groupsNow) {
    const cols = [];
    for (let g = 0; g <= sp.g; g++) cols.push(`repeat(${GROUP_COLS}, var(--unit))`, g < sp.g ? 'calc(var(--unit) * .3)' : '');
    grid.style.gridTemplateColumns = cols.filter(Boolean).join(' ');
  }
}
function clearDropMarks() {
  document.querySelectorAll('.drop-ghost').forEach(x => x.remove());
  document.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-combine').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-combine'));
}

// ---------------------------------------------------------------- context menu
// Items: '-' (separator), {header}, {sizes, current, onPick}, {label, action, danger}, or {label, sub: [items]} for a submenu.
// Each level is its own panel inside #ctx; a submenu opens beside its item on hover, click or →, and ← or Esc closes it.
let subTimer = 0;
function menuPanels() { return [...ctx.querySelectorAll('.ctx-panel')]; }
function closeSubs(level) {
  for (const p of menuPanels()) if (+p.dataset.level >= level) p.remove();
  ctx.querySelectorAll(`.ctx-panel[data-level="${level - 1}"] .has-sub`).forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function placePanel(panel, x, y, flipLeft) {
  panel.style.left = '0px';
  panel.style.top = '0px';
  const r = panel.getBoundingClientRect();
  let left = x;
  if (left + r.width > innerWidth - 8) left = flipLeft != null ? flipLeft - r.width : innerWidth - r.width - 8;
  panel.style.left = Math.max(8, left) + 'px';
  panel.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
function openSub(btn, items, level, focus) {
  clearTimeout(subTimer);
  if (btn.getAttribute('aria-expanded') === 'true') {
    if (focus) ctx.querySelector(`.ctx-panel[data-level="${level}"] .ctx-item`)?.focus({ preventScroll: true });
    return;
  }
  closeSubs(level);
  btn.setAttribute('aria-expanded', 'true');
  const panel = buildPanel(items, level);
  ctx.append(panel);
  const pr = btn.closest('.ctx-panel').getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  placePanel(panel, pr.right - 3, br.top - 7, pr.left + 3);
  if (focus) panel.querySelector('.ctx-item')?.focus({ preventScroll: true });
}
function buildPanel(items, level) {
  const panel = h('div', { class: 'ctx-panel', role: 'menu', dataset: { level: String(level) } });
  panel.addEventListener('pointerenter', () => clearTimeout(subTimer));
  panel.append(...items.map(it => {
    if (it === '-') return h('div', { class: 'ctx-sep' });
    if (it.header) return h('div', { class: 'ctx-header' }, it.header);
    if (it.sizes) {
      return h('div', { class: 'ctx-sizes' },
        h('span', { class: 'ctx-sizes-label' }, 'Size'),
        Object.keys(SIZES).map(s => h('button', {
          type: 'button', class: 'ctx-size' + (s === it.current ? ' on' : ''), title: SIZE_NAMES[s], 'aria-label': SIZE_NAMES[s],
          html: `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">${SIZE_GLYPHS[s]}</svg>`,
          onclick: () => { hideMenu(); it.onPick(s); },
        })));
    }
    if (it.sub) {
      const b = h('button', {
        type: 'button', role: 'menuitem', class: 'ctx-item has-sub', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
        onclick: () => openSub(b, it.sub, level + 1, true),
      }, h('span', {}, it.label), h('span', { class: 'ctx-arrow', 'aria-hidden': 'true' }, '›'));
      b.addEventListener('pointerenter', () => { clearTimeout(subTimer); subTimer = setTimeout(() => openSub(b, it.sub, level + 1, false), 160); });
      return b;
    }
    const b = h('button', {
      type: 'button', role: 'menuitem', class: 'ctx-item' + (it.danger ? ' danger' : ''),
      onclick: () => { hideMenu(); it.action(); },
    }, it.label);
    // pointing at another item closes an open submenu after a short pause (so a diagonal move into the submenu still works)
    b.addEventListener('pointerenter', () => { clearTimeout(subTimer); subTimer = setTimeout(() => closeSubs(level + 1), 250); });
    return b;
  }));
  panel.addEventListener('keydown', e => {
    const list = [...panel.querySelectorAll(':scope > .ctx-item')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = list.length;
      if (n) list[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus({ preventScroll: true });
    } else if (e.key === 'ArrowRight' && document.activeElement?.classList.contains('has-sub')) {
      e.preventDefault();
      document.activeElement.click();
    } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && level > 0) {
      e.preventDefault();
      e.stopPropagation();
      const parent = ctx.querySelector(`.ctx-panel[data-level="${level - 1}"] .has-sub[aria-expanded="true"]`);
      closeSubs(level);
      parent?.focus({ preventScroll: true });
    }
  });
  return panel;
}
function showMenu(x, y, items) {
  clearTimeout(subTimer);
  const panel = buildPanel(items, 0);
  ctx.replaceChildren(panel);
  ctx.hidden = false;
  placePanel(panel, x, y);
  const first = panel.querySelector('.ctx-item');
  if (first) first.focus({ preventScroll: true });
}
function hideMenu() { clearTimeout(subTimer); ctx.hidden = true; ctx.replaceChildren(); }

function addMenu(x, y, parentId = null) {
  showMenu(x, y, [
    { label: 'Add a tile', action: () => openEditor({ type: 'link', parentId }) },
    { label: 'Add a folder', action: () => openEditor({ type: 'folder', parentId }) },
    { label: 'Add a news feed', sub: feedMenuItems(parentId) },
    { label: 'Add a game', sub: gameItems(parentId) },
    ...(parentId ? [] : [{ label: 'Import bookmarks…', action: openBookmarkImport }]),
    '-',
    { label: 'Personalize…', action: openSettings },
  ]);
}

function gameItems(parentId) {
  return [{ label: 'All games (Games folder)', action: restoreGames }, '-', { header: 'Add one game' }, ...Object.entries(Games.LIST).map(([id, g]) => ({
    label: g.title,
    action: () => {
      const t = gameTile(id);
      const parent = findFolder(parentId);
      (parent ? parent.children : tiles).push(t);
      commit();
      toast(`Added ${g.title}`);
    },
  }))];
}

// "Move to" items as a tree that follows your folders: a folder with subfolders opens a submenu
// whose first item moves the tile into that folder itself
function moveItems(t, f, up) {
  const skip = folder => t.type === 'folder' && isInside(t, folder.id); // a folder can't go into itself or its own subfolders
  const canGo = folder => folder !== f.parent && folder !== up;
  const node = folder => {
    if (skip(folder)) return null;
    const name = folder.title || 'Folder';
    const kids = folder.children.filter(c => c.type === 'folder').map(node).filter(Boolean);
    const here = canGo(folder) ? { label: name, action: () => moveTile(t.id, folder.id) } : null;
    if (!kids.length) return here;
    return { label: name, sub: [...(here ? [{ label: `Into “${name}”`, action: here.action }, '-'] : []), ...kids] };
  };
  const out = [];
  if (f.parent && pathTo(f.parent.id).length) out.push({ label: 'Start', action: () => moveTile(t.id, null) });
  const folders = tiles.filter(c => c.type === 'folder').map(node).filter(Boolean);
  if (out.length && folders.length) out.push('-');
  return [...out, ...folders];
}

function tileMenu(e, folderId) {
  e.preventDefault();
  const el = e.target.closest('.tile');
  const x = e.clientX || (el ? el.getBoundingClientRect().left + 20 : 40);
  const y = e.clientY || (el ? el.getBoundingClientRect().top + 20 : 40);
  if (!el) { addMenu(x, y, folderId); return; }
  const f = findTile(el.dataset.id);
  if (!f) return;
  const t = f.tile;
  const items = [];
  if (t.type === 'folder') items.push({ label: 'Open', action: () => openFolder(t.id) });
  else if (t.type === 'game') items.push({ label: 'Play', action: () => openGame(t.game) });
  else if (t.type === 'feed') {
    const top = feedTop(t);
    if (top) items.push({ label: 'Open top story', action: () => { Feeds.markSeen(t.url); openUrl(top.link, false); } });
    items.push({ label: 'All headlines', action: () => openHeadlines(t.id) });
    if (t.size !== 'small') {
      items.push({ label: 'Style', sub: [
        { label: (t.style === 'list' ? '✓ ' : '    ') + 'Headlines', action: () => { t.style = 'list'; commit(); } },
        { label: (t.style !== 'list' ? '✓ ' : '    ') + 'Top story', action: () => { t.style = 'top'; commit(); } },
      ] });
    }
    items.push({ label: 'Open site', action: () => openUrl(feedHome(t), false) });
  }
  else items.push({ label: 'Open in new tab', action: () => openUrl(t.url, true) });
  items.push({ label: 'Edit…', action: () => openEditor({ tile: t }) });
  items.push({ sizes: true, current: t.size, onPick: s => { t.size = s; const sp = (f.parent ? folderSpots : lastSpots).get(t.id); if (sp) placeTileAt(t.id, { g: sp.group, c: sp.col, r: sp.row }); else commit(); } });
  const up = f.parent ? findTile(f.parent.id).parent : null;
  if (f.parent) items.push({ label: up ? `Move up to “${up.title}”` : 'Move out of folder', action: () => moveTile(t.id, up ? up.id : null) });
  const moves = moveItems(t, f, up);
  if (moves.length) items.push({ label: 'Move to folder', sub: moves });
  items.push('-', { label: t.type === 'folder' ? 'Delete folder' : 'Delete', danger: true, action: () => deleteTile(t.id) });
  showMenu(x, y, items);
}

// ---------------------------------------------------------------- folders
function openFolder(id) {
  hideMenu();
  openFolderId = id;
  folderOverlay.hidden = false; // so the folder can measure its width
  renderFolder({ animate: true });
  openOverlay(folderOverlay);
}
function renderFolder({ animate = false } = {}) {
  const f = findFolder(openFolderId);
  if (!f) { closeFolder(); return; }
  const path = pathTo(f.id);
  const crumbs = $('#folder-crumbs');
  crumbs.hidden = !path.length;
  crumbs.replaceChildren(...[{ id: null, title: 'Start' }, ...path].flatMap(p => [
    h('button', { type: 'button', class: 'crumb', onclick: () => (p.id ? openFolder(p.id) : closeFolder()) }, p.title),
    h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›'),
  ]));
  const parent = path[path.length - 1];
  $('#folder-out-tip').textContent = `Drag a tile outside this band to move it ${parent ? `to “${parent.title}”` : 'back to Start'}.`;
  if (document.activeElement !== folderTitle) folderTitle.value = f.title;
  $('#folder-band').style.setProperty('--folder-color', f.color);
  const els = f.children.map(t => tileEl(t));
  folderGrid.replaceChildren(...els);
  placeInFolder(els, f.children);
  $('#folder-empty').hidden = f.children.length > 0;
  if (animate && settings.animations) entrance(folderGrid);
}
function closeFolder() {
  openFolderId = null;
  closeOverlay(folderOverlay);
}

// Esc and the overlay backdrop go up one level; Done closes
function folderBack() {
  const parent = openFolderId && findTile(openFolderId) && findTile(openFolderId).parent;
  if (parent) openFolder(parent.id);
  else closeFolder();
}

folderTitle.addEventListener('change', () => {
  const f = findFolder(openFolderId);
  if (!f) return;
  f.title = folderTitle.value.trim() || 'Folder';
  folderTitle.value = f.title;
  commit();
});
folderTitle.addEventListener('keydown', e => { if (e.key === 'Enter') folderTitle.blur(); });
$('#folder-close').addEventListener('click', closeFolder);
$('#folder-add').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  addMenu(r.left, r.bottom + 6, openFolderId);
});
folderOverlay.addEventListener('click', e => { if (e.target === folderOverlay) folderBack(); });
// dragging a tile onto the dimmed area outside the band moves it back to Start
folderOverlay.addEventListener('dragover', e => {
  if (drag && e.target === folderOverlay) { e.preventDefault(); folderOverlay.classList.add('drop-out'); }
});
folderOverlay.addEventListener('dragleave', e => { if (e.target === folderOverlay) folderOverlay.classList.remove('drop-out'); });
folderOverlay.addEventListener('drop', e => {
  folderOverlay.classList.remove('drop-out');
  if (drag && e.target === folderOverlay) {
    e.preventDefault();
    const f = findTile(drag.id);
    const open = findTile(openFolderId);
    const parent = open && open.parent;
    moveTile(drag.id, parent ? parent.id : null);
    if (f) toast(`Moved “${f.tile.title}” to ${parent ? `“${parent.title}”` : 'Start'}`);
  }
});

// ---------------------------------------------------------------- editor
const ed = {
  overlay: $('#editor-overlay'), form: $('#editor'), heading: $('#ed-heading'),
  typeField: $('#ed-type-field'), type: $('#ed-type'), title: $('#ed-title'),
  urlField: $('#ed-url-field'), url: $('#ed-url'), size: $('#ed-size'), colors: $('#ed-colors'),
  iconField: $('#ed-icon-field'), iconMode: $('#ed-icon-mode'), imageRow: $('#ed-image-row'),
  imageUrl: $('#ed-image-url'), imageUpload: $('#ed-image-upload'), imageFile: $('#ed-image-file'),
  imageFill: $('#ed-image-fill'), preview: $('#ed-preview'), cancel: $('#ed-cancel'), colorCustom: null,
  feedStyleField: $('#ed-feed-style-field'), feedStyle: $('#ed-feed-style'), urlLabel: $('#ed-url-label'), feedPresets: $('#ed-feed-presets'), feedStatus: $('#ed-feed-status'), save: $('#ed-save'),
};
let editing = null;

function setSeg(segEl, value) {
  segEl.querySelectorAll('button[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(value))));
}
function onSeg(segEl, fn) {
  segEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    setSeg(segEl, b.dataset.value);
    fn(b.dataset.value);
  });
}

function buildSwatches(container, colors, onPick) {
  container.replaceChildren(...colors.map(c => h('button', {
    type: 'button', class: 'swatch', style: { background: c }, dataset: { color: c }, title: c, 'aria-label': `Color ${c}`,
    onclick: () => onPick(c),
  })));
  const custom = h('input', { type: 'color', title: 'Pick any color', 'aria-label': 'Pick any color' });
  custom.addEventListener('input', () => onPick(custom.value));
  container.append(custom);
  return custom;
}
function markSwatch(container, color) {
  container.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.color.toLowerCase() === String(color).toLowerCase())));
}

function openEditor({ tile = null, type = 'link', parentId = null } = {}) {
  hideMenu();
  const draft = tile ? structuredClone(tile) : {
    type, title: '', size: 'medium', color: PALETTE[Math.floor(Math.random() * (PALETTE.length - 1))],
    ...(type === 'folder' ? { children: [] } : { url: '', icon: { mode: 'favicon' } }),
    ...(type === 'feed' ? { size: 'large', style: 'list' } : {}),
  };
  if (!draft.icon) draft.icon = { mode: 'favicon' };
  if (!draft.children) draft.children = [];
  const found = tile && findTile(tile.id);
  editing = { draft, id: tile ? tile.id : null, parentId: found && found.parent ? found.parent.id : parentId };

  ed.heading.textContent = tile ? (tile.type === 'folder' ? 'Edit folder' : tile.type === 'game' ? 'Edit game tile' : tile.type === 'feed' ? 'Edit news feed' : 'Edit tile') : (type === 'folder' ? 'New folder' : type === 'feed' ? 'Add a news feed' : 'Add a tile');
  feedStatus('');
  ed.typeField.hidden = !!tile;
  ed.title.value = draft.title || '';
  ed.url.value = draft.url || '';
  ed.url.classList.remove('invalid');
  const src = draft.icon.mode === 'image' ? String(draft.icon.src || '') : '';
  ed.imageUrl.value = src.startsWith('data:') ? '' : src;
  ed.imageUrl.placeholder = src.startsWith('data:') ? 'Using your uploaded picture' : 'Paste a picture URL, or upload one';
  ed.imageFill.checked = !!draft.icon.fill;
  syncEditor();
  openOverlay(ed.overlay);
  setTimeout(() => ((draft.type === 'link' || draft.type === 'feed') && !tile ? ed.url : ed.title).focus(), 50);
}

function feedStatus(text, action) {
  ed.feedStatus.hidden = !text;
  ed.feedStatus.replaceChildren(text || '', action ? ' ' : '', action ? h('button', { type: 'button', class: 'btn btn-sm', onclick: action.run }, action.label) : '');
}
ed.feedPresets.append(...Feeds.PRESETS.map(p => h('button', {
  type: 'button', class: 'chip', onclick: () => {
    if (!editing) return;
    ed.url.value = p.feed;
    if (!ed.title.value.trim()) ed.title.value = p.name;
    editing.draft.color = p.color;
    editing.draft.site = p.site;
    markSwatch(ed.colors, p.color);
    feedStatus('');
    renderPreview();
  },
}, p.name)));

function syncEditor() {
  const d = editing.draft;
  setSeg(ed.type, d.type);
  setSeg(ed.size, d.size);
  setSeg(ed.feedStyle, d.style || 'top');
  ed.urlField.hidden = d.type !== 'link' && d.type !== 'feed';
  ed.iconField.hidden = d.type !== 'link';
  ed.urlLabel.textContent = d.type === 'feed' ? 'Site or feed address' : 'Web address';
  ed.url.placeholder = d.type === 'feed' ? 'bbc.com, or a feed’s address' : 'youtube.com';
  ed.feedPresets.hidden = d.type !== 'feed' || !!editing.id;
  ed.feedStyleField.hidden = d.type !== 'feed';
  setSeg(ed.feedStyle, d.style || 'top');
  setSeg(ed.iconMode, d.icon.mode);
  ed.imageRow.hidden = d.icon.mode !== 'image';
  markSwatch(ed.colors, d.color);
  if (/^#[0-9a-f]{6}$/i.test(d.color)) ed.colorCustom.value = d.color;
  renderPreview();
}

function renderPreview() {
  if (!editing) return; // the editor closed before a delayed preview update ran
  const d = editing.draft;
  const url = normalizeUrl(ed.url.value);
  const shown = {
    ...d,
    url: url || 'https://example.com',
    title: ed.title.value.trim() || (d.type === 'folder' ? 'Folder' : d.type === 'game' ? Games.LIST[d.game].title : d.type === 'feed' ? (url ? prettyName(url) : 'News') : url ? prettyName(url) : 'New tile'),
  };
  ed.preview.replaceChildren(tileEl(shown, { preview: true }));
}
const renderPreviewSoon = debounce(renderPreview, 250);

function closeEditor() {
  closeOverlay(ed.overlay);
  editing = null;
}

ed.colorCustom = buildSwatches(ed.colors, PALETTE, c => { editing.draft.color = c; markSwatch(ed.colors, c); renderPreview(); });
onSeg(ed.type, v => {
  editing.draft.type = v;
  ed.heading.textContent = v === 'folder' ? 'New folder' : v === 'feed' ? 'Add a news feed' : 'Add a tile';
  if (v === 'feed' && editing.draft.size === 'medium') { editing.draft.size = 'large'; setSeg(ed.size, 'large'); }
  if (v === 'feed' && !editing.draft.style) editing.draft.style = 'list';
  if (!editing.draft.icon) editing.draft.icon = { mode: 'favicon' };
  feedStatus('');
  syncEditor();
  (v === 'folder' ? ed.title : ed.url).focus();
});
onSeg(ed.size, v => { editing.draft.size = v; renderPreview(); });
onSeg(ed.feedStyle, v => { editing.draft.style = v; renderPreview(); });
onSeg(ed.iconMode, v => { editing.draft.icon.mode = v; syncEditor(); });
ed.title.addEventListener('input', renderPreview);
ed.url.addEventListener('input', () => { ed.url.classList.remove('invalid'); if (editing) delete editing.draft.site; feedStatus(''); renderPreviewSoon(); });
ed.imageUrl.addEventListener('input', () => {
  const d = editing.draft;
  d.icon.src = normalizeUrl(ed.imageUrl.value);
  d.icon.mode = 'image';
  renderPreviewSoon();
});
ed.imageFill.addEventListener('change', () => { editing.draft.icon.fill = ed.imageFill.checked; renderPreview(); });
ed.imageUpload.addEventListener('click', async () => {
  const file = await pickFile(ed.imageFile);
  if (!file || !editing) return;
  try {
    editing.draft.icon.src = await readImage(file, 320);
    editing.draft.icon.mode = 'image';
    ed.imageUrl.value = '';
    ed.imageUrl.placeholder = 'Using your uploaded picture';
    syncEditor();
  } catch (err) { toast(err.message); }
});
ed.cancel.addEventListener('click', closeEditor);
ed.overlay.addEventListener('click', e => { if (e.target === ed.overlay) closeEditor(); });

ed.form.addEventListener('submit', e => {
  e.preventDefault();
  const d = editing.draft;
  d.title = ed.title.value.trim();
  if (d.type === 'feed') { saveFeedFromEditor(); return; }
  if (d.type === 'link') {
    d.url = normalizeUrl(ed.url.value);
    if (!d.url || (!hostOf(d.url) && !SPECIAL_SCHEME.test(d.url))) {
      ed.url.classList.add('invalid');
      ed.url.focus();
      toast('Enter a web address, like youtube.com');
      return;
    }
    d.title = d.title || prettyName(d.url);
    if (d.icon.mode === 'image' && !d.icon.src) d.icon.mode = 'favicon';
    if (d.icon.mode !== 'image') { delete d.icon.src; delete d.icon.fill; }
    delete d.children;
    delete d.live;
  } else if (d.type === 'game') {
    d.title = d.title || Games.LIST[d.game].title;
    delete d.url;
    delete d.icon;
    delete d.children;
  } else {
    d.title = d.title || 'Folder';
    delete d.url;
    delete d.icon;
  }

  const { id: editId, parentId } = editing;
  const original = editId && findTile(editId);
  if (d.icon && original && hostOf(original.tile.url) !== hostOf(d.url)) delete d.icon.siteIcon;
  saveEditedTile(d, editId, parentId);
});

// A news feed: get Chrome's OK for the site (straight from the click), find its feed, then save the tile
function saveFeedFromEditor() {
  const state = editing;
  const d = state.draft;
  const url = normalizeUrl(ed.url.value);
  if (!hostOf(url)) {
    ed.url.classList.add('invalid');
    ed.url.focus();
    toast('Enter a site or feed address, like bbc.com');
    return;
  }
  const original = state.id && findTile(state.id);
  const finish = feed => {
    if (editing !== state) return;
    d.url = feed.feed;
    d.site = d.site || feed.site || '';
    d.title = d.title || feed.title || prettyName(url);
    delete d.icon;
    delete d.children;
    feedStatus('');
    ed.save.disabled = false;
    saveEditedTile(d, state.id, state.parentId);
    updateFeedTiles(d.url);
  };
  // editing an existing feed tile without changing its address: nothing to look up
  if (original && original.tile.url === url) { finish({ feed: url, site: original.tile.site }); return; }
  const lookUp = async () => {
    feedStatus('Looking for the news feed…');
    ed.save.disabled = true;
    try {
      const feed = await Feeds.discover(url);
      await Feeds.remember(feed.feed, feed);
      finish(feed);
    } catch (err) {
      if (editing !== state) return;
      ed.save.disabled = false;
      if (err.needs) {
        feedStatus(err.message, {
          label: `Allow ${hostOf(err.needs)}`,
          run: () => chrome.permissions.request({ origins: Feeds.originsFor(err.needs) }).then(ok => (ok ? lookUp() : feedStatus('Chrome needs your OK to read that feed.')), () => {}),
        });
      } else feedStatus(err.message || 'Couldn’t read that feed.');
    }
  };
  if (!hasChrome || !chrome.permissions) { lookUp(); return; }
  chrome.permissions.request({ origins: Feeds.originsFor(url) }).then(ok => {
    if (ok) lookUp();
    else feedStatus('Chrome needs your OK for this tile to read the site.');
  }, () => feedStatus('Chrome needs your OK for this tile to read the site.'));
}

function saveEditedTile(d, editId, parentId) {
  let newFolderId = null;
  if (editId) {
    const f = findTile(editId);
    if (f) {
      d.id = editId;
      f.list[f.list.indexOf(f.tile)] = d;
      const sp = d.size !== f.tile.size && (f.parent ? folderSpots : lastSpots).get(d.id);
      if (sp) { closeEditor(); placeTileAt(d.id, { g: sp.group, c: sp.col, r: sp.row }); return; }
    }
  } else {
    d.id = uid();
    const parent = findFolder(parentId);
    (parent ? parent.children : tiles).push(d);
    if (d.type === 'folder') newFolderId = d.id;
  }
  closeEditor();
  commit();
  if (newFolderId) openFolder(newFolderId);
  else if (!openFolderId) requestAnimationFrame(() => {
    const el = grid.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  });
}

// ---------------------------------------------------------------- clock & weather
const timeEl = $('#time');
const dateEl = $('#date');
let lastMinute = -1;
const clockWidget = $('#clock-widget');
const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
// Your own time first, then the extra clocks (one that matches your own time zone is skipped)
const clockList = () => [{ tz: '', name: '' }, ...settings.clocks.filter(c => c.tz !== LOCAL_TZ)];
let clockIndex = 0;
const TZ_ABBR = { 'Asia/Kolkata': 'IST', 'Asia/Calcutta': 'IST' };
function tzAbbr(tz, date = new Date()) {
  if (TZ_ABBR[tz]) return TZ_ABBR[tz];
  try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date).find(p => p.type === 'timeZoneName').value; } catch { return ''; }
}

function tickClock(force = false) {
  const now = new Date();
  if (!force && now.getMinutes() === lastMinute) return;
  lastMinute = now.getMinutes();
  const list = clockList();
  if (clockIndex >= list.length) clockIndex = 0;
  const c = list[clockIndex];
  const zone = c.tz ? { timeZone: c.tz } : {};
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: settings.clock24 ? '2-digit' : 'numeric',
    minute: '2-digit',
    hourCycle: settings.clock24 ? 'h23' : 'h12',
    ...zone,
  }).formatToParts(now);
  const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
  const period = (parts.find(p => p.type === 'dayPeriod') || {}).value || '';
  timeEl.replaceChildren(time, period ? h('span', { class: 'ampm' }, period) : '');
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...zone });
  if (c.tz) {
    const abbr = tzAbbr(c.tz, now);
    const label = abbr && abbr !== c.name ? `${c.name} (${abbr})` : c.name;
    dateEl.replaceChildren(h('span', { class: 'clock-place' }, label), h('span', { class: 'clock-date' }, date));
  } else dateEl.textContent = date;
  clockWidget.classList.toggle('remote', !!c.tz);
  clockWidget.title = list.length > 1 ? 'Scroll to see your other clocks' : '';
  cycleDots($('#clock-dots'), list.length, clockIndex, i => { clockIndex = i; tickClock(true); });
}

// ---- switching clocks and weather places with the mouse wheel (or arrow keys when focused)
function cycleDots(el, n, index, pick) {
  el.hidden = n < 2;
  if (n < 2) { el.replaceChildren(); return; }
  el.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', { class: 'cycle-dot' + (i === index ? ' on' : ''), onclick: e => { e.stopPropagation(); pick(i); } })));
}
function onCycle(el, count, step) {
  let acc = 0;
  let lock = 0;
  el.addEventListener('wheel', e => {
    if (count() < 2) return;
    e.preventDefault();
    if (performance.now() < lock) return;
    const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * (e.deltaMode === 1 ? 30 : e.deltaMode === 2 ? 300 : 1);
    acc += d;
    if (Math.abs(acc) < 40) return; // trackpads send many small steps; one notch of a wheel is about 100
    step(acc > 0 ? 1 : -1);
    acc = 0;
    lock = performance.now() + 220;
  }, { passive: false });
  el.addEventListener('keydown', e => {
    if (count() < 2) return;
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (dir) { e.preventDefault(); step(dir); }
  });
}
onCycle(clockWidget, () => clockList().length, dir => {
  const n = clockList().length;
  clockIndex = (clockIndex + dir + n) % n;
  tickClock(true);
});

let weatherTimer = null;
// Your main location first, then the extra weather places
const placeList = () => [null, ...settings.places];
let placeIndex = 0;
let weatherRun = 0;
async function refreshWeather(force = false) {
  clearTimeout(weatherTimer);
  if (!settings.showWeather || settings.widgetPos === 'hidden') return;
  const places = placeList();
  if (placeIndex >= places.length) placeIndex = 0;
  const run = ++weatherRun;
  weatherWidget.classList.add('loading');
  cycleDots($('#weather-dots'), places.length, placeIndex, i => { placeIndex = i; refreshWeather(); });
  weatherWidget.title = places.length > 1 ? 'Scroll to see your other weather places' : 'Weather';
  try {
    const w = await Weather.get(settings, { force, place: places[placeIndex] });
    if (run !== weatherRun) return; // the person already scrolled on to another place
    const d = Weather.describe(w.code, w.isDay);
    $('#w-icon').innerHTML = Weather.icon(d.icon);
    $('#w-temp').textContent = `${w.temp}°`;
    $('#w-desc').textContent = d.text;
    $('#w-range').textContent = `High ${w.hi}°, low ${w.lo}°`;
    $('#w-place').textContent = w.place || '';
    weatherWidget.dataset.place = w.place || '';
    if (places.length < 2) weatherWidget.title = w.place ? `Weather for ${w.place}` : 'Weather';
  } catch (err) {
    if (run !== weatherRun) return;
    console.info('Weather unavailable:', err && err.message);
    $('#w-icon').innerHTML = Weather.icon('cloud');
    $('#w-temp').textContent = '--°';
    $('#w-desc').textContent = 'Weather unavailable';
    $('#w-range').textContent = (err && err.message) || '';
    $('#w-place').textContent = 'Select to try again';
    weatherWidget.title = 'Try again';
    weatherWidget.dataset.place = '';
  } finally {
    if (run === weatherRun) {
      weatherWidget.classList.remove('loading');
      weatherTimer = setTimeout(() => refreshWeather(), 30 * 60 * 1000);
    }
  }
}
onCycle(weatherWidget, () => placeList().length, dir => {
  const n = placeList().length;
  placeIndex = (placeIndex + dir + n) % n;
  refreshWeather();
});

weatherWidget.addEventListener('click', () => {
  const place = weatherWidget.dataset.place;
  if (place) webSearch(`weather ${place}`);
  else if ($('#w-desc').textContent === 'Weather unavailable') refreshWeather(true);
  else openSettings();
});

// ---------------------------------------------------------------- settings
const set = {
  name: $('#set-name'), title: $('#set-title'), bgSwatches: $('#set-bg-swatches'), bgUpload: $('#set-bg-upload'),
  bgFile: $('#set-bg-file'), bgClear: $('#set-bg-clear'), bgUrl: $('#set-bg-url'), dim: $('#set-dim'), dimVal: $('#set-dim-val'),
  scale: $('#set-scale'), anim: $('#set-anim'), flip: $('#set-flip'), parallax: $('#set-parallax'), font: $('#set-font'), pos: $('#set-pos'), clock: $('#set-clock'), weather: $('#set-weather'),
  units: $('#set-units'), news: $('#set-news'), newsTopic: $('#set-news-topic'), newsFeed: $('#set-news-feed'),
  stocks: $('#set-stocks'), stockSymbols: $('#set-stock-symbols'), locCurrent: $('#set-loc-current'), locAuto: $('#set-loc-auto'), city: $('#set-city'),
  cityResults: $('#set-city-results'), exportBtn: $('#set-export'), importBtn: $('#set-import'),
  importFile: $('#set-import-file'), reset: $('#set-reset'), bgCustom: null,
};

function applySettings() {
  const s = settings;
  document.documentElement.style.setProperty('--bg', s.bg.color);
  $('#bg').style.backgroundImage = s.bg.image ? `url("${s.bg.image.replace(/["\\]/g, '\\$&')}")` : 'none';
  const credit = $('#bg-credit');
  const cr = s.bg.image && s.bg.credit;
  credit.hidden = !cr;
  if (cr) {
    credit.textContent = [cr.title, cr.author && `by ${cr.author}`, cr.license].filter(Boolean).join(' · ');
    credit.href = cr.page || 'https://commons.wikimedia.org/';
    credit.title = 'See this picture on Wikimedia Commons';
  }
  $('#bg-dim').style.opacity = s.bg.image ? s.bg.dim / 100 : 0;
  $('#start-title').hidden = !s.showTitle;
  $('#user').hidden = !s.userName.trim();
  $('#user-name').textContent = s.userName.trim();
  $('#avatar').textContent = s.userName.trim().charAt(0).toUpperCase();
  infoBar.dataset.pos = s.widgetPos;
  infoBar.hidden = s.widgetPos === 'hidden';
  weatherWidget.hidden = !s.showWeather;
  renderWidgets();
  document.body.classList.toggle('no-anim', !s.animations);
  applyFont(s.font);
  layoutGrid();
  updateParallax();
  tickClock(true);
}

// Nunito is loaded from Google Fonts only when the Rounded font is chosen; offline it falls back to the system font
function applyFont(font) {
  const rounded = font !== 'metro';
  document.documentElement.classList.toggle('font-rounded', rounded);
  if (rounded && !document.getElementById('font-nunito')) {
    document.head.append(
      h('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }),
      h('link', { id: 'font-nunito', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700&display=swap' }));
    // grid rows and entrance positions depend on text metrics, so re-measure once the font arrives
    document.fonts.ready.then(() => layoutGrid());
  }
}

function syncSettingsUI() {
  renderPlaceSettings();
  const s = settings;
  set.name.value = s.userName;
  set.title.checked = s.showTitle;
  markSwatch(set.bgSwatches, s.bg.image ? '' : s.bg.color);
  if (/^#[0-9a-f]{6}$/i.test(s.bg.color)) set.bgCustom.value = s.bg.color;
  set.bgUrl.value = s.bg.image.startsWith('data:') ? '' : s.bg.image;
  set.bgUrl.placeholder = s.bg.image.startsWith('data:') ? 'Using your uploaded picture' : 'https://…/wallpaper.jpg';
  set.bgClear.hidden = !s.bg.image;
  set.dim.value = s.bg.dim;
  set.dimVal.textContent = s.bg.dim + '%';
  setSeg(set.scale, s.tileScale);
  set.anim.checked = s.animations;
  set.flip.checked = s.flipOpen;
  set.parallax.checked = s.parallax;
  try { $('#set-version').textContent = `Metro Start ${chrome.runtime.getManifest().version}`; } catch { $('#set-version').textContent = 'Metro Start (preview)'; }
  setSeg(set.font, s.font);
  setSeg(set.pos, s.widgetPos);
  setSeg(set.clock, s.clock24 ? '24' : '12');
  set.weather.checked = s.showWeather;
  setSeg(set.units, s.units);
  set.news.checked = s.showNews;
  set.newsTopic.value = s.newsTopic;
  set.newsFeed.hidden = s.newsTopic !== 'custom';
  if (document.activeElement !== set.newsFeed) set.newsFeed.value = s.newsFeed;
  set.stocks.checked = s.showStocks;
  if (document.activeElement !== set.stockSymbols) set.stockSymbols.value = s.stocks.join(', ');
  set.locCurrent.textContent = s.location.mode === 'manual' && s.location.name
    ? `Showing weather for ${s.location.name}.`
    : 'Showing weather for your current location.';
}

function updateSetting(mutator, { weather = false } = {}) {
  mutator(settings);
  applySettings();
  syncSettingsUI();
  saveSettings();
  if (weather) refreshWeather(true);
}

function openSettings() {
  hideMenu();
  syncSettingsUI();
  settingsScrim.hidden = false;
  settingsPanel.classList.add('open');
  setTimeout(() => $('#set-close').focus(), 60);
}
function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsScrim.hidden = true;
}

set.bgCustom = buildSwatches(set.bgSwatches, BACKGROUNDS, c => updateSetting(s => { s.bg.color = c; s.bg.image = ''; s.bg.credit = null; }));
set.name.addEventListener('input', () => { settings.userName = set.name.value; applySettings(); saveSettingsSoon(); });
set.title.addEventListener('change', () => updateSetting(s => { s.showTitle = set.title.checked; }));
set.bgUpload.addEventListener('click', async () => {
  const file = await pickFile(set.bgFile);
  if (!file) return;
  try {
    const data = await readImage(file, 2560, 'image/jpeg', 0.86);
    updateSetting(s => { s.bg.image = data; s.bg.credit = null; });
  } catch (err) { toast(err.message); }
});
set.bgClear.addEventListener('click', () => updateSetting(s => { s.bg.image = ''; s.bg.credit = null; }));
set.bgUrl.addEventListener('change', () => {
  const v = set.bgUrl.value.trim();
  if (v) updateSetting(s => { s.bg.image = normalizeUrl(v); s.bg.credit = null; });
});
set.dim.addEventListener('input', () => {
  settings.bg.dim = Number(set.dim.value);
  set.dimVal.textContent = settings.bg.dim + '%';
  applySettings();
  saveSettingsSoon();
});
onSeg(set.scale, v => updateSetting(s => { s.tileScale = v; }));
onSeg(set.font, v => updateSetting(s => { s.font = v; }));
set.anim.addEventListener('change', () => updateSetting(s => { s.animations = set.anim.checked; }));
set.flip.addEventListener('change', () => updateSetting(s => { s.flipOpen = set.flip.checked; }));
set.parallax.addEventListener('change', () => updateSetting(s => { s.parallax = set.parallax.checked; }));
onSeg(set.pos, v => { updateSetting(s => { s.widgetPos = v; }, { weather: v !== 'hidden' }); refreshWidgets(); });
onSeg(set.clock, v => updateSetting(s => { s.clock24 = v === '24'; }));
set.weather.addEventListener('change', () => updateSetting(s => { s.showWeather = set.weather.checked; }, { weather: set.weather.checked }));
onSeg(set.units, v => updateSetting(s => { s.units = v; }, { weather: true }));
set.locAuto.addEventListener('click', () => updateSetting(s => { s.location = { mode: 'auto' }; }, { weather: true }));

const searchCities = debounce(async q => {
  if (q.length < 2) { set.cityResults.replaceChildren(); return; }
  try {
    const results = await Weather.searchCity(q);
    if (set.city.value.trim() !== q) return;
    set.cityResults.replaceChildren(...(results.length ? results.map(r => h('li', {},
      h('button', {
        type: 'button',
        onclick: () => {
          set.city.value = '';
          set.cityResults.replaceChildren();
          updateSetting(s => { s.location = { mode: 'manual', name: r.name, lat: r.lat, lon: r.lon }; }, { weather: true });
        },
      }, r.name, h('small', {}, r.region)))) : [h('li', { class: 'muted' }, 'No cities found with that name.')]));
  } catch {
    set.cityResults.replaceChildren(h('li', { class: 'muted' }, 'City search needs an internet connection.'));
  }
}, 350);
set.city.addEventListener('input', () => searchCities(set.city.value.trim()));

// ---- more clocks and weather places
const CLOCK_PRESETS = DEFAULT_SETTINGS.clocks;
function placeRow(label, note, { up, remove }) {
  return h('li', {},
    h('span', { class: 'place-name' }, label, note ? h('small', {}, note) : null),
    up ? h('button', { type: 'button', class: 'place-btn', title: 'Move up', 'aria-label': `Move ${label} up`, onclick: up }, '↑') : null,
    h('button', { type: 'button', class: 'place-btn', title: 'Remove', 'aria-label': `Remove ${label}`, onclick: remove }, '×'));
}
function moveUp(list, i) { if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; }
function renderPlaceSettings() {
  const clocks = settings.clocks;
  $('#set-clock-list').replaceChildren(...clocks.map((c, i) => placeRow(c.name,
    c.tz === LOCAL_TZ ? 'your time zone, so it’s skipped' : tzAbbr(c.tz) !== c.name ? tzAbbr(c.tz) : '', {
      up: i ? () => updateSetting(s => moveUp(s.clocks, i)) : null,
      remove: () => updateSetting(s => { s.clocks.splice(i, 1); }),
    })));
  const missing = CLOCK_PRESETS.filter(p => !clocks.some(c => c.tz === p.tz));
  $('#set-clock-presets').replaceChildren(...(clocks.length < MAX_CLOCKS ? missing : []).map(p => h('button', {
    type: 'button', class: 'chip', onclick: () => updateSetting(s => { s.clocks.push({ ...p }); }),
  }, `+ ${p.name}`)));
  $('#set-clock-city').hidden = clocks.length >= MAX_CLOCKS;
  const places = settings.places;
  $('#set-place-list').replaceChildren(...places.map((p, i) => placeRow(p.name, '', {
    up: i ? () => updateSetting(s => moveUp(s.places, i)) : null,
    remove: () => updateSetting(s => { s.places.splice(i, 1); }, { weather: true }),
  })));
  $('#set-place-city').hidden = places.length >= MAX_PLACES;
}
// City search for adding a clock (needs the city's time zone) or a weather place
function citySearch(input, results, pick) {
  const run = debounce(async q => {
    if (q.length < 2) { results.replaceChildren(); return; }
    try {
      const found = await Weather.searchCity(q);
      if (input.value.trim() !== q) return;
      results.replaceChildren(...(found.length ? found.map(r => h('li', {}, h('button', {
        type: 'button',
        onclick: () => { input.value = ''; results.replaceChildren(); pick(r); },
      }, r.name, h('small', {}, r.region)))) : [h('li', { class: 'muted' }, 'No cities found with that name.')]));
    } catch {
      results.replaceChildren(h('li', { class: 'muted' }, 'City search needs an internet connection.'));
    }
  }, 350);
  input.addEventListener('input', () => run(input.value.trim()));
}
citySearch($('#set-clock-city'), $('#set-clock-results'), r => {
  if (!validTz(r.tz)) { toast('Couldn’t find the time zone for that city.'); return; }
  if (settings.clocks.some(c => c.tz === r.tz && c.name === r.name)) return;
  updateSetting(s => { s.clocks.push({ tz: r.tz, name: r.name }); });
});
citySearch($('#set-place-city'), $('#set-place-results'), r => {
  updateSetting(s => { s.places.push({ name: r.name, lat: r.lat, lon: r.lon }); }, { weather: true });
});

set.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'metro-start', version: 1, tiles, settings, games: gameData }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `metro-start-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
set.importBtn.addEventListener('click', async () => {
  const file = await pickFile(set.importFile);
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tiles)) throw new Error('missing tiles');
    tiles = sanitizeTiles(data.tiles);
    if (data.settings) settings = mergeSettings(data.settings);
    if (data.games && typeof data.games === 'object') {
      gameData = { saves: data.games.saves || {}, stats: data.games.stats || {} };
      flushGameData();
    }
    await Promise.all([saveTiles(), saveSettings()]);
    applySettings();
    syncSettingsUI();
    renderGrid({ animate: true });
    refreshWeather(true);
    toast(`Imported ${tiles.length} tiles`);
  } catch {
    toast('That file isn’t a Metro Start backup.');
  }
});
set.reset.addEventListener('click', async () => {
  if (!confirm('Reset all tiles, folders and settings to the defaults?')) return;
  tiles = defaultTiles();
  settings = structuredClone(DEFAULT_SETTINGS);
  await Promise.all([saveTiles(), saveSettings()]);
  applySettings();
  syncSettingsUI();
  renderGrid({ animate: true });
  refreshWeather(true);
  refreshWidgets(true);
});
$('#set-close').addEventListener('click', closeSettings);
$('#set-bookmarks').addEventListener('click', openBookmarkImport);
$('#set-restore-games').addEventListener('click', () => { closeSettings(); restoreGames(); });
settingsScrim.addEventListener('click', closeSettings);


// ---------------------------------------------------------------- bookmark import
const bm = {
  overlay: $('#bm-overlay'), tree: $('#bm-tree'), size: $('#bm-size'), keepFolders: $('#bm-folders'),
  skipDupes: $('#bm-dupes'), icons: $('#bm-icons'), replace: $('#bm-replace'), keepGames: $('#bm-keep-games'), widen: $('#bm-widen'), go: $('#bm-import'), cancel: $('#bm-cancel'), all: $('#bm-all'), none: $('#bm-none'),
};
let bmState = null; // { roots, selected: Set<id>, open: Set<id>, size }

const IMPORTABLE = /^(https?|ftp|file|chrome):/i;
const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l5 5-5 5"/></svg>';
const FOLDER_ICON = '<svg class="bm-ficon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h7l2 2h9v11H3z"/></svg>';

function urlKey(u) {
  try {
    const x = new URL(normalizeUrl(u));
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
  } catch { return String(u).toLowerCase(); }
}
function colorFor(str) {
  let hsh = 0;
  for (const ch of String(str)) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hsh % (PALETTE.length - 1)]; // skip the near-black last swatch
}
function bmLeaves(node) {
  if (node.url) return IMPORTABLE.test(node.url) ? [node] : [];
  return (node.children || []).flatMap(bmLeaves);
}

async function openBookmarkImport() {
  hideMenu();
  closeSettings();
  if (!hasChrome || !chrome.permissions) {
    toast('Bookmark import works once Metro Start is installed as an extension.');
    return;
  }
  // must be called straight from the click so Chrome can show its permission prompt
  let granted = false;
  try { granted = await chrome.permissions.request({ permissions: ['bookmarks'] }); } catch { granted = false; }
  if (!granted || !chrome.bookmarks) {
    toast('Allow Metro Start to read your bookmarks to import them.');
    return;
  }
  const [root] = await chrome.bookmarks.getTree();
  const roots = (root.children || []).filter(r => bmLeaves(r).length);
  const bar = roots.find(r => r.id === '1') || roots[0];
  bmState = { roots, selected: new Set(), open: new Set(), size: 'medium' };
  if (bar) {
    bmState.open.add(bar.id);
    for (const l of bmLeaves(bar)) bmState.selected.add(l.id);
  }
  setSeg(bm.size, bmState.size);
  bm.replace.checked = false; // never carried over from a previous import
  bm.keepGames.checked = true;
  renderBmTree();
  openOverlay(bm.overlay);
  setTimeout(() => bm.go.focus(), 60);
}
function closeBookmarkImport() {
  closeOverlay(bm.overlay);
  bmState = null;
}

function renderBmTree() {
  const top = bm.tree.scrollTop;
  const nodes = bmState.roots.map(n => bmNode(n)).filter(Boolean);
  bm.tree.replaceChildren(...(nodes.length ? nodes : [h('li', { class: 'bm-empty' }, 'Chrome has no bookmarks to import.')]));
  bm.tree.scrollTop = top;
  const n = bmState.selected.size;
  bm.go.disabled = n === 0;
  const replace = bm.replace.checked;
  const keep = bm.keepGames.checked;
  bm.go.textContent = n === 0 ? 'Add tiles' : replace ? `Erase Start${keep ? ' (except games)' : ''} and add ${n} tile${n === 1 ? '' : 's'}` : `Add ${n} tile${n === 1 ? '' : 's'}`;
  bm.keepGames.disabled = !replace;
  bm.go.classList.toggle('danger-fill', replace);
  bm.skipDupes.disabled = replace;
}

function bmNode(n) {
  const sel = bmState.selected;
  if (n.url) {
    if (!IMPORTABLE.test(n.url)) return null;
    const cb = h('input', { type: 'checkbox' });
    cb.checked = sel.has(n.id);
    cb.addEventListener('change', () => { cb.checked ? sel.add(n.id) : sel.delete(n.id); renderBmTree(); });
    return h('li', { class: 'bm-link' }, h('label', { title: n.url },
      cb,
      h('img', { class: 'bm-fav', src: faviconSrc(n.url), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => { e.target.style.visibility = 'hidden'; } }),
      h('span', { class: 'bm-title' }, (n.title || '').trim() || prettyName(n.url)),
      h('span', { class: 'bm-meta' }, hostOf(n.url))));
  }
  const leaves = bmLeaves(n);
  if (!leaves.length) return null;
  const picked = leaves.filter(l => sel.has(l.id)).length;
  const open = bmState.open.has(n.id);
  const cb = h('input', { type: 'checkbox', 'aria-label': `Select everything in ${n.title || 'folder'}` });
  cb.checked = picked === leaves.length;
  cb.indeterminate = picked > 0 && picked < leaves.length;
  cb.addEventListener('change', () => {
    for (const l of leaves) cb.checked ? sel.add(l.id) : sel.delete(l.id);
    renderBmTree();
  });
  const li = h('li', { class: 'bm-folder' }, h('div', { class: 'bm-row' },
    h('button', {
      type: 'button', class: 'bm-toggle', 'aria-expanded': String(open), 'aria-label': open ? 'Collapse folder' : 'Expand folder', html: CHEVRON,
      onclick: () => { open ? bmState.open.delete(n.id) : bmState.open.add(n.id); renderBmTree(); },
    }),
    h('label', {},
      cb,
      h('span', { html: FOLDER_ICON, style: { display: 'grid' } }),
      h('span', { class: 'bm-title' }, n.title || 'Untitled folder'),
      h('span', { class: 'bm-meta' }, `${picked} of ${leaves.length}`))));
  if (open) li.append(h('ul', {}, ...(n.children || []).map(c => bmNode(c)).filter(Boolean)));
  return li;
}


// ---- icons for imported bookmarks
function loadImage(src, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, timeout);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('failed')); };
    img.src = src;
  });
}
function imageToDataUrl(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || 64;
  c.height = img.naturalHeight || 64;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

// The icon Chrome saved for a bookmark. Chrome answers with a grey globe when it has none, so compare against that.
async function chromeSavedIcon(url, globe) {
  if (!hasChrome) return null;
  const img = await loadImage(localFavicon(url), 4000);
  const data = imageToDataUrl(img);
  return data === globe ? null : { src: data, size: img.naturalWidth };
}

// The icon a site declares in its page: prefers the large phone home-screen icon, then the biggest listed one
async function websiteIcon(pageUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  let res, html;
  try {
    // Redirects aren't followed: a redirect to another site is refused by Chrome and shows up as an extension error.
    // Instead, try the same address and its https version (both are covered by the permission asked for at import).
    const u = new URL(pageUrl);
    const tries = [...new Set([pageUrl, `https://${u.hostname}${u.pathname}`, `https://${u.hostname}/`])];
    for (const t of tries) {
      res = await fetch(t, { signal: ctrl.signal, credentials: 'omit', redirect: 'manual' }).catch(() => null);
      if (res && res.type !== 'opaqueredirect' && res.ok) break;
      res = null;
    }
    if (!res) return null;
    html = /html/i.test(res.headers.get('content-type') || '') ? (await res.text()).slice(0, 400000) : '';
  } finally {
    clearTimeout(timer);
  }
  const base = res.url || pageUrl;
  const origin = new URL(base).origin;
  const candidates = [];
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const l of doc.querySelectorAll('link[rel][href]')) {
      const rel = l.getAttribute('rel').toLowerCase();
      if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) continue;
      let href;
      try { href = new URL(l.getAttribute('href'), base).href; } catch { continue; }
      const sizes = (l.getAttribute('sizes') || '').toLowerCase();
      const svg = /svg/i.test(l.getAttribute('type') || '') || /\.svg(\?|$)/i.test(href);
      const listed = Math.max(0, ...(sizes.match(/\d+/g) || []).map(Number));
      const score = sizes.includes('any') || svg ? 512 : listed || (rel.includes('apple') ? 180 : 32);
      candidates.push({ href, score, svg });
    }
  }
  if (!candidates.some(c => c.score >= 120)) candidates.push({ href: origin + '/apple-touch-icon.png', score: 120 });
  candidates.push({ href: origin + '/favicon.ico', score: 16 });
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    try {
      const img = await loadImage(c.href, 5000);
      const size = c.svg ? 512 : img.naturalWidth;
      if (size >= 16) return { src: c.href, size };
    } catch { /* try the next candidate */ }
  }
  return null;
}

// Run tasks a few at a time
async function inBatches(items, limit, task) {
  let i = 0;
  const worker = async () => { while (i < items.length) await task(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function selectedBookmarks() {
  const out = [];
  const walk = nodes => nodes.forEach(n => {
    if (n.children) walk(n.children);
    else if (n.url && bmState.selected.has(n.id) && IMPORTABLE.test(n.url)) out.push(n);
  });
  walk(bmState.roots);
  return out;
}

function setImportBusy(busy, text = '') {
  bmState.busy = busy;
  bm.go.disabled = busy || !bmState.selected.size;
  if (busy) bm.go.textContent = text;
  bm.cancel.textContent = busy ? 'Skip icons' : 'Cancel';
  [bm.all, bm.none, bm.keepFolders, bm.skipDupes, bm.icons, bm.replace, bm.keepGames, bm.widen].forEach(x => { x.disabled = busy; });
  bm.tree.style.pointerEvents = busy ? 'none' : '';
  bm.tree.style.opacity = busy ? '.6' : '';
}

// Started straight from the click, so Chrome can show its permission prompt
function startBookmarkImport() {
  if (!bmState || bmState.busy || !bmState.selected.size) return;
  const state = bmState;
  const replace = bm.replace.checked;
  const existing = new Set(replace ? [] : allLinkKeys());
  const picks = selectedBookmarks().filter(n => !(bm.skipDupes.checked && existing.has(urlKey(n.url))));
  const web = bm.icons.checked && hasChrome && chrome.permissions && picks.length;
  const origins = web ? [...new Set(picks.map(n => {
    try { const u = new URL(n.url); return /^https?:$/.test(u.protocol) ? [`https://${u.hostname}/*`, `http://${u.hostname}/*`] : null; } catch { return null; }
  }).filter(Boolean).flat())] : [];
  const ask = origins.length ? chrome.permissions.request({ origins }).catch(() => false) : Promise.resolve(false);

  ask.then(async allowed => {
    const giveBack = () => { if (allowed) { try { chrome.permissions.remove({ origins }).catch(() => {}); } catch { /* nothing to give back */ } } };
    if (bmState !== state) { giveBack(); return; }
    const icons = new Map();
    if (hasChrome && picks.length) {
      let done = 0;
      setImportBusy(true, `Getting icons… 0 of ${picks.length}`);
      let globe = '';
      try { globe = imageToDataUrl(await loadImage(localFavicon('https://no-icon.metro-start.invalid/'), 3000)); } catch { /* no comparison available */ }
      await inBatches(picks, 6, async n => {
        if (bmState !== state || state.skipIcons) return;
        let best = null;
        if (allowed) { try { best = await websiteIcon(n.url); } catch { /* site unreachable */ } }
        if (!best || best.size < 48) {
          try {
            const saved = globe ? await chromeSavedIcon(n.url, globe) : null;
            if (saved && (!best || saved.size > best.size)) best = saved;
          } catch { /* no saved icon */ }
        }
        if (best) icons.set(n.id, best.src);
        done++;
        if (bmState === state && !state.skipIcons) bm.go.textContent = `Getting icons… ${done} of ${picks.length}`;
      });
    }
    giveBack(); // the site access was only needed for the icons
    if (bmState !== state) return;
    setImportBusy(false);
    importSelectedBookmarks(icons);
  });
}

function allLinkKeys() {
  return allLinksDeep().map(t => urlKey(t.url));
}

// Does a name need more than the two lines a medium tile has room for?
let measureCtx = null;
function nameTooLong(title) {
  const unit = UNIT_PX[settings.tileScale] || 70;
  const gap = Math.round(unit / 7);
  const textWidth = (unit * 2 + gap) - 20 - Math.round(unit * 0.5) - 8; // tile minus padding, icon and spacing
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `700 14px ${getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif'}`;
  // words wrap, so two lines hold a bit less than twice the width
  return measureCtx.measureText(title).width > textWidth * 1.75;
}
function importSelectedBookmarks(icons = new Map()) {
  if (!bmState || !bmState.selected.size) return;
  const keepFolders = bm.keepFolders.checked;
  const replace = bm.replace.checked;
  const skipDupes = replace || bm.skipDupes.checked; // when replacing, only repeats within the import are skipped
  const size = bmState.size;
  const snapshot = JSON.stringify(tiles);
  if (replace) {
    // keep games (and the folders that hold them) unless asked to erase them too
    tiles = bm.keepGames.checked ? gamesOnly(tiles) : [];
    if (openFolderId) closeFolder();
  }
  const existing = new Set(allLinkKeys());
  let added = 0;
  let skipped = 0;

  // A tile folder for a bookmark folder, made only when something is actually imported into it.
  // Reuses a folder with the same name in the same place instead of making a twin.
  const lazyFolder = (bmFolder, parentList) => {
    let f = null;
    return () => {
      if (f) return f.children;
      const list = parentList();
      const title = (bmFolder.title || 'Bookmarks').slice(0, 80);
      f = list.find(t => t.type === 'folder' && t.title.toLowerCase() === title.toLowerCase());
      if (!f) {
        f = { id: uid(), type: 'folder', title, color: colorFor(title), size: 'medium', children: [] };
        list.push(f);
      }
      return f.children;
    };
  };

  // links directly in "Bookmarks bar" / "Other bookmarks" go on Start;
  // bookmark folders become tile folders, nested the same way they are in Chrome
  const walk = (nodes, listFor) => {
    for (const n of nodes) {
      if (n.children) { walk(n.children, keepFolders ? lazyFolder(n, listFor) : listFor); continue; }
      if (!n.url || !bmState.selected.has(n.id) || !IMPORTABLE.test(n.url)) continue;
      const key = urlKey(n.url);
      if (skipDupes && existing.has(key)) { skipped++; continue; }
      existing.add(key);
      const t = link(((n.title || '').trim() || prettyName(n.url)).slice(0, 80), n.url, colorFor(hostOf(n.url) || n.url), size);
      if (icons.has(n.id)) t.icon.siteIcon = icons.get(n.id);
      if (bm.widen.checked && size === 'medium' && nameTooLong(t.title)) t.size = 'wide';
      listFor().push(t);
      added++;
    }
  };
  for (const r of bmState.roots) walk(r.children || [], () => tiles);

  closeBookmarkImport();
  commit();
  if (settings.animations) entrance(grid);
  const plural = n => `${n} tile${n === 1 ? '' : 's'}`;
  const msg = replace
    ? `Replaced Start with ${plural(added)}` + (skipped ? `, skipped ${skipped} repeated` : '')
    : added
      ? `Added ${plural(added)}` + (skipped ? `, skipped ${skipped} already on Start` : '')
      : 'Those sites are already on Start';
  toast(msg, added || replace ? { label: 'Undo', run: () => { tiles = JSON.parse(snapshot); commit(); } } : undefined);
  if (added) scroller.scrollTo({ left: replace ? 0 : scroller.scrollWidth, behavior: 'smooth' });
}

onSeg(bm.size, v => { if (bmState) bmState.size = v; });
bm.replace.addEventListener('change', () => { if (bmState) renderBmTree(); });
bm.keepGames.addEventListener('change', () => { if (bmState) renderBmTree(); });
bm.all.addEventListener('click', () => { bmState.roots.flatMap(bmLeaves).forEach(l => bmState.selected.add(l.id)); renderBmTree(); });
bm.none.addEventListener('click', () => { bmState.selected.clear(); renderBmTree(); });
bm.cancel.addEventListener('click', () => { if (bmState && bmState.busy) bmState.skipIcons = true; else closeBookmarkImport(); });
bm.go.addEventListener('click', startBookmarkImport);
bm.overlay.addEventListener('click', e => { if (e.target === bm.overlay) closeBookmarkImport(); });



// ---------------------------------------------------------------- wallpaper gallery
const wp = { overlay: $('#wp-overlay'), tabs: $('#wp-tabs'), grid: $('#wp-grid'), note: $('#wp-note'), more: $('#wp-more') };
let wpCat = Wallpapers.CATEGORIES[0].id;
let wpBusy = false;

function openGallery() {
  closeSettings();
  wp.tabs.replaceChildren(...Wallpapers.CATEGORIES.map(c => h('button', {
    type: 'button', role: 'tab', dataset: { value: c.id }, 'aria-pressed': String(c.id === wpCat),
    onclick: () => { wpCat = c.id; setSeg(wp.tabs, c.id); showCategory(); },
  }, c.label)));
  openOverlay(wp.overlay);
  showCategory();
}
function closeGallery() { closeOverlay(wp.overlay); }

async function showCategory(more = false) {
  const cat = wpCat;
  if (!more) { wp.grid.replaceChildren(...Array.from({ length: 12 }, () => h('div', { class: 'wp-item loading' }))); wp.more.hidden = true; }
  wp.note.textContent = '';
  wp.more.disabled = true;
  try {
    const { items, done } = await Wallpapers.load(cat, { more });
    if (cat !== wpCat) return; // another tab was picked meanwhile
    const current = settings.bg.credit && settings.bg.credit.id;
    wp.grid.replaceChildren(...items.map(it => h('button', {
      type: 'button', role: 'listitem', class: 'wp-item' + (it.id === current ? ' current' : ''),
      title: [it.title, it.author && `by ${it.author}`].filter(Boolean).join(' '),
      onclick: e => pickWallpaper(it, e.currentTarget),
    },
      h('img', { src: it.thumb, alt: it.title, loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => { e.target.closest('.wp-item').hidden = true; } }),
      h('span', { class: 'wp-cap' }, it.title))));
    if (!items.length) wp.note.textContent = 'No pictures in this category right now.';
    wp.more.hidden = done;
    wp.more.disabled = false;
  } catch (err) {
    if (cat !== wpCat) return;
    wp.grid.replaceChildren();
    wp.note.replaceChildren(err.message + ' ', h('button', { type: 'button', class: 'widget-btn', onclick: () => showCategory(more) }, 'Try again'));
  }
}

async function pickWallpaper(item, el) {
  if (wpBusy) return;
  wpBusy = true;
  el.classList.add('saving');
  wp.grid.querySelectorAll('.wp-item.current').forEach(x => x.classList.remove('current'));
  try {
    const image = await Wallpapers.download(item, readImage);
    updateSetting(s => {
      s.bg.image = image;
      s.bg.credit = { id: item.id, title: item.title, author: item.author, license: item.license, page: item.page };
      if (s.bg.dim < 15) s.bg.dim = 25; // keep tiles readable on a busy photo
    });
    el.classList.add('current');
    toast(`Wallpaper set: ${item.title}`);
  } catch (err) {
    toast('Couldn’t set that wallpaper. Try again.');
  } finally {
    el.classList.remove('saving');
    wpBusy = false;
  }
}

$('#set-bg-gallery').addEventListener('click', openGallery);
$('#wp-close').addEventListener('click', closeGallery);
wp.more.addEventListener('click', () => showCategory(true));
wp.overlay.addEventListener('click', e => { if (e.target === wp.overlay) closeGallery(); });

// ---------------------------------------------------------------- news feed tiles
const feedTiles = () => everyTile().map(x => x.tile).filter(t => t.type === 'feed');

// Redraw just the feed tiles that show this feed (no full re-render, so nothing jumps or animates)
function updateFeedTiles(url) {
  for (const t of feedTiles().filter(x => x.url === url)) {
    for (const el of document.querySelectorAll(`#grid .tile[data-id="${CSS.escape(t.id)}"], #folder-grid .tile[data-id="${CSS.escape(t.id)}"]`)) {
      const fresh = feedTileEl(t);
      const keep = ['dragging', 'enter', 'flipping', 'flip-out', 'flip-in', 'flipped'].filter(k => el.classList.contains(k));
      el.className = fresh.className;
      keep.forEach(k => el.classList.add(k));
      if (fresh.getAttribute('href')) el.setAttribute('href', fresh.getAttribute('href'));
      el.title = fresh.title;
      el.replaceChildren(...fresh.childNodes);
    }
  }
  if (headlines.id && (findTile(headlines.id) || {}).tile && findTile(headlines.id).tile.url === url) renderHeadlines();
}

let feedsBusy = false;
async function refreshFeeds(force = false) {
  if (feedsBusy) return;
  feedsBusy = true;
  try {
    const urls = [...new Set(feedTiles().map(t => t.url))];
    await Feeds.prune(urls);
    for (const url of urls) {
      if (!force && !Feeds.stale(url)) continue;
      await Feeds.refresh(url);
      updateFeedTiles(url);
    }
  } finally { feedsBusy = false; }
}
setInterval(() => { if (!document.hidden) refreshFeeds(); }, 5 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFeeds(); });

// Chrome only shows its permission prompt straight from a click
function allowFeed(t) {
  if (!hasChrome || !chrome.permissions) return;
  chrome.permissions.request({ origins: Feeds.originsFor(t.url) }).then(async ok => {
    if (!ok) { toast('Chrome needs your OK for this tile to read its news feed.'); return; }
    await Feeds.refresh(t.url);
    updateFeedTiles(t.url);
  }, () => {});
}

// Add one of the ready-made feeds (from the + menu)
function addPresetFeed(p, parentId) {
  const ask = hasChrome && chrome.permissions ? chrome.permissions.request({ origins: Feeds.originsFor(p.feed) }).catch(() => false) : Promise.resolve(true);
  ask.then(async ok => {
    if (!ok) { toast('Chrome needs your OK for this tile to read its news feed.'); return; }
    const t = { id: uid(), type: 'feed', title: p.name, url: p.feed, site: p.site, color: p.color, size: 'large', style: 'list' };
    const parent = findFolder(parentId);
    (parent ? parent.children : tiles).push(t);
    commit();
    toast(`Added ${p.name}`);
    await Feeds.refresh(p.feed);
    updateFeedTiles(p.feed);
  });
}
function feedMenuItems(parentId) {
  return [
    ...Feeds.PRESETS.map(p => ({ label: p.name, action: () => addPresetFeed(p, parentId) })),
    '-',
    { label: 'Another site…', action: () => openEditor({ type: 'feed', parentId }) },
  ];
}

// ---- all headlines: a band listing the feed's latest stories
const headlines = { overlay: $('#feed-overlay'), list: $('#feed-list'), title: $('#feed-title'), sub: $('#feed-sub'), id: null };
function openHeadlines(id) {
  const f = findTile(id);
  if (!f) return;
  headlines.id = id;
  renderHeadlines();
  openOverlay(headlines.overlay);
  if (Feeds.stale(f.tile.url)) Feeds.refresh(f.tile.url).then(() => updateFeedTiles(f.tile.url));
  Feeds.markSeen(f.tile.url).then(() => updateFeedTiles(f.tile.url));
  setTimeout(() => (headlines.list.querySelector('a') || $('#feed-close')).focus({ preventScroll: true }), 50);
}
function renderHeadlines() {
  const f = findTile(headlines.id);
  if (!f) return;
  const t = f.tile;
  const c = Feeds.cached(t.url);
  headlines.title.textContent = t.title;
  headlines.sub.textContent = c && c.at && !c.needsAccess ? `Updated ${Feeds.ago(c.at) === 'now' ? 'just now' : Feeds.ago(c.at) + ' ago'}` : '';
  const items = (c && c.items) || [];
  if (!items.length) {
    headlines.list.replaceChildren(h('li', { class: 'feed-empty' }, c && c.needsAccess ? 'Metro Start needs your OK to read this feed. ' : (c && c.error) || 'Loading stories…',
      c && c.needsAccess ? h('button', { type: 'button', class: 'btn', onclick: () => allowFeed(t) }, 'Allow') : null));
    return;
  }
  headlines.list.replaceChildren(...items.map(i => h('li', {},
    h('a', { class: 'feed-item', href: i.link },
      i.image ? h('img', { class: 'feed-thumb', src: i.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() }) : null,
      h('span', { class: 'feed-item-text' },
        h('span', { class: 'feed-item-title' }, i.title),
        h('span', { class: 'feed-item-meta' }, [i.source, Feeds.ago(i.date)].filter(Boolean).join(' · ')))))));
}
function closeHeadlines() { closeOverlay(headlines.overlay); headlines.id = null; }
$('#feed-close').addEventListener('click', closeHeadlines);
$('#feed-site').addEventListener('click', () => { const f = findTile(headlines.id); if (f) openUrl(feedHome(f.tile), false); });
$('#feed-refresh').addEventListener('click', async () => {
  const f = findTile(headlines.id);
  if (!f) return;
  headlines.sub.textContent = 'Updating…';
  await Feeds.refresh(f.tile.url);
  updateFeedTiles(f.tile.url);
  renderHeadlines();
});
headlines.overlay.addEventListener('click', e => { if (e.target === headlines.overlay) closeHeadlines(); });

// ---------------------------------------------------------------- news and markets widgets
let widgetCache = { news: null, stocks: null }; // { key, at, data, error }
const WIDGET_TTL = { news: 20 * 60e3, stocks: 5 * 60e3 };
const WIDGET_RETRY = 3 * 60e3;
const newsWidget = $('#news-widget');
const stocksWidget = $('#stocks-widget');

const widgetKey = kind => (kind === 'news' ? Widgets.newsUrl(settings) : settings.stocks.join(','));
const widgetOn = kind => settings.widgetPos !== 'hidden' &&
  (kind === 'news' ? settings.showNews && !!Widgets.newsUrl(settings) : settings.showStocks && settings.stocks.length > 0);

// Chrome only shows its permission prompt straight from a click, so callers run this inside one
function askWidgetAccess(kind, then) {
  const origins = Widgets.origins(kind, settings);
  if (!origins.length || !hasChrome || !chrome.permissions) { then(true); return; }
  chrome.permissions.request({ origins }).then(then, () => then(false));
}
async function hasWidgetAccess(kind) {
  const origins = Widgets.origins(kind, settings);
  if (!origins.length || !hasChrome || !chrome.permissions) return true;
  try { return await chrome.permissions.contains({ origins }); } catch { return false; }
}

const fmtPrice = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function widgetMessage(list, text, action) {
  list.replaceChildren(h('li', { class: 'widget-note' }, text, action ? ' ' : '',
    action && h('button', { type: 'button', class: 'widget-btn', onclick: action.run }, action.label)));
}

function renderWidget(kind) {
  const el = kind === 'news' ? newsWidget : stocksWidget;
  const list = kind === 'news' ? $('#news-list') : $('#stock-list');
  el.hidden = !widgetOn(kind);
  if (el.hidden) return;
  if (kind === 'news') $('#news-sub').textContent = Widgets.NEWS_TOPICS[settings.newsTopic] || '';
  const c = widgetCache[kind] && widgetCache[kind].key === widgetKey(kind) ? widgetCache[kind] : null;
  if (el.dataset.needsAccess === '1') {
    widgetMessage(list, kind === 'news' ? 'Show the latest headlines here.' : 'Show market prices here.', {
      label: 'Turn on', run: () => askWidgetAccess(kind, ok => {
        if (!ok) { toast('Chrome needs your OK for this widget to read its site.'); return; }
        el.dataset.needsAccess = '';
        refreshWidget(kind, true);
      }),
    });
    return;
  }
  if (!c || !c.data) {
    if (c && c.error) widgetMessage(list, c.error, { label: 'Try again', run: () => refreshWidget(kind, true) });
    else widgetMessage(list, 'Loading…');
    return;
  }
  if (kind === 'news') {
    list.replaceChildren(...c.data.slice(0, 3).map(n => h('li', {},
      h('a', { href: n.link, title: n.source ? `${n.title} (${n.source})` : n.title }, n.title,
        n.source ? h('span', { class: 'news-src' }, n.source) : null))));
  } else {
    list.replaceChildren(...c.data.map(q => {
      const link = `https://finance.yahoo.com/quote/${encodeURIComponent(q.symbol)}`;
      if (q.failed) return h('li', {}, h('span', { class: 'stock-name' }, q.name), h('span', { class: 'stock-price' }, '—'), h('span', { class: 'stock-chg' }, ''));
      const dir = q.change > 0 ? 'up' : q.change < 0 ? 'down' : '';
      const sign = q.change > 0 ? '+' : q.change < 0 ? '−' : '';
      return h('li', { title: `${q.name}: ${fmtPrice(q.price)} ${q.currency}` },
        h('a', { class: 'stock-name', href: link, style: { color: 'inherit', textDecoration: 'none' } }, q.name),
        h('span', { class: 'stock-price' }, fmtPrice(q.price)),
        h('span', { class: `stock-chg ${dir}` }, `${sign}${Math.abs(q.pct).toFixed(2)}%`));
    }));
  }
  $(kind === 'news' ? '#news-sub' : '#stocks-sub').title = c.error ? `Last update failed: ${c.error}` : `Updated ${new Date(c.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
function renderWidgets() { renderWidget('news'); renderWidget('stocks'); }

const widgetBusy = new Set();
async function refreshWidget(kind, force = false) {
  if (!widgetOn(kind) || widgetBusy.has(kind)) { renderWidget(kind); return; }
  const key = widgetKey(kind);
  const prev = widgetCache[kind] && widgetCache[kind].key === key ? widgetCache[kind] : null;
  if (!force && prev && Date.now() - prev.at < (prev.error ? WIDGET_RETRY : WIDGET_TTL[kind])) { renderWidget(kind); return; }
  const el = kind === 'news' ? newsWidget : stocksWidget;
  if (!(await hasWidgetAccess(kind))) { el.dataset.needsAccess = '1'; renderWidget(kind); return; }
  el.dataset.needsAccess = '';
  widgetBusy.add(kind);
  try {
    const data = kind === 'news' ? await Widgets.fetchNews(key) : await Widgets.fetchQuotes(settings.stocks);
    widgetCache[kind] = { key, at: Date.now(), data };
  } catch (err) {
    widgetCache[kind] = { key, at: Date.now(), data: prev ? prev.data : null, error: (err && err.message) || 'Couldn’t update.' };
  } finally {
    widgetBusy.delete(kind);
  }
  Store.set('widgetCache', widgetCache).catch(() => {});
  renderWidget(kind);
}
function refreshWidgets(force = false) { refreshWidget('news', force); refreshWidget('stocks', force); }

// settings: turning a widget on asks Chrome for access in the same click
Object.entries(Widgets.NEWS_TOPICS).forEach(([value, label]) => set.newsTopic.append(h('option', { value }, label)));
set.news.addEventListener('change', () => {
  const on = set.news.checked;
  const apply = () => updateSetting(s => { s.showNews = on; }) || refreshWidget('news');
  if (on) askWidgetAccess('news', ok => { if (!ok) toast('Chrome needs your OK for the News widget to read Google News.'); apply(); });
  else apply();
});
set.newsTopic.addEventListener('change', () => {
  const topic = set.newsTopic.value;
  updateSetting(s => { s.newsTopic = topic; });
  if (topic === 'custom') { set.newsFeed.focus(); return; }
  askWidgetAccess('news', () => refreshWidget('news', true));
});
set.newsFeed.addEventListener('change', () => {
  const v = set.newsFeed.value.trim();
  updateSetting(s => { s.newsFeed = v ? normalizeUrl(v) : ''; });
  askWidgetAccess('news', () => refreshWidget('news', true));
});
set.stocks.addEventListener('change', () => {
  const on = set.stocks.checked;
  const apply = () => updateSetting(s => { s.showStocks = on; }) || refreshWidget('stocks');
  if (on) askWidgetAccess('stocks', ok => { if (!ok) toast('Chrome needs your OK for the Markets widget to read Yahoo Finance.'); apply(); });
  else apply();
});
set.stockSymbols.addEventListener('change', () => {
  const list = Widgets.parseSymbols(set.stockSymbols.value);
  set.stockSymbols.value = list.join(', ');
  updateSetting(s => { s.stocks = list; });
  refreshWidget('stocks', true);
});


// ---------------------------------------------------------------- games
// Progress and best scores live in one storage entry: { saves: {game: state}, stats: {game: {...}} }
let gameData = { saves: {}, stats: {} };
let gameSession = null;
const gameOverlay = $('#game-overlay');
const gameBanner = $('#game-banner');
const saveGameData = debounce(() => Store.set('games', gameData).catch(() => toast('Couldn’t save game progress.')), 400);
const flushGameData = () => Store.set('games', gameData).catch(() => {});

function openGame(id) {
  const def = Games.LIST[id];
  if (!def) return;
  if (gameSession) closeGame();
  hideMenu();
  $('#game-title').textContent = def.title;
  gameOverlay.style.setProperty('--game-color', def.color);
  const stage = $('#game-stage');
  stage.replaceChildren();
  $('#game-tools').replaceChildren();
  $('#game-status').replaceChildren();
  gameBanner.hidden = true;
  gameOverlay.hidden = false;
  const keys = [];
  const api = {
    stage,
    load: () => (gameData.saves[id] ? structuredClone(gameData.saves[id]) : null),
    save: st => { gameData.saves[id] = structuredClone(st); saveGameData(); },
    stats: () => gameData.stats[id] || {},
    setStats: obj => { gameData.stats[id] = { ...(gameData.stats[id] || {}), ...obj }; saveGameData(); },
    status: items => $('#game-status').replaceChildren(...items.map(([label, value]) =>
      h('div', { class: 'gs-item' }, h('span', { class: 'gs-label' }, label), h('span', { class: 'gs-value' }, value)))),
    tools: nodes => $('#game-tools').replaceChildren(...nodes),
    banner: ({ title, text, actions = [] }) => {
      gameBanner.replaceChildren(h('div', { class: 'band-inner game-banner-inner' },
        h('h3', {}, title), text ? h('p', {}, text) : null,
        h('div', { class: 'actions' }, actions.map(a => h('button', { type: 'button', class: 'btn' + (a.primary ? ' primary' : ''), onclick: a.run }, a.label)))));
      gameBanner.hidden = false;
      const first = gameBanner.querySelector('.btn.primary') || gameBanner.querySelector('.btn');
      if (first) first.focus({ preventScroll: true });
    },
    clearBanner: () => { gameBanner.hidden = true; },
    bannerOpen: () => !gameBanner.hidden,
    confirm: (text, label, run) => api.banner({ title: text, actions: [{ label, primary: true, run: () => { api.clearBanner(); run(); } }, { label: 'Cancel', run: () => api.clearBanner() }] }),
    onKey: fn => keys.push(fn),
    toast,
  };
  let instance = null;
  try {
    instance = Games.mount(id, api);
  } catch (err) {
    // a damaged save shouldn't lock you out of a game: start it fresh
    console.warn('Game failed to load; starting fresh.', err);
    delete gameData.saves[id];
    stage.replaceChildren();
    instance = Games.mount(id, api);
  }
  gameSession = { id, instance, keys };
  stage.focus({ preventScroll: true });
}
function closeGame() {
  if (!gameSession) return;
  try { gameSession.instance && gameSession.instance.destroy(); } catch (err) { console.warn(err); }
  gameSession = null;
  flushGameData();
  gameOverlay.hidden = true;
  $('#game-stage').replaceChildren();
}
$('#game-back').addEventListener('click', closeGame);
// after clicking a toolbar button, hand the keyboard back to the game (so Enter or Space doesn't press the button again)
$('#game-tools').addEventListener('click', () => setTimeout(() => { if (gameSession && gameBanner.hidden) $('#game-stage').focus({ preventScroll: true }); }, 0));
gameBanner.addEventListener('click', e => { if (e.target.closest('.btn')) setTimeout(() => { if (gameSession && gameBanner.hidden) $('#game-stage').focus({ preventScroll: true }); }, 0); });
document.addEventListener('keydown', e => {
  if (!gameSession || e.key === 'Escape') return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  gameSession.keys.forEach(fn => fn(e));
});
window.addEventListener('pagehide', () => { if (gameSession) { try { gameSession.instance.destroy(); } catch { /* closing anyway */ } } flushGameData(); });

// ---------------------------------------------------------------- search
function clearSearch() {
  searchInput.value = '';
  searchQuery = '';
  $('#search-hint').hidden = true;
  renderGrid();
}
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  $('#search-hint').hidden = !searchQuery.trim();
  renderGrid();
  scroller.scrollLeft = 0;
});
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); clearSearch(); searchInput.blur(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  const first = grid.querySelector('.tile');
  const f = first && findTile(first.dataset.id);
  if (f && !e.shiftKey) {
    if (f.tile.type === 'folder') openFolder(f.tile.id);
    else openUrl(f.tile.url, e.ctrlKey || e.metaKey);
    return;
  }
  if (!/\s/.test(q) && /^[^.]+\.[a-z]{2,}(\S*)$/i.test(q)) { openUrl(normalizeUrl(q)); return; }
  webSearch(q);
});

// ---------------------------------------------------------------- global events
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (gameSession) {
      if (!gameBanner.hidden) gameBanner.hidden = true; // Esc only dismisses a message, never changes the game
      else closeGame();
      return;
    }
    if (!ctx.hidden) hideMenu();
    else if (!ed.overlay.hidden) closeEditor();
    else if (!headlines.overlay.hidden) closeHeadlines();
    else if (!bm.overlay.hidden) closeBookmarkImport();
    else if (!wp.overlay.hidden) closeGallery();
    else if (openFolderId) folderBack();
    else if (settingsPanel.classList.contains('open')) closeSettings();
    else if (searchInput.value) clearSearch();
    return;
  }
  // Like Windows 8: just start typing on Start to search
  if (gameSession) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (!ed.overlay.hidden || !headlines.overlay.hidden || !bm.overlay.hidden || !wp.overlay.hidden || openFolderId || settingsPanel.classList.contains('open') || !ctx.hidden) return;
  if (e.key === ' ') return;
  searchInput.focus();
});
document.addEventListener('pointerdown', e => { if (!ctx.hidden && !ctx.contains(e.target)) hideMenu(); });
window.addEventListener('blur', hideMenu);

scroller.addEventListener('wheel', e => {
  if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  scroller.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });

$('#btn-add').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  addMenu(r.right - 210, r.bottom + 6);
});
$('#btn-settings').addEventListener('click', openSettings);

bindTileEvents(grid, () => null);
bindTileEvents(folderGrid, () => openFolderId);
scroller.addEventListener('contextmenu', e => { if (!e.target.closest('.tile')) tileMenu(e, null); });

new ResizeObserver(debounce(() => { layoutGrid(); updateParallax(); }, 60)).observe(scroller);
window.addEventListener('resize', debounce(() => { if (openFolderId) renderFolder(); }, 120));

// ---- Windows 8 parallax: as the tiles scroll sideways, the wallpaper follows at a fraction of the speed
let parallaxQueued = false;
function parallaxOn() {
  return settings.parallax && settings.animations && !!settings.bg.image &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches && scroller.scrollWidth > scroller.clientWidth + 4;
}
function updateParallax() {
  const bgEl = document.getElementById('bg');
  if (!parallaxOn()) {
    bgEl.classList.remove('parallax');
    bgEl.style.transform = '';
    return;
  }
  // the picture gets up to 15% extra width; scrolling end to end slides across all of it
  const extra = Math.round(Math.min(window.innerWidth * 0.15, 260));
  const max = scroller.scrollWidth - scroller.clientWidth;
  const t = Math.min(1, Math.max(0, scroller.scrollLeft / max));
  bgEl.style.setProperty('--px-extra', `${extra}px`);
  bgEl.classList.add('parallax');
  bgEl.style.transform = `translate3d(${-Math.round(t * extra)}px, 0, 0)`;
}
scroller.addEventListener('scroll', () => {
  if (parallaxQueued) return;
  parallaxQueued = true;
  requestAnimationFrame(() => { parallaxQueued = false; updateParallax(); });
}, { passive: true });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', updateParallax);
setInterval(() => tickClock(), 1000);

// keep several open new-tab pages in sync
Store.onChange(changes => {
  if (changes.tiles && JSON.stringify(changes.tiles.newValue) !== JSON.stringify(tiles) &&
      !recentSaves.includes(JSON.stringify(changes.tiles.newValue))) {
    tiles = sanitizeTiles(changes.tiles.newValue);
    renderGrid();
    if (openFolderId) renderFolder();
  }
  if (changes.games && !gameSession && changes.games.newValue) {
    gameData = { saves: changes.games.newValue.saves || {}, stats: changes.games.newValue.stats || {} };
  }
  if (changes.settings && JSON.stringify(changes.settings.newValue) !== JSON.stringify(settings)) {
    settings = mergeSettings(changes.settings.newValue);
    applySettings();
    refreshWidgets();
    if (settingsPanel.classList.contains('open')) syncSettingsUI();
  }
});

// ---------------------------------------------------------------- toast
let toastTimer = null;
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(h('span', {}, msg));
  if (action) t.append(h('button', { type: 'button', onclick: () => { action.run(); t.classList.remove('show'); } }, action.label));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
}

// ---------------------------------------------------------------- start
(async function init() {
  await load();
  await Feeds.loadCache();
  const storedGames = await Store.get('games', null);
  if (storedGames && typeof storedGames === 'object') gameData = { saves: storedGames.saves || {}, stats: storedGames.stats || {} };
  // 1.8.0 turned the flip on for everyone; from 1.8.1 it's off unless you switch it on (done once, so your choice sticks)
  if (!settings.flipDefaultOff) {
    settings.flipOpen = false;
    settings.flipDefaultOff = true;
    saveSettings();
  }
  if (!settings.gamesAdded) {
    if (!everyTile().some(x => x.tile.type === 'game')) tiles.push(gamesFolder());
    settings.gamesAdded = true;
    settings.gamesAdded2 = true;
    settings.gamesAdded3 = true;
    saveTiles();
    saveSettings();
  }
  // 1.9: put the new games into the Games folder you already have (only once, and only if that folder still exists)
  if (!settings.gamesAdded2) {
    const have = new Set(everyTile().filter(x => x.tile.type === 'game').map(x => x.tile.game));
    const folder = everyTile().map(x => x.tile).find(t => t.type === 'folder' && t.children.some(c => c.type === 'game'));
    if (folder) NEW_IN_1_9.filter(g => !have.has(g)).forEach(g => folder.children.push(gameTile(g)));
    settings.gamesAdded2 = true;
    saveTiles();
    saveSettings();
  }
  // 1.12: the same for Cat Nap and Pairs
  if (!settings.gamesAdded3) {
    const have = new Set(everyTile().filter(x => x.tile.type === 'game').map(x => x.tile.game));
    const folder = everyTile().map(x => x.tile).find(t => t.type === 'folder' && t.children.some(c => c.type === 'game'));
    if (folder) NEW_IN_1_12.filter(g => !have.has(g)).forEach(g => folder.children.push(gameTile(g)));
    settings.gamesAdded3 = true;
    saveTiles();
    saveSettings();
  }
  applySettings();
  renderGrid();
  document.body.classList.add('ready');
  if (settings.animations) requestAnimationFrame(() => entrance(grid));
  refreshWeather();
  refreshFeeds();
  widgetCache = (await Store.get('widgetCache', null)) || { news: null, stocks: null };
  refreshWidgets();
  setInterval(() => refreshWidgets(), 60e3); // only refetches what's stale
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshWidgets(); });
  if (hasChromeStorage) chrome.storage.local.remove('liveCache').catch(() => {}); // leftover from the live-tiles version
  if (!(await Store.get('tiles', null))) saveTiles();
})();
