// The shared job list, so phones and laptops see the same reports.
//
// GET  /api/state?v=<version>&epoch=<epoch>  -> every job, or { unchanged } if nothing has moved
// POST /api/state { epoch, anchor?, jobs }     -> merge in a device's changes (newest change wins)
// POST /api/state { reset: true }              -> a fresh, empty set (Demo controls -> Reset)
//
// Every answer includes `configured`; without a store the app stays on-device only.
// Photos are stored separately (api/photo.js).

import { randomUUID } from 'node:crypto';
import { CONFIG } from '../src/lib/config.js';
import { HttpError } from './_lib/errors.js';
import { store } from './_lib/kv.js';
import { sendError } from './_lib/respond.js';

const KEY = 'safai-saathi:state';
const MAX_JOBS_PER_SYNC = 50;
const MAX_BODY_CHARS = 300_000;
const JOB_ID = /^SS-[A-Z0-9]{3,6}$/;

const empty = () => ({ epoch: null, version: 0, anchor: null, jobs: [] });

async function read() {
  const raw = await store.get(KEY);
  return { raw, state: raw ? JSON.parse(raw) : empty() };
}

// The same rule the app applies: once enough real reports exist, untaken sample jobs go.
function retireSamples(s) {
  const real = s.jobs.filter((j) => !j.sample && j.status !== 'cancelled').length;
  if (real >= CONFIG.samplesUntilReports) s.jobs = s.jobs.filter((j) => !(j.sample && j.status === 'open'));
}

function checkJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length > MAX_JOBS_PER_SYNC) {
    throw new HttpError(400, 'bad_jobs', 'The job list was missing or too long.');
  }
  for (const job of jobs) {
    if (!job || typeof job !== 'object' || !JOB_ID.test(String(job.id)) || typeof job.status !== 'string') {
      throw new HttpError(400, 'bad_job', 'A job was not in the expected shape.');
    }
  }
  return jobs;
}

// Each job keeps whichever copy was changed most recently; the first location ever sent fixes
// where the simulated pickers and sample jobs sit, for everyone.
function merge(state, { epoch, anchor, jobs }) {
  const next = { ...state, jobs: [...state.jobs] };
  next.epoch ||= epoch || randomUUID();
  if (!next.anchor && anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng)) {
    next.anchor = { lat: anchor.lat, lng: anchor.lng, source: String(anchor.source ?? 'gps') };
  }
  const at = new Map(next.jobs.map((job, i) => [job.id, i]));
  for (const job of jobs) {
    const i = at.get(job.id);
    if (i === undefined) {
      at.set(job.id, next.jobs.length);
      next.jobs.push(job);
    } else if ((job.updatedAt ?? 0) > (next.jobs[i].updatedAt ?? 0)) {
      next.jobs[i] = job;
    }
  }
  retireSamples(next);
  next.version = state.version + 1;
  return next;
}

export default async function handler(req, res) {
  if (!store) return res.status(200).json({ configured: false });
  try {
    if (req.method === 'GET') {
      const { state } = await read();
      const same = state.epoch && state.epoch === req.query?.epoch && state.version === Number(req.query?.v);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(same ? { configured: true, unchanged: true } : { configured: true, ...state });
    }
    if (req.method !== 'POST') return res.status(405).json({ code: 'method', message: 'Use GET or POST.' });

    const body = req.body ?? {};
    if (JSON.stringify(body).length > MAX_BODY_CHARS) throw new HttpError(413, 'too_large', 'Too much data in one sync.');

    // Read, merge, write only if nobody else wrote in between; otherwise read again.
    for (let attempt = 0; attempt < 6; attempt++) {
      const { raw, state } = await read();
      let next;
      if (body.reset) {
        next = { ...empty(), epoch: randomUUID(), version: state.version + 1 };
      } else {
        // A device still holding a set that was reset elsewhere gets the new set back instead.
        if (body.epoch && state.epoch && body.epoch !== state.epoch) {
          return res.status(409).json({ configured: true, stale: true, ...state });
        }
        next = merge(state, { epoch: body.epoch, anchor: body.anchor, jobs: checkJobs(body.jobs ?? []) });
      }
      if (await store.cas(KEY, raw, JSON.stringify(next))) return res.status(200).json({ configured: true, ...next });
    }
    throw new HttpError(503, 'busy', 'Too many changes at once. Try again in a moment.');
  } catch (err) {
    sendError(res, err);
  }
}
