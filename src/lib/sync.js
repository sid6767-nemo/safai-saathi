// Keeps this device's jobs in step with every other device through /api/state.
//
// Every few seconds (and right after a change here) it pulls the shared list, folds it in, and
// pushes any job this device changed more recently than the server has seen. Photos go up first,
// so a job never reaches another device before its picture does. With no shared store on the
// server, it stops and the app stays on-device only.

import { getPhoto } from './photos.js';
import { applyRemote, getState, subscribe } from './store.js';

const POLL_MS = 4000;
const UPLOADED_KEY = 'safai-saathi:uploaded';

let configured = null;
let remote = null; // the last shared state seen
let busy = false;
let again = false;
let soon = 0;

function uploadedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(UPLOADED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function markUploaded(id) {
  const set = uploadedSet();
  set.add(id);
  try {
    localStorage.setItem(UPLOADED_KEY, JSON.stringify([...set]));
  } catch {
    // Worst case the photo uploads again next time.
  }
}

// A smaller copy for sharing: phones and the store both prefer ~200 KB to ~1 MB.
async function shareableDataUrl(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length < 880_000) return url;
  }
  return null;
}

// True once every photo this job shows is on the server (or isn't this device's to send).
async function uploadPhotos(job) {
  const done = uploadedSet();
  for (const ref of [job.photo, job.afterPhoto]) {
    if (!ref || ref.startsWith('assets/') || done.has(ref)) continue;
    const blob = await getPhoto(ref);
    if (!blob) continue; // taken on another device, so already shared
    const image = await shareableDataUrl(blob);
    if (!image) return false;
    const res = await fetch('/api/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ref, image }),
    });
    if (!res.ok) return false;
    markUploaded(ref);
  }
  return true;
}

function take(data) {
  remote = data;
  applyRemote(data);
}

async function pull() {
  const { epoch } = getState();
  const v = remote?.version ?? -1;
  const res = await fetch(`/api/state?v=${v}&epoch=${encodeURIComponent(epoch ?? '')}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`state ${res.status}`);
  const data = await res.json();
  configured = Boolean(data.configured);
  if (configured && !data.unchanged) take(data);
}

async function push() {
  const s = getState();
  const seen = new Map((remote?.jobs ?? []).map((job) => [job.id, job]));
  const changed = s.jobs.filter((job) => {
    const theirs = seen.get(job.id);
    return !theirs || (job.updatedAt ?? 0) > (theirs.updatedAt ?? 0);
  });
  const ready = [];
  for (const job of changed) if (await uploadPhotos(job)) ready.push(job);
  if (!ready.length) return;
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ epoch: s.epoch, jobs: ready }),
  });
  if (res.ok || res.status === 409) take(await res.json());
}

async function tick() {
  if (configured === false || document.hidden) return;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    await pull();
    if (configured) await push();
  } catch {
    // Offline or a server hiccup: the next tick tries again.
  } finally {
    busy = false;
    if (again) {
      again = false;
      schedule();
    }
  }
}

function schedule(ms = 400) {
  clearTimeout(soon);
  soon = setTimeout(tick, ms);
}

export function startSync() {
  tick();
  setInterval(tick, POLL_MS);
  subscribe(() => schedule());
  document.addEventListener('visibilitychange', () => !document.hidden && tick());
}

// Demo controls -> Reset: empties the shared set for every device, not just this one.
export async function resetShared() {
  if (!configured) return;
  remote = null;
  try {
    localStorage.removeItem(UPLOADED_KEY);
  } catch {
    // Nothing to forget.
  }
  await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset: true }),
  }).catch(() => {});
}
