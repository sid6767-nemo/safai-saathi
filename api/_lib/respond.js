import { HttpError } from './errors.js';

// The Android apps show their screens from https://localhost inside the app, so the API also
// answers that origin. Returns true when it has already answered a CORS preflight.
const APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

export function allowApps(req, res) {
  const origin = req.headers?.origin;
  if (APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method !== 'OPTIONS') return false;
  res.statusCode = 204;
  res.end();
  return true;
}

// Turns a thrown error into the JSON shape the app shows: a status, a code and a readable message.
export function sendError(res, err) {
  if (!(err instanceof HttpError)) console.error(err);
  const e = err instanceof HttpError ? err : new HttpError(500, 'server_error', 'Something went wrong on the server.');
  res.status(e.status).json({ code: e.code, message: e.message });
}
