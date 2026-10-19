// Report and proof photos, shared so any device can show them.
//
// POST /api/photo { id, image: "data:image/jpeg;base64,..." }  -> stored for 60 days
// GET  /api/photo?id=<id>                                       -> the JPEG

import { HttpError } from './_lib/errors.js';
import { store } from './_lib/kv.js';
import { sendError } from './_lib/respond.js';

const PHOTO_ID = /^(report|proof)-[a-z0-9]+-[a-z0-9]+$/;
const DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/;
const MAX_BASE64 = 900_000; // stays under the store's 1 MB request limit
const KEEP_SECONDS = 60 * 24 * 3600;

const key = (id) => `safai-saathi:photo:${id}`;

function checkId(id) {
  if (!PHOTO_ID.test(String(id ?? ''))) throw new HttpError(400, 'bad_id', 'That is not a photo id.');
  return id;
}

export default async function handler(req, res) {
  if (!store) return res.status(404).json({ code: 'no_store', message: 'Photos are only kept on this device.' });
  try {
    if (req.method === 'GET') {
      const data = await store.get(key(checkId(req.query?.id)));
      if (!data) throw new HttpError(404, 'missing', 'No such photo.');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/jpeg');
      // A photo id is never reused, so the browser can keep it forever.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.end(Buffer.from(data, 'base64'));
    }
    if (req.method !== 'POST') return res.status(405).json({ code: 'method', message: 'Use GET or POST.' });

    const { id, image } = req.body ?? {};
    const match = DATA_URL.exec(String(image ?? ''));
    if (!match) throw new HttpError(400, 'bad_image', 'The photo was missing or not a JPEG.');
    if (match[1].length > MAX_BASE64) throw new HttpError(413, 'image_too_large', 'The photo is too large to share.');
    await store.set(key(checkId(id)), match[1], KEEP_SECONDS);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
