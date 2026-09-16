// Proof-of-completion checks. Cheap device-side checks run first; the AI is only asked once
// time, code and location have passed. Every rejection says what failed, the measured value,
// and what to do next.

import { verifyProof } from './ai.js';
import { formatCode, srcToDataUrl } from './camera.js';
import { CONFIG } from './config.js';
import { distanceM, formatDistance } from './geo.js';
import { t } from './i18n.js';
import { photoUrl } from './photos.js';
import { codeExpired } from './store.js';
import { clock } from './ui.js';

// Order matters: the three device checks are instant and free, so they run before any AI call.
export const CHECKS = [
  { id: 'time', ai: false },
  { id: 'code', ai: false },
  { id: 'distance', ai: false },
  { id: 'codeRead', ai: true },
  { id: 'clean', ai: true },
  { id: 'place', ai: true },
];

export const checkLabel = (id) => (id === 'distance' ? t('check.distance', { m: CONFIG.proofRadiusM }) : t(`check.${id}`));

function fail(results, id, detail, rejection) {
  results.push({ id, ok: false, detail });
  return { results, rejection: { check: id, ...rejection } };
}

const minutes = (ms) => Math.max(0, Math.round(ms / 60_000));

export function localChecks(job, { capturedAt, fix }) {
  const results = [];
  const photo = clock(capturedAt);
  const accepted = clock(job.acceptedAt);

  if (capturedAt <= job.acceptedAt) {
    return fail(results, 'time', t('detail.timeFail', { photo, accepted }), {
      title: t('reject.time.title'),
      body: t('reject.time.body', { photo, accepted }),
      fix: t('reject.time.fix'),
    });
  }
  results.push({ id: 'time', ok: true, detail: t('detail.time', { accepted, photo }) });

  const age = minutes(capturedAt - job.proof.issuedAt);
  const code = formatCode(job.proof.code);
  if (codeExpired(job.proof, capturedAt)) {
    return fail(results, 'code', t('detail.codeFail', { minutes: age }), {
      title: t('reject.code.title'),
      body: t('reject.code.body', { code, minutes: age, ttl: CONFIG.codeTtlMin }),
      fix: t('reject.code.fix'),
    });
  }
  results.push({ id: 'code', ok: true, detail: t('detail.code', { code, minutes: age }) });

  const distance = formatDistance(distanceM(job, fix));
  if (distanceM(job, fix) > CONFIG.proofRadiusM) {
    const rough = fix.accuracy > CONFIG.proofRadiusM ? t('reject.distance.rough', { accuracy: fix.accuracy }) : '';
    return fail(results, 'distance', t('detail.distance', { distance, accuracy: fix.accuracy }), {
      title: t('reject.distance.title'),
      body: t('reject.distance.body', { distance, accuracy: fix.accuracy, limit: CONFIG.proofRadiusM }),
      fix: t('reject.distance.fix') + rough,
    });
  }
  results.push({ id: 'distance', ok: true, detail: t('detail.distance', { distance, accuracy: fix.accuracy }) });

  return { results, rejection: null };
}

export function noLocationRejection(kind) {
  const key = ['insecure', 'unsupported', 'denied', 'unavailable', 'timeout'].includes(kind) ? kind : 'unavailable';
  return {
    check: 'distance',
    title: t(`geo.${key}.title`),
    body: t('reject.noLocation.body', { body: t(`geo.${key}.body`) }),
    fix: t(`geo.${key}.fix`),
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
    return fail(results, 'codeRead', ai.code_read ? t('detail.read', { code: ai.code_read }) : t('detail.noCode'), {
      title: t('reject.codeRead.title'),
      body: ai.code_read
        ? t('reject.codeRead.body', { expected, read: ai.code_read })
        : t('reject.codeRead.bodyNone', { expected }),
      fix: t('reject.codeRead.fix'),
    });
  }
  results.push({ id: 'codeRead', ok: true, detail: t('detail.read', { code: expected }) });

  if (!ai.site_clean) {
    return fail(results, 'clean', ai.remaining_waste || t('detail.stillWaste'), {
      title: t('reject.clean.title'),
      body: `${ai.reasoning}${ai.remaining_waste ? t('reject.clean.still', { waste: ai.remaining_waste }) : ''}`,
      fix: t('reject.clean.fix'),
    });
  }
  results.push({ id: 'clean', ok: true, detail: ai.reasoning });

  if (!ai.same_place_likely) {
    return fail(results, 'place', t('detail.notSamePlace'), {
      title: t('reject.place.title'),
      body: ai.reasoning,
      fix: t('reject.place.fix'),
    });
  }
  results.push({
    id: 'place',
    ok: true,
    detail: ai.same_place_checked ? t('detail.matches') : t('detail.notCompared'),
  });

  return { results, rejection: null };
}
