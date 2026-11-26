'use strict';
/* Weather via Open-Meteo (free, no API key). Location from the browser, or a city the user picks. */
const Weather = (() => {
  const CACHE_KEY = 'weatherCache';
  const WEATHER_TTL = 30 * 60 * 1000;   // refresh every 30 minutes
  const COORDS_TTL = 6 * 60 * 60 * 1000; // re-locate every 6 hours

  const CLOUD_HIGH = 'M7 15h10a4 4 0 0 0 0-8h-.3A5.5 5.5 0 0 0 6.1 8.2 3.5 3.5 0 0 0 7 15z';
  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    cloud: '<path d="M7 19h10a4 4 0 0 0 0-8h-.3A5.5 5.5 0 0 0 6.1 12.2 3.5 3.5 0 0 0 7 19z"/>',
    partly: '<path d="M8 2.5V4M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1"/><path d="M5.2 10.8a3.2 3.2 0 0 1 5.9-2.6"/><path d="M9 20h8.5a3.5 3.5 0 0 0 0-7h-.2a4.8 4.8 0 0 0-9.2 1.5A2.8 2.8 0 0 0 9 20z"/>',
    partlyNight: '<path d="M11 7.5A4.5 4.5 0 0 1 5 2.5a4.5 4.5 0 1 0 6 5z"/><path d="M9 20h8.5a3.5 3.5 0 0 0 0-7h-.2a4.8 4.8 0 0 0-9.2 1.5A2.8 2.8 0 0 0 9 20z"/>',
    rain: `<path d="${CLOUD_HIGH}"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>`,
    snow: `<path d="${CLOUD_HIGH}"/><path stroke-width="2.2" d="M9 18.5h.01M13 18.5h.01M17 18.5h.01M11 21.5h.01M15 21.5h.01"/>`,
    storm: `<path d="${CLOUD_HIGH}"/><path d="M13 15.5l-2 3.5h3l-2 3.5"/>`,
    fog: '<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>',
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.cloud}</svg>`;
  }

  // WMO weather codes → label + icon
  function describe(code, isDay) {
    if (code === 0) return { text: 'Clear', icon: isDay ? 'sun' : 'moon' };
    if (code === 1) return { text: 'Mostly clear', icon: isDay ? 'partly' : 'partlyNight' };
    if (code === 2) return { text: 'Partly cloudy', icon: isDay ? 'partly' : 'partlyNight' };
    if (code === 3) return { text: 'Cloudy', icon: 'cloud' };
    if (code === 45 || code === 48) return { text: 'Fog', icon: 'fog' };
    if (code >= 51 && code <= 57) return { text: 'Drizzle', icon: 'rain' };
    if (code >= 61 && code <= 67) return { text: 'Rain', icon: 'rain' };
    if (code >= 80 && code <= 82) return { text: 'Showers', icon: 'rain' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: 'Snow', icon: 'snow' };
    if (code >= 95) return { text: 'Thunderstorms', icon: 'storm' };
    return { text: 'Weather', icon: 'cloud' };
  }

  function geolocate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'));
      // some systems never answer (e.g. a pending OS location prompt), so give up after 10 seconds regardless
      setTimeout(() => reject(new Error('Location request timed out')), 10000);
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        reject,
        { timeout: 8000, maximumAge: COORDS_TTL },
      );
    });
  }

  async function reverseName(lat, lon) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const j = await r.json();
      return j.city || j.locality || j.principalSubdivision || '';
    } catch {
      return '';
    }
  }

  // Approximate location from the internet connection, used when Chrome can't give a precise one
  async function ipLocate() {
    let j;
    try {
      const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en');
      j = await r.json();
    } catch {
      throw new Error('Can’t reach the internet to find your location. Check your connection.');
    }
    if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') {
      throw new Error('Couldn’t find your location. Choose a city in Personalize.');
    }
    return { lat: j.latitude, lon: j.longitude, name: j.city || j.locality || j.principalSubdivision || '' };
  }

  async function searchCity(q) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    if (!r.ok) throw new Error('City search failed');
    const j = await r.json();
    return (j.results || []).map(x => ({
      name: x.name,
      region: [x.admin1, x.country].filter(Boolean).join(', '),
      lat: x.latitude,
      lon: x.longitude,
      tz: x.timezone || '',
    }));
  }

  async function resolveLocation(loc, cache) {
    if (loc && loc.mode === 'manual' && loc.lat != null) return { lat: loc.lat, lon: loc.lon, name: loc.name };
    if (cache.auto && Date.now() - cache.auto.at < COORDS_TTL) return cache.auto;
    try {
      const c = await geolocate();
      const name = await reverseName(c.lat, c.lon);
      return { lat: c.lat, lon: c.lon, name, at: Date.now() };
    } catch (err) {
      // Location off in system settings, blocked, or too slow: fall back to an approximate location
      console.info('Precise location unavailable; using approximate location.', err && (err.message || err.code));
      return { ...(await ipLocate()), at: Date.now() };
    }
  }

  // `place` ({ name, lat, lon }) shows one of the extra weather places instead of your main location
  async function get(settings, { force = false, place = null } = {}) {
    const cache = (await Store.get(CACHE_KEY, null)) || {};
    const loc = place ? { lat: place.lat, lon: place.lon, name: place.name } : await resolveLocation(settings.location, cache);
    const units = settings.units === 'c' ? 'celsius' : 'fahrenheit';
    const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)},${units}`;
    const entries = cache.entries || {};
    const hit = entries[key];
    if (!force && hit && Date.now() - hit.at < WEATHER_TTL) return { ...hit.data, place: loc.name };

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min` +
      `&temperature_unit=${units}&timezone=auto&forecast_days=1`;
    let r;
    try {
      r = await fetch(url);
    } catch {
      throw new Error('Can’t reach the weather service. Check your internet connection.');
    }
    if (!r.ok) throw new Error(`The weather service didn’t answer (error ${r.status}). Try again later.`);
    const j = await r.json();
    const data = {
      temp: Math.round(j.current.temperature_2m),
      code: j.current.weather_code,
      isDay: !!j.current.is_day,
      hi: Math.round(j.daily.temperature_2m_max[0]),
      lo: Math.round(j.daily.temperature_2m_min[0]),
    };
    entries[key] = { at: Date.now(), data };
    // keep the newest dozen places
    const kept = Object.fromEntries(Object.entries(entries).sort((a, b) => b[1].at - a[1].at).slice(0, 12));
    const next = { entries: kept };
    if (!place && !(settings.location && settings.location.mode === 'manual')) next.auto = { lat: loc.lat, lon: loc.lon, name: loc.name, at: loc.at || Date.now() };
    else if (cache.auto) next.auto = cache.auto;
    await Store.set(CACHE_KEY, next);
    return { ...data, place: loc.name };
  }

  return { get, searchCity, describe, icon };
})();
