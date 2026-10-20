// Where the shared server lives. The website calls its own /api; the Android apps load their
// screens from inside the app, so their builds set VITE_API_ORIGIN to the live site
// (scripts/build-android.mjs).
const ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');

export const apiUrl = (path) => `${ORIGIN}${path}`;

// True inside the Android apps: no install banner, no service worker.
export const isNativeApp = import.meta.env.VITE_NATIVE === '1';
