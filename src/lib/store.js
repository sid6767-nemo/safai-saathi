// All app state: the job state machine, persisted to localStorage, kept in sync across tabs, and
// shared with every other device through lib/sync.js. The website (reporters) and the picker app
// read and write the same jobs.
//
// Job lifecycle:  open -> accepted -> verified_hold -> released
//                                  -> review      (AI check unavailable; a person decides)
//                    verified_hold -> disputed    (reporter flagged it during the hold)
//                    open          -> cancelled   (reporter withdrew it)
// Failed proof attempts are logged on job.attempts; the job stays "accepted" so the picker can retry.

import { CONFIG } from './config.js';
import { distanceM } from './geo.js';
import { estimatePayout } from './payout.js';
import { clearPhotos } from './photos.js';

const KEY = 'safai-saathi:v1';
const listeners = new Set();

const blank = () => ({
  epoch: null, // which shared job set this device follows (see lib/sync.js)
  jobs: [],
  demo: { spoofLocation: false, clockSkew: false, aiOffline: false },
});

// The demo build had drawn sample jobs; real ones only from here on.
const realJobs = (jobs) => (jobs ?? []).filter((j) => !j.sample);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...blank(), epoch: saved.epoch ?? null, jobs: realJobs(saved.jobs), demo: { ...blank().demo, ...saved.demo } };
    }
  } catch {
    // Corrupt or blocked storage: start fresh rather than break the app.
  }
  return blank();
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save app state', err);
  }
}

function emit() {
  for (const fn of [...listeners]) fn(state);
}

// Re-reads storage before every change so two tabs can't both accept the same job. Every job that
// changes is stamped with the time, so when devices sync, the latest change wins.
function commit(mutate) {
  state = load();
  const before = new Map(state.jobs.map((j) => [j.id, JSON.stringify(j)]));
  const result = mutate(state);
  const now = Date.now();
  for (const job of state.jobs) {
    const was = before.get(job.id);
    if (was === undefined ? job.updatedAt === undefined : was !== JSON.stringify(job)) job.updatedAt = now;
  }
  save();
  emit();
  return result;
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    emit();
  }
});

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class JobError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// No 0/O or 1/I, so a code can't be misread. 256 is a multiple of 32, so there's no modulo bias.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => CODE_ALPHABET[b % 32]).join('');
}

function findJob(s, id) {
  const job = s.jobs.find((j) => j.id === id);
  if (!job) throw new JobError('missing', 'This job no longer exists.');
  return job;
}

export function createReport({ fix, locationSource, photo, analysis }) {
  return commit((s) => {
    let id;
    do id = `SS-${randomCode(4)}`;
    while (s.jobs.some((j) => j.id === id));
    const job = {
      id,
      status: 'open',
      createdAt: Date.now(),
      acceptedBy: null,
      acceptedByName: null,
      acceptedAt: null,
      proof: null,
      attempts: [],
      photo,
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      locationSource,
      analysis,
      payout: estimatePayout(analysis.wasteType, analysis.severity),
    };
    s.jobs.unshift(job);
    return job;
  });
}

// `picker` is the picker app's profile: { id, name }. The name is what the reporter sees.
export function acceptJob(id, picker) {
  return commit((s) => {
    const job = findJob(s, id);
    if (job.status !== 'open') throw new JobError('taken', 'Another picker accepted this job a moment ago.');
    if (s.jobs.some((j) => j.acceptedBy === picker.id && j.status === 'accepted')) {
      throw new JobError('busy', 'Finish your current job before accepting another.');
    }
    Object.assign(job, { status: 'accepted', acceptedBy: picker.id, acceptedByName: picker.name, acceptedAt: Date.now() });
    return job;
  });
}

// A picker can hand a job back: it returns to the queue for everyone, and the code stops working.
export function cancelJob(id, pickerId) {
  commit((s) => {
    const job = findJob(s, id);
    if (job.status !== 'accepted' || job.acceptedBy !== pickerId) {
      throw new JobError('notyours', 'This job is no longer yours to give up.');
    }
    Object.assign(job, {
      status: 'open',
      acceptedBy: null,
      acceptedByName: null,
      acceptedAt: null,
      proof: null,
      attempts: [],
      givenUp: (job.givenUp ?? 0) + 1,
    });
  });
}

