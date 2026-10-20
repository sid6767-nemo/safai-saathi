// GET /api/config -> { mapsEmbedKey }
//
// A Google Maps Embed key is meant to be visible in the page (restrict it by HTTP referrer in the
// Google Cloud console). Without one, the app draws an OpenStreetMap map instead.

import { allowApps } from './_lib/respond.js';

export default async function handler(req, res) {
  if (allowApps(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ code: 'method', message: 'Use GET.' });
  }
  res.status(200).json({ mapsEmbedKey: process.env.MAPS_EMBED_KEY || null });
}
