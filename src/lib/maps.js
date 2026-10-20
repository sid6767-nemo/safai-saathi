// Map plumbing for components/SpotMap.jsx.
//
// With a Google Maps Embed key configured (MAPS_EMBED_KEY on the server), the map is Google Maps.
// Without one it is OpenStreetMap through Leaflet, which needs no key and no billing account.

import { apiUrl } from './api.js';
import { CONFIG } from './config.js';
import { cssVar } from './css.js';
import { distanceM, formatDistance, getPosition } from './geo.js';
import { t } from './i18n.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`;
const LEAFLET_CSS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.css`;
// A walking route from the FOSSGIS OSRM server (OpenStreetMap Germany). It follows footpaths and
// ignores one-way streets; the car-only demo server sent a picker 2 km round Bengaluru's one-way
// loops to reach a spot 1 m away.
const WALK_ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';

let configPromise;
let leafletPromise;

export function mapConfig() {
  configPromise ??= fetch(apiUrl('/api/config'))
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

// Draws the spot, its pin and the proof circle into `el`. Resolves to a handle with destroy().
export async function mountLeaflet(el, point, { big = false } = {}) {
  const L = await loadLeaflet();
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
  setTimeout(() => map.invalidateSize(), 150);
  return { L, map, destroy: () => map.remove() };
}

// `directions` mode shows Google's own walking route inside the page; `place` just pins the spot.
export function mountGoogle(el, point, key, { big = false } = {}) {
  const frame = document.createElement('iframe');
  frame.className = 'map-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer-when-downgrade';
  frame.title = t('map.title');
  frame.src = big
    ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&destination=${point.lat},${point.lng}&origin=My+Location&mode=walking`
    : `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${point.lat},${point.lng}&zoom=17`;
  el.replaceChildren(frame);
  return () => frame.remove();
}

// Draws the walk from where the picker is now to the spot. Resolves to the line to show.
export async function walkFromHere({ L, map }, point) {
  let from;
  try {
    from = await getPosition();
  } catch {
    return t('map.routeNoLocation');
  }
  // Inside the proof circle there's nothing to walk.
  const straight = distanceM(from, point);
  if (straight <= CONFIG.proofRadiusM) return t('map.routeHere', { distance: formatDistance(straight) });
  try {
    const url = `${WALK_ROUTER}/${from.lng},${from.lat};${point.lng},${point.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const route = (await res.json())?.routes?.[0];
    if (!route) throw new Error('no route');
    const line = L.geoJSON(
      { type: 'Feature', geometry: route.geometry },
      { style: { color: cssVar('--info', '#2f7de1'), weight: 5, opacity: 0.9 } },
    ).addTo(map);
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
    const minutes = Math.max(1, Math.round(route.duration / 60));
    return t('map.routeResult', { distance: formatDistance(route.distance), minutes });
  } catch {
    return t('map.routeFailed', { distance: formatDistance(straight) });
  }
}
