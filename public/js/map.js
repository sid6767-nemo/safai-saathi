// An in-app map of a reported spot.
//
// With a Google Maps Embed key configured (MAPS_EMBED_KEY on the server), this embeds Google Maps.
// Without one it draws an OpenStreetMap map through Leaflet, which needs no key and no billing
// account. Either way the map is inside the page; the only external link is walking directions.

import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { formatCoords } from './geo.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`;
const LEAFLET_CSS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.css`;

let configPromise;
let leafletPromise;

function serverConfig() {
  configPromise ??= fetch('/api/config')
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}));
  return configPromise;
}

function loadLeaflet() {
  leafletPromise ??= new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.append(css);
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.append(script);
  });
  return leafletPromise;
}

function fallback(el, point) {
  el.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'map-fallback mono';
  p.textContent = t('map.unavailable', { coords: formatCoords(point) });
  el.append(p);
}

async function drawLeaflet(el, point) {
  const L = await loadLeaflet();
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  map.setView([point.lat, point.lng], 17);
  // The circle is the rule the proof photo has to satisfy, drawn to scale.
  L.circle([point.lat, point.lng], {
    radius: CONFIG.proofRadiusM,
    color: '#FFC20E',
    weight: 2,
    fillColor: '#FFC20E',
    fillOpacity: 0.18,
  }).addTo(map);
  L.circleMarker([point.lat, point.lng], {
    radius: 7,
    color: '#14161A',
    weight: 3,
    fillColor: '#E8336D',
    fillOpacity: 1,
  }).addTo(map);
  // The container is re-created on every render, so keep a handle for cleanup.
  el._map = map;
}

function drawGoogle(el, point, key) {
  const frame = document.createElement('iframe');
  frame.className = 'map-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer-when-downgrade';
  frame.title = t('map.title');
  frame.src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${point.lat},${point.lng}&zoom=17`;
  el.innerHTML = '';
  el.append(frame);
}

// Fills every <div data-map="lat,lng"> inside `root`.
export function mountMaps(root) {
  for (const el of root.querySelectorAll('[data-map]')) {
    const [lat, lng] = el.dataset.map.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const point = { lat, lng };
    serverConfig()
      .then((cfg) => (cfg.mapsEmbedKey ? drawGoogle(el, point, cfg.mapsEmbedKey) : drawLeaflet(el, point)))
      .catch(() => fallback(el, point));
  }
}
