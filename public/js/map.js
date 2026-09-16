// An in-app map of a reported spot.
//
// With a Google Maps Embed key configured (MAPS_EMBED_KEY on the server), this embeds Google Maps.
// Without one it draws an OpenStreetMap map through Leaflet, which needs no key and no billing
// account. Both can be opened full screen; the Leaflet map can also draw the walking route from
// where the picker is standing, using OSRM's free routing service.

import { CONFIG } from './config.js';
import { distanceM, formatDistance, getPosition } from './geo.js';
import { t } from './i18n.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`;
const LEAFLET_CSS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.css`;
// OSRM's public demo server only serves its car profile, so the line it returns is a street route
// and its `duration` is a driving time. The shape is still what a picker would walk, but the time
// is estimated here from distance instead.
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const WALK_METRES_PER_MIN = 80; // ~4.8 km/h

let configPromise;
let leafletPromise;
let dialog;

const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

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

function button(className, label, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(el);
  });
  return el;
}

function fallback(el, point) {
  el.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'map-fallback mono';
  p.textContent = t('map.unavailable', { coords: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` });
  el.append(p);
}

// Draws the walk from where the picker is now to the spot, and says how far and how long.
async function showRoute(L, map, point, status) {
  status.textContent = t('map.routeBusy');
  let from;
  try {
    from = await getPosition();
  } catch {
    status.textContent = t('map.routeNoLocation');
    return;
  }
  const straight = distanceM(from, point);
  try {
    const url = `${OSRM}/${from.lng},${from.lat};${point.lng},${point.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error('no route');
    const line = L.geoJSON({ type: 'Feature', geometry: route.geometry }, {
      style: { color: cssVar('--info', '#2f7de1'), weight: 5, opacity: 0.9 },
    }).addTo(map);
    L.circleMarker([from.lat, from.lng], {
      radius: 6,
      color: '#fff',
      weight: 3,
      fillColor: cssVar('--info', '#2f7de1'),
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(t('map.you'));
    map.fitBounds(line.getBounds(), { padding: [24, 24] });
    const minutes = Math.max(1, Math.round(route.distance / WALK_METRES_PER_MIN));
    status.textContent = t('map.routeResult', { distance: formatDistance(route.distance), minutes });
  } catch {
    status.textContent = t('map.routeFailed', { distance: formatDistance(straight) });
  }
}

async function drawLeaflet(el, point, { big = false } = {}) {
  const L = await loadLeaflet();
  el._map?.remove();
  const map = L.map(el, { zoomControl: big, scrollWheelZoom: big, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  map.setView([point.lat, point.lng], 17);
  // The circle is the rule the proof photo has to satisfy, drawn to scale.
  L.circle([point.lat, point.lng], {
    radius: CONFIG.proofRadiusM,
    color: cssVar('--info', '#2f7de1'),
    weight: 2,
    fillColor: cssVar('--info', '#2f7de1'),
    fillOpacity: 0.15,
  }).addTo(map);
  L.circleMarker([point.lat, point.lng], {
    radius: 8,
    color: '#fff',
    weight: 3,
    fillColor: cssVar('--kumkum', '#e8336d'),
    fillOpacity: 1,
    className: 'map-pin',
  })
    .addTo(map)
    .bindTooltip(t('map.spot'));
  el._map = map;
  setTimeout(() => map.invalidateSize(), 150);
  return { L, map };
}

function drawGoogle(el, point, key, { big = false } = {}) {
  const frame = document.createElement('iframe');
  frame.className = 'map-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer-when-downgrade';
  frame.title = t('map.title');
  // `directions` mode shows Google's own walking route inside the page; `place` just pins it.
  frame.src = big
    ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&destination=${point.lat},${point.lng}&origin=My+Location&mode=walking`
    : `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${point.lat},${point.lng}&zoom=17`;
  el.innerHTML = '';
  el.append(frame);
}

// Full-screen map, so the action buttons stop covering it.
async function openBig(point) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'map-dialog';
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const holder = dialog.querySelector('.map-big');
      holder?._map?.remove();
      dialog.innerHTML = '';
    });
  }
  dialog.innerHTML = '';
  const holder = document.createElement('div');
  holder.className = 'map-big';
  const bar = document.createElement('div');
  bar.className = 'map-bar';
  const status = document.createElement('p');
  status.className = 'map-status';
  status.setAttribute('role', 'status');
  bar.append(status, button('btn btn-quiet map-close', t('map.close'), () => dialog.close()));
  dialog.append(holder, bar);
  dialog.showModal();

  const cfg = await serverConfig();
  if (cfg.mapsEmbedKey) {
    drawGoogle(holder, point, cfg.mapsEmbedKey, { big: true });
    status.textContent = t('map.googleWalking');
    return;
  }
  try {
    const { L, map } = await drawLeaflet(holder, point, { big: true });
    bar.prepend(button('btn btn-outline map-route', t('map.route'), (el) => {
      el.disabled = true;
      showRoute(L, map, point, status);
    }));
  } catch {
    fallback(holder, point);
  }
}

// Fills every <div data-map="lat,lng"> inside `root`, and adds its maximise button.
export function mountMaps(root) {
  for (const el of root.querySelectorAll('[data-map]')) {
    const [lat, lng] = el.dataset.map.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const point = { lat, lng };

    const expand = button('map-expand', '⤢', () => openBig(point));
    expand.setAttribute('aria-label', t('map.expand'));
    expand.title = t('map.expand');

    serverConfig()
      .then((cfg) => (cfg.mapsEmbedKey ? drawGoogle(el, point, cfg.mapsEmbedKey) : drawLeaflet(el, point)))
      .catch(() => fallback(el, point))
      .finally(() => el.append(expand));
  }
}
