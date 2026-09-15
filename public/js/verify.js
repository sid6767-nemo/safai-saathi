// Proof-of-completion checks. Cheap device-side checks run first; the AI is only asked once
// time, code and location have passed. Every rejection says what failed, the measured value,
// and what to do next.

import { verifyProof } from './ai.js';
import { formatCode, srcToDataUrl } from './camera.js';
import { CONFIG } from './config.js';
import { GEO_ERROR_COPY, distanceM, formatDistance } from './geo.js';
import { photoUrl } from './photos.js';
import { codeExpired } from './store.js';
import { clock } from './ui.js';

export const CHECKS = [
  { id: 'time', label: 'Taken after you accepted the job', ai: false },
  { id: 'code', label: 'Job code still valid', ai: false },
  { id: 'distance', label: `Within ${CONFIG.proofRadiusM} m of the reported spot`, ai: false },
  { id: 'codeRead', label: 'Job code readable in the photo', ai: true },
  { id: 'clean', label: 'Spot is cleared', ai: true },
  { id: 'place', label: 'Same place as the report photo', ai: true },
];

function fail(results, id, detail, rejection) {
  results.push({ id, ok: false, detail });
  return { results, rejection: { check: id, ...rejection } };
}

const minutes = (ms) => Math.max(0, Math.round(ms / 60_000));

export function localChecks(job, { capturedAt, fix }) {
  const results = [];

  if (capturedAt <= job.acceptedAt) {
    return fail(results, 'time', `Photo ${clock(capturedAt)}, accepted ${clock(job.acceptedAt)}`, {
      title: 'The photo is timestamped before you accepted the job',
      body: `This photo is stamped ${clock(capturedAt)}, but you accepted the job at ${clock(job.acceptedAt)}. Proof has to be taken after accepting, so an older photo can't be reused.`,
      fix: "Set your phone's date and time to automatic, then take the proof photo again.",
    });
  }
  results.push({ id: 'time', ok: true, detail: `Accepted ${clock(job.acceptedAt)}, photo ${clock(capturedAt)}` });

  const age = capturedAt - job.proof.issuedAt;
  if (codeExpired(job.proof, capturedAt)) {
    return fail(results, 'code', `Issued ${minutes(age)} min before the photo`, {
      title: 'The job code had expired',
      body: `Code ${formatCode(job.proof.code)} was issued ${minutes(age)} minutes before this photo. Codes last ${CONFIG.codeTtlMin} minutes so nobody can prepare a photo in advance.`,
      fix: "Take the proof photo again. You'll get a fresh code.",
    });
  }
  results.push({ id: 'code', ok: true, detail: `${formatCode(job.proof.code)}, issued ${minutes(age)} min before the photo` });

  const d = distanceM(job, fix);
  if (d > CONFIG.proofRadiusM) {
    const rough =
      fix.accuracy > CONFIG.proofRadiusM
        ? ` Your GPS reading is rough (±${fix.accuracy} m), so step into the open for a sharper fix first.`
        : '';
    return fail(results, 'distance', `${formatDistance(d)} from the spot`, {
      title: 'Too far from the reported spot',
      body: `This photo was taken ${formatDistance(d)} from where the waste was reported (GPS accuracy ±${fix.accuracy} m). Proof photos must be taken within ${CONFIG.proofRadiusM} m of the spot.`,
      fix: `Walk back to the spot and take the proof photo again.${rough}`,
    });
  }
  results.push({ id: 'distance', ok: true, detail: `${formatDistance(d)} from the spot, GPS ±${fix.accuracy} m` });

  return { results, rejection: null };
}

export function noLocationRejection(kind) {
  const copy = GEO_ERROR_COPY[kind] ?? GEO_ERROR_COPY.unavailable;
  return {
    check: 'distance',
    title: copy.title,
    body: `${copy.body} Without your location the proof can't be matched to the reported spot.`,
    fix: copy.fix,
  };
}

export async function aiChecks(job, afterDataUrl) {
  const before = await srcToDataUrl(await photoUrl(job.photo), 1024);
  const ai = await verifyProof({
    before,
    after: afterDataUrl,
    code: job.proof.code,
    beforeIsIllustration: Boolean(job.illustration),
  });
  const results = [];
  const expected = formatCode(job.proof.code);

  if (!ai.code_matches) {
    return fail(results, 'codeRead', ai.code_read ? `Read ${ai.code_read}` : 'No code found', {
      title: "The job code isn't readable in the photo",
      body: ai.code_read
        ? `We expected ${expected} but read ${ai.code_read}.`
        : `We expected ${expected} but couldn't find a code in the photo.`,
      fix: 'Hold the phone steady in good light and take the proof photo again.',
    });
  }
  results.push({ id: 'codeRead', ok: true, detail: `Read ${expected}` });

  if (!ai.site_clean) {
    return fail(results, 'clean', ai.remaining_waste || 'Waste still visible', {
      title: 'The spot still has waste in it',
      body: `${ai.reasoning}${ai.remaining_waste ? ` Still visible: ${ai.remaining_waste}.` : ''}`,
      fix: 'Finish clearing the spot, then take the proof photo again.',
    });
  }
  results.push({ id: 'clean', ok: true, detail: ai.reasoning });

  if (!ai.same_place_likely) {
    return fail(results, 'place', "Background doesn't match", {
      title: "This doesn't look like the reported spot",
      body: ai.reasoning,
      fix: 'Stand where the report photo was taken and frame the same wall, kerb or landmark, then take the proof photo again.',
    });
  }
  results.push({
    id: 'place',
    ok: true,
    detail: ai.same_place_checked ? 'Background matches the report photo' : 'Sample job: drawn placeholder, not compared',
  });

  return { results, rejection: null };
}
