'use strict';
/* News feed tiles: read an RSS or Atom feed, find each story's picture, and keep the latest stories saved
   so tiles show up instantly (and offline). Everything runs in the browser; nothing goes through a server. */
const Feeds = (() => {
  const CACHE_KEY = 'feedCache';
  const TTL = 20 * 60e3;        // refresh a feed every 20 minutes
  const RETRY = 5 * 60e3;       // after an error, try again in 5 minutes
  const KEEP = 20;              // stories kept per feed

  // Ready-made feeds. `site` is what the tile opens when there's no story to show.
  const PRESETS = [
    { name: 'BBC News', feed: 'https://feeds.bbci.co.uk/news/rss.xml', site: 'https://www.bbc.com/news', color: '#b91d47' },
    { name: 'NPR News', feed: 'https://feeds.npr.org/1001/rss.xml', site: 'https://www.npr.org', color: '#2b5797' },
    { name: 'The New York Times', feed: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', site: 'https://www.nytimes.com', color: '#1d1d1d' },
    { name: 'The Guardian', feed: 'https://www.theguardian.com/world/rss', site: 'https://www.theguardian.com', color: '#2b5797' },
    { name: 'The Verge', feed: 'https://www.theverge.com/rss/index.xml', site: 'https://www.theverge.com', color: '#603cba' },
    { name: 'Ars Technica', feed: 'https://feeds.arstechnica.com/arstechnica/index', site: 'https://arstechnica.com', color: '#da532c' },
    { name: 'Google News', feed: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', site: 'https://news.google.com', color: '#2d89ef' },
  ];

  // ---- reading the XML
  const kids = (el, name) => [...el.children].filter(c => c.localName === name);
  const first = (el, name) => kids(el, name)[0] || null;
  const text = (el, name) => { const n = first(el, name); return n ? n.textContent.trim() : ''; };
  const plain = s => (/[<&]/.test(s) ? (new DOMParser().parseFromString(s, 'text/html').body.textContent || '') : s).replace(/\s+/g, ' ').trim();
  const abs = (u, base) => { try { const x = new URL(u, base); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
  const isImageUrl = u => /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(u);

  // The picture for one story: media:thumbnail / media:content (the largest sensible one), an image
  // enclosure, itunes:image, or the first real <img> in the story's HTML.
  function storyImage(el, base) {
    const media = [];
    const collect = node => {
      for (const c of node.children) {
        const n = c.localName;
        if (n === 'group') collect(c);
        else if (n === 'thumbnail' || n === 'content') {
          const url = c.getAttribute('url');
          const type = c.getAttribute('type') || '';
          const medium = c.getAttribute('medium') || '';
          if (!url) continue;
          if (n === 'content' && !(medium === 'image' || type.startsWith('image/') || isImageUrl(url))) continue;
          media.push({ url, w: parseInt(c.getAttribute('width'), 10) || 0 });
        }
      }
    };
    collect(el);
    if (media.length) {
      // prefer the biggest one that's still a reasonable size for a tile
      const ok = media.filter(m => !m.w || m.w <= 1600);
      const pick = (ok.length ? ok : media).sort((a, b) => b.w - a.w)[0];
      const u = abs(pick.url, base);
      if (u) return u;
    }
    for (const enc of [...kids(el, 'enclosure'), ...kids(el, 'link').filter(l => l.getAttribute('rel') === 'enclosure')]) {
      const url = enc.getAttribute('url') || enc.getAttribute('href') || '';
      const type = enc.getAttribute('type') || '';
      if (url && (type.startsWith('image/') || (!type && isImageUrl(url)))) { const u = abs(url, base); if (u) return u; }
    }
    const it = first(el, 'image');
    if (it && (it.getAttribute('href') || it.textContent.trim())) { const u = abs(it.getAttribute('href') || it.textContent.trim(), base); if (u) return u; }
    for (const name of ['encoded', 'content', 'description', 'summary']) {
      const html = text(el, name);
      if (!html || !/<img/i.test(html)) continue;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const img of doc.querySelectorAll('img')) {
        const w = parseInt(img.getAttribute('width'), 10);
        const hh = parseInt(img.getAttribute('height'), 10);
        if ((w && w < 60) || (hh && hh < 60)) continue; // tracking pixels and tiny icons
        const src = img.getAttribute('src') || (img.getAttribute('srcset') || '').split(/\s+/)[0];
        const u = src && abs(src, base);
        if (u && !/feedburner|pixel|tracker|\/stat/i.test(u)) return u;
      }
    }
    return '';
  }

  function storyLink(el, base) {
    const links = kids(el, 'link');
    // Atom: <link rel="alternate" href>; RSS: <link>url</link> (skip <atom:link rel="self"> and enclosures)
    const alt = links.find(l => l.getAttribute('href') && (l.getAttribute('rel') || 'alternate') === 'alternate');
    const plainLink = links.find(l => !l.getAttribute('href') && l.textContent.trim());
    const guid = first(el, 'guid');
    const guidUrl = guid && guid.getAttribute('isPermaLink') !== 'false' && /^https?:/i.test(guid.textContent.trim()) ? guid.textContent.trim() : '';
    const raw = (alt && alt.getAttribute('href')) || (plainLink && plainLink.textContent.trim()) || guidUrl;
    return abs(raw, base);
  }

  function storyDate(el) {
    for (const name of ['pubDate', 'published', 'updated', 'date']) {
      const t = Date.parse(text(el, name));
      if (!Number.isNaN(t)) return t;
    }
    return 0;
  }

  // Parse feed XML. Returns null if it isn't a feed.
  function parse(xml, base) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    const root = doc.documentElement;
    const channel = root.localName === 'rss' ? first(root, 'channel') : root.localName === 'RDF' ? first(root, 'channel') : root.localName === 'feed' ? root : null;
    if (!channel) return null;
    const nodes = root.localName === 'feed' ? kids(root, 'entry') : [...(root.localName === 'RDF' ? kids(root, 'item') : kids(channel, 'item'))];
    const siteLink = storyLink(channel, base);
    const items = nodes.slice(0, KEEP).map(el => {
      let title = plain(text(el, 'title'));
      let source = plain(text(el, 'source'));
      // Google News titles end in " - Source"
      const dash = title.lastIndexOf(' - ');
      if (/news\.google\./.test(base) && dash > 20) { source = source || title.slice(dash + 3); title = title.slice(0, dash); }
      return { title, link: storyLink(el, base), image: storyImage(el, base), date: storyDate(el), source };
    }).filter(i => i.title && i.link);
    return { title: plain(text(channel, 'title')), site: siteLink, items };
  }

  async function get(url) {
    let r;
    try { r = await fetch(url, { credentials: 'omit', cache: 'no-cache' }); } catch { throw new Error('Can’t reach this feed.'); }
    if (!r.ok) throw new Error(`The site answered with error ${r.status}.`);
    return { text: await r.text(), url: r.url || url, type: r.headers.get('content-type') || '' };
  }

  async function fetchFeed(url) {
    const res = await get(url);
    const feed = parse(res.text, res.url);
    if (!feed) throw new Error('That address isn’t a news feed.');
    if (!feed.items.length) throw new Error('This feed has no stories right now.');
    return feed;
  }

  // From a site or feed address, find the feed. Returns { feed (url), title, site, items } or throws.
  // Only reads hosts the extension may already read; `needs` in the error lists any other host it has to ask for.
  async function discover(input) {
    const res = await get(input);
    const direct = parse(res.text, res.url);
    if (direct) return { feed: res.url, title: direct.title, site: direct.site || origin(res.url), items: direct.items };
    const doc = new DOMParser().parseFromString(res.text, 'text/html');
    const found = [...doc.querySelectorAll('link[rel~="alternate"][href]')]
      .filter(l => /(rss|atom)\+xml|application\/xml|text\/xml/i.test(l.getAttribute('type') || ''))
      .map(l => abs(l.getAttribute('href'), res.url)).filter(Boolean);
    const guesses = found.length ? found : ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feeds/posts/default'].map(p => abs(p, res.url));
    const siteTitle = plain((doc.querySelector('meta[property="og:site_name"]') || {}).content || doc.title || '');
    for (const u of guesses) {
      if (!(await canRead(u))) {
        const err = new Error(`The feed for this site is on ${new URL(u).hostname}.`);
        err.needs = u;
        throw err;
      }
      try {
        const feed = await fetchFeed(u);
        return { feed: u, title: feed.title || siteTitle, site: feed.site || origin(res.url), items: feed.items };
      } catch { /* try the next one */ }
    }
    throw new Error('Couldn’t find a news feed on that site. Try pasting the feed’s address instead.');
  }

  const origin = u => { try { return new URL(u).origin; } catch { return ''; } };
  const originsFor = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? [`https://${x.hostname}/*`, `http://${x.hostname}/*`] : []; } catch { return []; } };
  async function canRead(u) {
    if (typeof chrome === 'undefined' || !chrome.permissions) return true;
    try { return await chrome.permissions.contains({ origins: originsFor(u) }); } catch { return false; }
  }

  // ---- saved stories
  let cache = null;
  async function loadCache() {
    if (!cache) cache = (await Store.get(CACHE_KEY, null)) || {};
    return cache;
  }
  const cached = url => (cache && cache[url]) || null;
  async function save(url, entry) {
    await loadCache();
    cache[url] = entry;
    // forget feeds no tile uses any more happens in prune()
    try { await Store.set(CACHE_KEY, cache); } catch { /* storage full: keep it in memory */ }
  }
  async function prune(urls) {
    await loadCache();
    const keep = new Set(urls);
    let changed = false;
    for (const k of Object.keys(cache)) if (!keep.has(k)) { delete cache[k]; changed = true; }
    if (changed) { try { await Store.set(CACHE_KEY, cache); } catch { /* ignore */ } }
  }
  const stale = url => { const c = cached(url); return !c || Date.now() - c.at > (c.error ? RETRY : TTL); };

  // Refresh one feed; keeps the old stories if the refresh fails
  async function refresh(url) {
    const old = cached(url);
    const kept = { items: (old && old.items) || [], title: old && old.title, site: old && old.site, seen: old && old.seen };
    if (!(await canRead(url))) {
      await save(url, { ...kept, at: Date.now(), needsAccess: true });
      return cached(url);
    }
    try {
      const feed = await fetchFeed(url);
      // `seen`: when stories were last looked at, so small tiles can count new ones
      await save(url, { at: Date.now(), title: feed.title, site: feed.site, items: feed.items, seen: (old && old.seen) || Date.now() });
    } catch (err) {
      await save(url, { ...kept, at: Date.now(), error: err.message || 'Can’t load this feed.' });
    }
    return cached(url);
  }

  async function markSeen(url) {
    const c = cached(url);
    if (c) await save(url, { ...c, seen: Date.now() });
  }
  // A new feed tile starts with the stories found while adding it
  const remember = (url, feed) => save(url, { at: Date.now(), title: feed.title, site: feed.site, items: feed.items, seen: Date.now() });

  function ago(t) {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60e3);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const hrs = Math.round(m / 60);
    if (hrs < 24) return `${hrs}h`;
    const d = Math.round(hrs / 24);
    return d < 7 ? `${d}d` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return { PRESETS, TTL, parse, fetchFeed, discover, originsFor, canRead, loadCache, cached, save, prune, stale, refresh, markSeen, remember, ago };
})();
