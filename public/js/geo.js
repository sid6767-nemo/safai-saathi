// Location: live GPS reads, distance maths, and the copy shown when location fails.

export class GeoError extends Error {
  constructor(kind) {
    super(`Location error: ${kind}`);
    this.kind = kind;
  }
}

// Copy for each kind lives in the language files as geo.<kind>.title / .body / .fix
const OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };

function toFix(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Math.round(position.coords.accuracy),
    at: Date.now(),
  };
}

function toGeoError(err) {
  if (err.code === 1) return new GeoError('denied');
  if (err.code === 3) return new GeoError('timeout');
  return new GeoError('unavailable');
}

function unavailableReason() {
  if (!window.isSecureContext) return new GeoError('insecure');
  if (!('geolocation' in navigator)) return new GeoError('unsupported');
  return null;
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    const blocked = unavailableReason();
    if (blocked) return reject(blocked);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toFix(p)),
      (e) => reject(toGeoError(e)),
      OPTIONS,
    );
  });
}

// Keeps a fresh fix while a camera is open, so the photo and its location are read together.
export function watchPosition(onFix, onError) {
  const blocked = unavailableReason();
  if (blocked) {
    onError(blocked);
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(toFix(p)),
    (e) => onError(toGeoError(e)),
    OPTIONS,
  );
  return () => navigator.geolocation.clearWatch(id);
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg) => (deg * Math.PI) / 180;

// Haversine distance in metres.
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// A point `northM` metres north and `eastM` metres east of `origin`.
export function offsetM(origin, northM, eastM) {
  const lat = origin.lat + northM / 111_320;
  const lng = origin.lng + eastM / (111_320 * Math.cos(rad(origin.lat)));
  return { lat, lng };
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export const METRE_UNIT = 'm';

export function formatCoords({ lat, lng }) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