// The reporter can withdraw a spot while nobody has accepted it.
export function withdrawReport(id) {
  commit((s) => {
    const job = findJob(s, id);
    if (job.status !== 'open') {
      throw new JobError('late', 'A picker has already accepted this report.');
    }
    Object.assign(job, { status: 'cancelled', cancelledAt: Date.now() });
  });
}

export const codeExpired = (proof, at = Date.now()) => !proof || at - proof.issuedAt > CONFIG.codeTtlMin * 60_000;

// Issues a fresh one-time code unless the current one is still valid.
export function ensureCode(id) {
  return commit((s) => {
    const job = findJob(s, id);
    if (codeExpired(job.proof)) job.proof = { code: randomCode(6), issuedAt: Date.now() };
    return job.proof;
  });
}

export function recordAttempt(id, attempt) {
  commit((s) => {
    findJob(s, id).attempts.push({ at: Date.now(), ...attempt });
  });
}

export function markVerified(id, proofRecord) {
  commit((s) => {
    Object.assign(findJob(s, id), {
      ...proofRecord,
      status: 'verified_hold',
      verifiedAt: Date.now(),
      releaseAt: Date.now() + CONFIG.holdHours * 3_600_000,
    });
  });
}

export function markReview(id, proofRecord) {
  commit((s) => {
    Object.assign(findJob(s, id), { ...proofRecord, status: 'review', reviewAt: Date.now() });
  });
}

export function flagJob(id) {
  commit((s) => {
    const job = findJob(s, id);
    if (job.status !== 'verified_hold') {
      throw new JobError('late', 'The hold has ended, so this cleanup can no longer be flagged.');
    }
    Object.assign(job, { status: 'disputed', disputedAt: Date.now() });
  });
}

export function releaseDue() {
  const due = (j) => j.status === 'verified_hold' && j.releaseAt <= Date.now();
  if (!state.jobs.some(due)) return;
  commit((s) => {
    for (const j of s.jobs) if (due(j)) Object.assign(j, { status: 'released', releasedAt: Date.now() });
  });
}

// Demo controls
export function skipHolds() {
  commit((s) => {
    for (const j of s.jobs) if (j.status === 'verified_hold') j.releaseAt = Date.now();
  });
}

export function expireCodes() {
  commit((s) => {
    for (const j of s.jobs) if (j.proof) j.proof.issuedAt = Date.now() - (CONFIG.codeTtlMin + 1) * 60_000;
  });
}

export function setDemo(patch) {
  commit((s) => Object.assign(s.demo, patch));
}

// Folds the shared job list into this device's copy (lib/sync.js calls this). Each job keeps
// whichever side changed it last. If the shared set was reset on another device, this device
// drops its copy and follows the new one.
export function applyRemote(remote) {
  const local = load();
  const resetElsewhere = Boolean(local.epoch && remote.epoch && local.epoch !== remote.epoch);
  let jobs = realJobs(remote.jobs);
  if (!resetElsewhere) {
    const byId = new Map(local.jobs.map((j) => [j.id, j]));
    for (const job of jobs) {
      const mine = byId.get(job.id);
      if (!mine || (job.updatedAt ?? 0) >= (mine.updatedAt ?? 0)) byId.set(job.id, job);
    }
    jobs = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  state = { ...local, epoch: remote.epoch ?? local.epoch, jobs };
  save();
  emit();
}

export async function resetAll() {
  localStorage.removeItem(KEY);
  state = blank();
  await clearPhotos();
  save();
  emit();
}

// Selectors
export const activeJobFor = (s, pickerId) => s.jobs.find((j) => j.acceptedBy === pickerId && j.status === 'accepted');

// Nearest first once the phone knows where it is; newest first until then.
export function openJobsFor(s, here) {
  return s.jobs
    .filter((j) => j.status === 'open')
    .map((job) => ({ job, distance: here ? distanceM(here, job) : null }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || b.job.createdAt - a.job.createdAt);
}

const HELD = ['verified_hold', 'review', 'disputed'];

export function earningsFor(s, pickerId) {
  const mine = s.jobs.filter((j) => j.acceptedBy === pickerId);
  const paid = mine.filter((j) => j.status === 'released');
  const held = mine.filter((j) => HELD.includes(j.status));
  const total = (list) => list.reduce((sum, j) => sum + j.payout.picker, 0);
  return { earned: total(paid), onHold: total(held), done: paid.length + held.length, paid, held };
}
