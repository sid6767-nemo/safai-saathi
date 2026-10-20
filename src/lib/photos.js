// Photos live in IndexedDB: localStorage's ~5 MB quota fills up after a handful of images.

import { apiUrl } from './api.js';

const DB_NAME = 'safai-saathi';
const STORE = 'photos';
const urlCache = new Map();
let dbPromise;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const putPhoto = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const getPhoto = (id) => run('readonly', (s) => s.get(id));

export async function clearPhotos() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  await run('readwrite', (s) => s.clear());
}

// Returns something an <img src> can use: a static path for sample jobs, an object URL otherwise.
export async function photoUrl(ref) {
  if (!ref) return '';
  if (ref.startsWith('assets/')) return ref;
  if (urlCache.has(ref)) return urlCache.get(ref);
  const blob = await getPhoto(ref);
  // Not on this device: another device took it, so read the shared copy.
  if (!blob) return apiUrl(`/api/photo?id=${encodeURIComponent(ref)}`);
  const url = URL.createObjectURL(blob);
  urlCache.set(ref, url);
  return url;
}


export function newPhotoId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}
