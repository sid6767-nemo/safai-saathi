// Reporter flow: camera opens immediately, one shutter tap, AI verdict, "Report this spot".

import { AiError, analyzePhoto } from '../ai.js';
import { CameraError, canvasToBlob, grabFrame, scaledDataUrl, stampPhoto, startCamera } from '../camera.js';
import { CONFIG } from '../config.js';
import { formatCoords, getPosition, watchPosition } from '../geo.js';
import { t, tn } from '../i18n.js';
import { estimatePayout, rupees, sizeLabel, wasteLabel } from '../payout.js';
import { newPhotoId, putPhoto } from '../photos.js';
import { createReport } from '../store.js';
import { html, render, stamp } from '../ui.js';

const STEP_OF = {
  starting: 1,
  live: 1,
  'camera-error': 1,
  locating: 2,
  'geo-error': 2,
  analyzing: 2,
  result: 2,
  'not-waste': 2,
  'ai-error': 2,
  manual: 2,
  submitted: 3,
};

export function mount(root) {
  document.title = `${t('home.report')} – Safai Saathi`;
  root.classList.add('is-camera');
  root.innerHTML = `
    <div class="cam">
      <video class="cam-feed" playsinline muted aria-label="Live camera"></video>
      <img class="cam-frozen" alt="" hidden />
      <div class="cam-top" data-slot="top"></div>
      <div class="cam-panel" data-slot="panel"></div>
    </div>`;
  const video = root.querySelector('video');
  const frozen = root.querySelector('.cam-frozen');
  const top = root.querySelector('[data-slot="top"]');
  const panel = root.querySelector('[data-slot="panel"]');

  const st = { phase: 'starting', fix: null, fixError: null, manual: { type: 'dry', size: 'small' } };
  let stopCamera = null;
  let stopWatch = null;
  let alive = true;

  const setPhase = (phase, extra = {}) => {
    Object.assign(st, extra, { phase });
    draw();
  };

  async function openCamera() {
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
    const capturedAt = Date.now();
    const canvas = grabFrame(video);
    const recentFix = st.fix && Date.now() - st.fix.at < CONFIG.maxFixAgeMs ? st.fix : null;
    freeze(canvas);
    st.pending = { canvas, capturedAt };
    if (recentFix) return finishCapture(recentFix, 'gps');
    setPhase('locating');
    try {
      const fix = await getPosition();
      if (alive) finishCapture(fix, 'gps');
    } catch (err) {
      if (alive) setPhase('geo-error', { geoError: err.kind ?? 'unavailable' });
    }
  }

  async function finishCapture(fix, source) {
    const { canvas, capturedAt } = st.pending;
    await stampPhoto(canvas, {
      lines: [
        `Safai Saathi report  ${stamp(capturedAt)}`,
        `${formatCoords(fix)}  ±${fix.accuracy} m${source === 'demo' ? '  demo location' : ''}`,
      ],
    });
    frozen.src = canvas.toDataURL('image/jpeg', 0.85);
    st.capture = { blob: await canvasToBlob(canvas), dataUrl: scaledDataUrl(canvas, 1024), capturedAt, fix, source };
    analyze();
  }

  async function analyze() {
    setPhase('analyzing');
    try {
      const analysis = await analyzePhoto(st.capture.dataUrl);
      if (!alive) return;
      setPhase(analysis.isWasteSite ? 'result' : 'not-waste', { analysis });
    } catch (err) {
      if (alive) setPhase('ai-error', { aiError: err instanceof AiError ? err.message : 'The AI check failed.' });
    }
  }

  async function submit(button) {
    button.disabled = true;
    const analysis =
      st.phase === 'manual'
        ? {
            wasteType: st.manual.type,
            severity: st.manual.size,
            itemsSeen: [],
            reasoning: t('report.estimatedByYou'),
            source: 'manual',
          }
        : st.analysis;
    const photo = newPhotoId('report');
    await putPhoto(photo, st.capture.blob);
    const job = createReport({ fix: st.capture.fix, locationSource: st.capture.source, photo, analysis });
    setPhase('submitted', { job });
  }

  function drawTop() {
    const live = ['starting', 'live'].includes(st.phase);
    const gps = st.fix ? t('report.gps', { m: st.fix.accuracy }) : st.fixError ? t('report.gpsNone') : t('report.gpsFinding');
    render(
      top,
      html`<a class="cam-close" href="#/" aria-label="${t('report.close')}">✕</a>
        <span class="step-chip">${t('report.step', { n: STEP_OF[st.phase] })}</span>
        ${live ? html`<span class="chip chip-live mono" role="status">${gps}</span>` : html`<span class="chip-spacer"></span>`}`,
    );
  }

  const receipt = (type, size) => {
    const p = estimatePayout(type, size);
    return html`<dl class="receipt">
        <div class="receipt-row receipt-main"><dt>${t('report.pickerEarns')}</dt><dd>${rupees(p.picker)}</dd></div>
        <div class="receipt-row receipt-you"><dt>${t('report.youEarn')}</dt><dd>${rupees(p.reporter)}</dd></div>
      </dl>
      <p class="fine">
        ${t('report.fine', {
          rate: rupees(p.base),
          type: wasteLabel(type),
          mult: p.multiplier,
          size: sizeLabel(size).toLowerCase(),
        })}
      </p>`;
  };

  const evidence = () =>
    html`<p class="evidence mono">
      ${formatCoords(st.capture.fix)} ±${st.capture.fix.accuracy} m${st.capture.source === 'demo' ? ' (demo)' : ''}
    </p>`;

  const tags = (a) =>
    html`<div class="tags">
      <span class="tag tag-${a.wasteType}">${wasteLabel(a.wasteType)}</span>
      <span class="tag tag-outline">${sizeLabel(a.severity)}</span>
    </div>`;

  const errorPanel = (kind, prefix, actions) =>
    html`<div class="sheet" role="alert">
      <h2 class="sheet-title">${t(`${prefix}.${kind}.title`)}</h2>
      <p>${t(`${prefix}.${kind}.body`)}</p>
      <p class="fix"><strong>${t('action.whatToDo')}</strong> ${t(`${prefix}.${kind}.fix`)}</p>
      <div class="sheet-actions">${actions}</div>
    </div>`;

  const busy = (text) =>
    html`<div class="sheet sheet-busy" role="status"><span class="spinner" aria-hidden="true"></span>${text}</div>`;

  function panelFor() {
    switch (st.phase) {
      case 'starting':
        return html`<button class="shutter" disabled>${t('report.starting')}</button>`;
      case 'live':
        return html`<p class="cam-hint">${t('report.hint')}</p>
          <button class="shutter" data-act="shoot" data-key="shoot">${t('report.take')}</button>`;
      case 'camera-error':
        return errorPanel(
          st.cameraError,
          'cam',
          html`<button class="btn btn-primary btn-block" data-act="retry-camera">${t('action.tryAgain')}</button>
            <a class="btn btn-quiet btn-block" href="#/">${t('nav.home')}</a>`,
        );
      case 'locating':
        return busy(t('report.locating'));
      case 'geo-error':
        return errorPanel(
          st.geoError,
          'geo',
          html`<button class="btn btn-primary btn-block" data-act="retry-geo">${t('action.tryAgain')}</button>
            <button class="btn btn-outline btn-block" data-act="demo-location">
              ${t('report.demoLocation', { place: CONFIG.fallbackLocation.label })}
            </button>
            <button class="btn btn-quiet btn-block" data-act="retake">${t('report.retake')}</button>`,
        );
      case 'analyzing':
        return busy(t('report.analyzing'));
      case 'result': {
        const a = st.analysis;
        return html`<div class="sheet">
          <p class="source-note">${t('report.estimatedBy', { provider: a.provider ?? 'AI' })}</p>
          ${tags(a)}
          <p class="verdict">${a.reasoning}</p>
          ${a.itemsSeen.length ? html`<p class="seen">${t('report.seen', { items: a.itemsSeen.join(', ') })}</p>` : ''}
          ${receipt(a.wasteType, a.severity)} ${evidence()}
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="submit">${t('report.submit')}</button>
            <button class="btn btn-quiet btn-block" data-act="retake">${t('report.retake')}</button>
          </div>
        </div>`;
      }
      case 'not-waste':
        return html`<div class="sheet" role="alert">
          <h2 class="sheet-title">${t('report.notWaste.title')}</h2>
          <p>${st.analysis.reasoning}</p>
          <p class="fix"><strong>${t('action.whatToDo')}</strong> ${t('report.notWaste.fix')}</p>
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="retake">${t('report.retake')}</button>
          </div>
        </div>`;
      case 'ai-error':
        return html`<div class="sheet" role="alert">
          <h2 class="sheet-title">${t('report.aiError.title')}</h2>
          <p>${st.aiError}</p>
          <p class="fix"><strong>${t('action.whatToDo')}</strong> ${t('report.aiError.fix')}</p>
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="retry-ai">${t('action.tryAgain')}</button>
            <button class="btn btn-outline btn-block" data-act="manual">${t('report.manual')}</button>
          </div>
        </div>`;
      case 'manual': {
        const { type, size } = st.manual;
        const option = (group, value, label, current) =>
          html`<label class="seg-option">
            <input
              type="radio"
              name="${group}"
              value="${value}"
              data-key="${group}-${value}"
              ${current === value ? html`checked` : ''}
            />
            <span>${label}</span>
          </label>`;
        return html`<div class="sheet">
          <p class="source-note source-manual">${t('report.estimatedByYou')}</p>
          <fieldset class="seg">
            <legend>${t('report.mostly')}</legend>
            ${option('type', 'dry', wasteLabel('dry'), type)} ${option('type', 'wet', wasteLabel('wet'), type)}
          </fieldset>
          <fieldset class="seg">
            <legend>${t('report.howMuch')}</legend>
            ${option('size', 'small', sizeLabel('small'), size)} ${option('size', 'medium', sizeLabel('medium'), size)}
            ${option('size', 'large', sizeLabel('large'), size)}
          </fieldset>
          ${receipt(type, size)} ${evidence()}
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="submit">${t('report.submit')}</button>
            <button class="btn btn-quiet btn-block" data-act="retake">${t('report.retake')}</button>
          </div>
        </div>`;
      }
      case 'submitted': {
        const { job } = st;
        return html`<div class="sheet sheet-done" role="status">
          <h2 class="sheet-title">${tn('report.done.title', job.notified)}</h2>
          <p class="job-id mono">${t('report.done.job', { id: job.id })}</p>
          <dl class="split">
            <div><dt>${t('split.picker')}</dt><dd>${rupees(job.payout.picker)}</dd></div>
            <div class="split-you"><dt>${t('split.you')}</dt><dd>${rupees(job.payout.reporter)}</dd></div>
            <div><dt>${t('split.fund')}</dt><dd>${rupees(job.payout.fundTotal)}</dd></div>
          </dl>
          <p class="fine">
            ${t('report.done.note', { amount: rupees(job.payout.reporter), hours: CONFIG.holdHours })}
          </p>
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="retake">${t('report.another')}</button>
            <a class="btn btn-outline btn-block" href="#/reports">${t('report.myReports')}</a>
            <a class="btn btn-quiet btn-block" href="#/picker">${t('home.openDashboard')}</a>
          </div>
        </div>`;
      }
      default:
        return '';
    }
  }

  function draw() {
    drawTop();
    render(panel, panelFor());
    if (['result', 'submitted', 'ai-error', 'not-waste', 'geo-error', 'camera-error'].includes(st.phase)) {
      panel.querySelector('.sheet button, .sheet .btn')?.focus({ preventScroll: true });
    }
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'shoot' && st.phase === 'live') takePhoto();
    else if (act === 'retry-camera' || act === 'retake') openCamera();
    else if (act === 'retry-geo') {
      setPhase('locating');
      getPosition()
        .then((fix) => alive && finishCapture(fix, 'gps'))
        .catch((err) => alive && setPhase('geo-error', { geoError: err.kind ?? 'unavailable' }));
    } else if (act === 'demo-location') finishCapture({ ...CONFIG.fallbackLocation, accuracy: 0, at: Date.now() }, 'demo');
    else if (act === 'retry-ai') analyze();
    else if (act === 'manual') setPhase('manual');
    else if (act === 'submit') submit(el);
  });

  root.addEventListener('change', (e) => {
    if (e.target.name === 'type' || e.target.name === 'size') {
      st.manual[e.target.name] = e.target.value;
      draw();
    }
  });

  openCamera();

  return () => {
    alive = false;
    stopCamera?.();
    stopWatch?.();
  };
}
