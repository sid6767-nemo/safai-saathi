// All app state: the job state machine, persisted to localStorage and kept in sync across tabs
// (a second tab can play a second picker during a demo).
//
// Job lifecycle:  open -> accepted -> verified_hold -> released
//                                  -> review      (AI check unavailable; a person decides)
//                    verified_hold -> disputed    (reporter flagged it during the hold)
// Failed proof attempts are logged on job.attempts; the job stays "accepted" so the picker can retry.

import { CONFIG } from './config.js';
import { distanceM, offsetM } from './geo.js';
import { estimatePayout } from './payout.js';
import { clearPhotos } from './photos.js';
import { placePickers } from './pickers.js';
import { SAMPLE_JOBS } from './seed.js';

const KEY = 'safai-saathi:v1';
const listeners = new Set();

const blank = () => ({
  anchor: null,
  pickers: [],
  activePickerId: 'p1',
  jobs: [],
  demo: { spoofLocation: false, clockSkew: false, aiOffline: false },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Sample jobs saved before their text was translatable: attach the key now.
      for (const job of saved.jobs ?? []) {
        if (job.sample && !job.analysis.reasoningKey) {
          job.analysis.reasoningKey = SAMPLE_JOBS.find((s) => s.id === job.id)?.reasoningKey;
        }
      }
      return { ...blank(), ...saved, demo: { ...blank().demo, ...saved.demo } };
    }
  } catch {
    // Corrupt or blocked storage: start fresh rather than break the demo.
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

// Re-reads storage before every change so two tabs can't both accept the same job.
function commit(mutate) {
  state = load();
  const result = mutate(state);
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

const pickersNear = (s, point) => s.pickers.filter((p) => distanceM(p, point) <= CONFIG.notifyRadiusM).length;

const newJob = (fields) => ({
  status: 'open',
  createdAt: Date.now(),
  acceptedBy: null,
  acceptedAt: null,
  proof: null,
  attempts: [],
  ...fields,
});

// The first location the app reads fixes where the simulated pickers and sample jobs sit.
export function ensureAnchor(point, source = 'gps') {
  if (state.anchor) return;
  commit((s) => {
    if (s.anchor) return;
    s.anchor = { lat: point.lat, lng: point.lng, source };
    s.pickers = placePickers(s.anchor);
    for (const sample of SAMPLE_JOBS) {
      const job = newJob({
        id: sample.id,
        sample: true,
        illustration: sample.illustration,
        photo: sample.photo,
        ...offsetM(s.anchor, sample.north, sample.east),
        accuracy: 10,
        locationSource: 'sample',
        createdAt: Date.now() - sample.minutesAgo * 60_000,
        analysis: {
          wasteType: sample.wasteType,
          severity: sample.severity,
          itemsSeen: sample.itemsSeen,
          reasoningKey: sample.reasoningKey,
          source: 'sample',
        },
        payout: estimatePayout(sample.wasteType, sample.severity),
      });
      job.notified = pickersNear(s, job);
      s.jobs.push(job);
    }
  });
}

export function createReport({ fix, locationSource, photo, analysis }) {
  ensureAnchor(fix, locationSource);
  return commit((s) => {
    let id;
    do id = `SS-${randomCode(4)}`;
    while (s.jobs.some((j) => j.id === id));
    const job = newJob({
      id,
      sample: false,
      photo,
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      locationSource,
      analysis,
      payout: estimatePayout(analysis.wasteType, analysis.severity),
    });
    job.notified = pickersNear(s, job);
    s.jobs.unshift(job);
    return job;
  });
}

export function acceptJob(id, pickerId) {
  return commit((s) => {
    const job = findJob(s, id);
    if (job.status !== 'open') throw new JobError('taken', 'Another picker accepted this job a moment ago.');
    if (s.jobs.some((j) => j.acceptedBy === pickerId && j.status === 'accepted')) {
      throw new JobError('busy', 'Finish your current job before accepting another.');
    }
    Object.assign(job, { status: 'accepted', acceptedBy: pickerId, acceptedAt: Date.now() });
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

export function setActivePicker(id) {
  commit((s) => {
    s.activePickerId = id;
  });
}

export async function resetAll() {
  localStorage.removeItem(KEY);
  state = blank();
  await clearPhotos();
  save();
  emit();
}

// Selectors
export const activePicker = (s) => s.pickers.find((p) => p.id === s.activePickerId) ?? s.pickers[0];
export const pickerName = (s, id) => s.pickers.find((p) => p.id === id)?.name ?? 'A picker';
export const activeJobFor = (s, pickerId) => s.jobs.find((j) => j.acceptedBy === pickerId && j.status === 'accepted');

export function openJobsFor(s, picker) {
  return s.jobs
    .filter((j) => j.status === 'open')
    .map((job) => ({ job, distance: distanceM(picker, job) }))
    .sort((a, b) => a.distance - b.distance);
}

const HELD = ['verified_hold', 'review', 'disputed'];

export function earningsFor(s, pickerId) {
  const mine = s.jobs.filter((j) => j.acceptedBy === pickerId);
  const paid = mine.filter((j) => j.status === 'released');
  const held = mine.filter((j) => HELD.includes(j.status));
  const total = (list) => list.reduce((sum, j) => sum + j.payout.picker, 0);
  return { earned: total(paid), onHold: total(held), done: paid.length + held.length, paid, held };
}
