// Proof of completion: live camera only, a one-time job code on screen and burned into the photo,
// GPS and time read at capture, then the checks in verify.js run one by one.

import { CameraError, canvasToBlob, formatCode, grabFrame, scaledDataUrl, stampPhoto, startCamera } from '../camera.js';
import { CONFIG } from '../config.js';
import { demoBadge } from '../demo.js';
import { formatCoords, getPosition, offsetM, watchPosition } from '../geo.js';
import { t } from '../i18n.js';
import { hydratePhotos, newPhotoId, putPhoto } from '../photos.js';
import { activePicker, ensureCode, getState, markReview, markVerified, recordAttempt } from '../store.js';
import { countdown, html, pause, render, stamp } from '../ui.js';
import { CHECKS, aiChecks, checkLabel, localChecks, noLocationRejection } from '../verify.js';

const MARK = { pending: '', running: '', pass: '✓', fail: '✕', skipped: '–' };

export function mount(root, jobId) {
  document.title = `${t('proof.title')} – Safai Saathi`;
  const findJob = () => getState().jobs.find((j) => j.id === jobId);
  const first = findJob();

  if (!first || first.status !== 'accepted' || first.acceptedBy !== activePicker(getState())?.id) {
    root.classList.add('is-dark');
    render(
      root,
      html`<main class="notice">
        <h1>${t('proof.notYours.title')}</h1>
        <p>${t('proof.notYours.body')}</p>
        <a class="btn btn-primary btn-block" href="#/picker">${t('nav.backToJobs')}</a>
      </main>`,
    );
    return;
  }

  root.classList.add('is-camera');
  render(
    root,
    html`<div class="cam cam-proof">
      <video class="cam-feed" playsinline muted aria-label="Live camera"></video>
      <img class="cam-frozen" alt="" hidden />
      <div class="cam-top" data-slot="top"></div>
      <div class="code-plate" data-slot="code" aria-live="polite"></div>
      <figure class="ref-photo" data-slot="ref">
        <img data-photo="${first.photo}" alt="" />
        <figcaption>${t('proof.reportPhoto')}</figcaption>
      </figure>
      <div class="cam-panel" data-slot="panel"></div>
    </div>`,
  );
  hydratePhotos(root);

  const video = root.querySelector('video');
  const frozen = root.querySelector('.cam-frozen');
  const slot = (name) => root.querySelector(`[data-slot="${name}"]`);

  const st = { phase: 'starting', fix: null, fixError: null, checks: [], rejection: null };
  let stopCamera = null;
  let stopWatch = null;
  let alive = true;

  const setPhase = (phase, extra = {}) => {
    Object.assign(st, extra, { phase });
    draw();
  };

  async function openCamera() {
    ensureCode(jobId); // a fresh code unless the current one is still valid
    Object.assign(st, { checks: [], rejection: null });
    setPhase('starting');
    frozen.hidden = true;
    video.hidden = false;
    stopWatch?.();
    stopWatch = watchPosition(
      (fix) => {
        st.fix = fix;
        st.fixError = null;
        drawTop();
      },
      (err) => {
        st.fixError = err.kind;
        drawTop();
      },
    );
    try {
      const stop = await startCamera(video);
      if (!alive) return stop();
      stopCamera = stop;
      setPhase('live');
    } catch (err) {
      setPhase('camera-error', { cameraError: err instanceof CameraError ? err.kind : 'unknown' });
    }
  }

  function freeze(canvas) {
    stopCamera?.();
    stopCamera = null;
    stopWatch?.();
    stopWatch = null;
    frozen.src = canvas.toDataURL('image/jpeg', 0.8);
    frozen.hidden = false;
    video.hidden = true;
  }

  async function takePhoto() {
    const { demo } = getState();
    const capturedAt = Date.now() - (demo.clockSkew ? CONFIG.demo.clockSkewMin * 60_000 : 0);
    const canvas = grabFrame(video);
    const recentFix = st.fix && Date.now() - st.fix.at < CONFIG.maxFixAgeMs ? st.fix : null;
    freeze(canvas);

    let fix = recentFix;
    if (!fix) {
      setPhase('locating');
      try {
        fix = await getPosition();
      } catch (err) {
        if (alive) reject(noLocationRejection(err.kind));
        return;
      }
    }
    if (!alive) return;
    if (demo.spoofLocation) fix = { ...fix, ...offsetM(fix, CONFIG.demo.spoofDistanceM, 0) };

    const job = findJob();
    await stampPhoto(canvas, {
      code: job.proof.code,
      lines: [`Safai Saathi proof ${job.id}  ${stamp(capturedAt)}`, `${formatCoords(fix)}  ±${fix.accuracy} m`],
    });
    frozen.src = canvas.toDataURL('image/jpeg', 0.85);
    runChecks({ capturedAt, fix, blob: await canvasToBlob(canvas), dataUrl: scaledDataUrl(canvas, 1024) });
  }

  // Each check ticks as its result comes in.
  async function tick(results) {
    for (const r of results) {
      Object.assign(
        st.checks.find((c) => c.id === r.id),
        { state: r.ok ? 'pass' : 'fail', detail: r.detail },
      );
      draw();
      await pause(320);
    }
  }

  async function saveAfterPhoto(capture) {
    const id = newPhotoId('proof');
    await putPhoto(id, capture.blob);
    return id;
  }

  const proofRecord = (capture, afterPhoto) => ({
    afterPhoto,
    proofCapturedAt: capture.capturedAt,
    proofFix: capture.fix,
    proofChecks: st.checks.map(({ id, state, detail }) => ({ id, state, detail })),
  });

  async function runChecks(capture) {
    st.checks = CHECKS.map((c) => ({ ...c, state: 'pending', detail: '' }));
    setPhase('checking');
    const job = findJob();

    const local = localChecks(job, capture);
    await tick(local.results);
    if (local.rejection) return reject(local.rejection);

    for (const c of st.checks) if (c.ai) c.state = 'running';
    draw();

    let ai;
    try {
      ai = await aiChecks(job, capture.dataUrl);
    } catch (err) {
      if (!alive) return;
      // Never auto-approve without the AI checks: a person decides instead.
      for (const c of st.checks) if (c.ai) Object.assign(c, { state: 'skipped', detail: t('detail.aiUnavailable') });
      const afterPhoto = await saveAfterPhoto(capture);
      markReview(jobId, { ...proofRecord(capture, afterPhoto), reviewReason: err.message });
      location.hash = `#/job/${jobId}`;
      return;
    }
    if (!alive) return;
    await tick(ai.results);
    if (ai.rejection) return reject(ai.rejection);

    const afterPhoto = await saveAfterPhoto(capture);
    markVerified(jobId, proofRecord(capture, afterPhoto));
    setPhase('passed');
    await pause(1100);
    if (alive) location.hash = `#/job/${jobId}`;
  }

  function reject(rejection) {
    for (const c of st.checks) if (c.state === 'pending' || c.state === 'running') c.state = 'skipped';
    recordAttempt(jobId, { check: rejection.check, title: rejection.title });
    setPhase('rejected', { rejection });
  }

  function drawTop() {
    const live = ['starting', 'live'].includes(st.phase);
    const gps = st.fix ? t('report.gps', { m: st.fix.accuracy }) : st.fixError ? t('report.gpsNone') : t('report.gpsFinding');
    render(
      slot('top'),
      html`<a class="cam-close" href="#/picker" aria-label="${t('proof.close')}">✕</a>
        ${live ? html`<span class="chip chip-live mono" role="status">${gps}</span>` : ''}`,
    );
  }

  function drawCode() {
    const plate = slot('code');
    const job = findJob();
    const live = ['starting', 'live'].includes(st.phase);
    plate.hidden = !live || !job?.proof;
    slot('ref').hidden = !live;
    if (plate.hidden) return;
    const left = job.proof.issuedAt + CONFIG.codeTtlMin * 60_000 - Date.now();
    render(
      plate,
      html`<span class="plate-label">${t('proof.jobCode')}</span>
        <span class="plate-code">${formatCode(job.proof.code)}</span>
        <span class="plate-ttl">${left > 0 ? t('proof.validFor', { time: countdown(left).slice(3) }) : t('proof.expired')}</span>`,
    );
  }

  const checklist = () =>
    html`<ol class="checklist">
      ${st.checks.map(
        (c) => html`<li class="check is-${c.state}">
          <span class="check-mark" aria-hidden="true">${MARK[c.state]}</span>
          <span>
            <span class="check-label">${checkLabel(c.id)}</span>
            <span class="visually-hidden">: ${t(`check.state.${c.state}`)}.</span>
            ${c.detail ? html`<span class="check-detail">${c.detail}</span>` : ''}
          </span>
        </li>`,
      )}
    </ol>`;

  function panelFor() {
    switch (st.phase) {
      case 'starting':
        return html`<button class="shutter" disabled>${t('report.starting')}</button>`;
      case 'live':
        return html`${demoBadge()}
          <p class="cam-hint">${t('proof.hint')}</p>
          <button class="shutter" data-act="shoot" data-key="shoot">${t('proof.take')}</button>`;
      case 'camera-error':
        return html`<div class="sheet sheet-dark" role="alert">
          <h2 class="sheet-title">${t(`cam.${st.cameraError}.title`)}</h2>
          <p>${t(`cam.${st.cameraError}.body`)}</p>
          <p class="fix"><strong>${t('action.whatToDo')}</strong> ${t(`cam.${st.cameraError}.fix`)}</p>
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="retake">${t('action.tryAgain')}</button>
            <a class="btn btn-quiet btn-block" href="#/picker">${t('nav.backToJobs')}</a>
          </div>
        </div>`;
      case 'locating':
        return html`<div class="sheet sheet-dark sheet-busy" role="status">
          <span class="spinner" aria-hidden="true"></span>${t('report.locating')}
        </div>`;
      case 'checking':
        return html`<div class="sheet sheet-dark">
          <h2 class="sheet-title">${t('proof.checking')}</h2>
          ${checklist()}
        </div>`;
      case 'passed':
        return html`<div class="sheet sheet-dark" role="status">
          <h2 class="sheet-title sheet-pass">${t('proof.verified')}</h2>
          ${checklist()}
        </div>`;
      case 'rejected': {
        const r = st.rejection;
        return html`<div class="sheet sheet-dark">
          ${st.checks.length ? checklist() : ''}
          <div class="reject" role="alert">
            <p class="reject-kicker">${t('proof.rejected')}</p>
            <h2 class="sheet-title">${r.title}</h2>
            <p>${r.body}</p>
            <p class="fix"><strong>${t('action.whatToDo')}</strong> ${r.fix}</p>
          </div>
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="retake">${t('proof.take')}</button>
            <a class="btn btn-quiet btn-block" href="#/picker">${t('nav.backToJobs')}</a>
          </div>
        </div>`;
      }
      default:
        return '';
    }
  }

  function draw() {
    drawTop();
    drawCode();
    render(slot('panel'), panelFor());
    if (st.phase === 'rejected' || st.phase === 'camera-error') {
      slot('panel').querySelector('.btn-primary')?.focus({ preventScroll: true });
    }
  }

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'shoot' && st.phase === 'live') takePhoto();
    else if (act === 'retake') openCamera();
  });

  const timer = setInterval(drawCode, 1000);
  openCamera();

  return () => {
    alive = false;
    clearInterval(timer);
    stopCamera?.();
    stopWatch?.();
  };
}
