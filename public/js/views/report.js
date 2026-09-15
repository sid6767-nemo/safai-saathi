// Reporter flow: camera opens immediately, one shutter tap, AI verdict, "Report this spot".

import { AiError, analyzePhoto } from '../ai.js';
import { CAMERA_ERROR_COPY, CameraError, canvasToBlob, grabFrame, scaledDataUrl, stampPhoto, startCamera } from '../camera.js';
import { CONFIG } from '../config.js';
import { GEO_ERROR_COPY, formatCoords, getPosition, watchPosition } from '../geo.js';
import { SIZE_LABEL, WASTE_LABEL, estimatePayout, rupees } from '../payout.js';
import { newPhotoId, putPhoto } from '../photos.js';
import { createReport } from '../store.js';
import { html, render, stamp } from '../ui.js';

export function mount(root) {
  document.title = 'Report waste – Safai Saathi';
  root.classList.add('is-camera');
  root.innerHTML = `
    <div class="cam">
      <video class="cam-feed" playsinline muted aria-label="Live camera"></video>
      <img class="cam-frozen" alt="Your photo" hidden />
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
            reasoning: 'Estimated by the reporter because AI analysis was unavailable.',
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
    const gps = st.fix ? `GPS ±${st.fix.accuracy} m` : st.fixError ? 'No GPS yet' : 'Finding GPS';
    render(
      top,
      html`<a class="cam-close" href="#/" aria-label="Close camera and go home">✕</a>
        ${live ? html`<span class="chip mono" role="status">${gps}</span>` : ''}`,
    );
  }

  const receipt = (type, size) => {
    const p = estimatePayout(type, size);
    return html`<dl class="receipt">
        <div class="receipt-row receipt-main"><dt>Picker earns for clearing it</dt><dd>${rupees(p.picker)}</dd></div>
        <div class="receipt-row"><dt>You earn once it's verified clean</dt><dd>${rupees(p.reporter)}</dd></div>
      </dl>
      <p class="fine">
        ${rupees(p.base)} ${type}-waste rate × ${p.multiplier} for ${SIZE_LABEL[size].toLowerCase()}. Your reward is
        1/20 of the picker's payout, paid on top by the ward cleanup fund (simulated).
      </p>`;
  };

  const evidence = () =>
    html`<p class="evidence mono">
      ${formatCoords(st.capture.fix)} ±${st.capture.fix.accuracy} m${st.capture.source === 'demo' ? ' (demo location)' : ''}
    </p>`;

  const tags = (a) =>
    html`<div class="tags">
      <span class="tag tag-${a.wasteType}">${WASTE_LABEL[a.wasteType]}</span>
      <span class="tag tag-outline">${SIZE_LABEL[a.severity]}</span>
    </div>`;

  const errorPanel = (copy, actions) =>
    html`<div class="sheet" role="alert">
      <h2 class="sheet-title">${copy.title}</h2>
      <p>${copy.body}</p>
      <p class="fix"><strong>What to do:</strong> ${copy.fix}</p>
      <div class="sheet-actions">${actions}</div>
    </div>`;

  const busy = (text) => html`<div class="sheet sheet-busy" role="status"><span class="spinner" aria-hidden="true"></span>${text}</div>`;

  function panelFor() {
    switch (st.phase) {
      case 'starting':
        return html`<button class="shutter" disabled>Starting camera</button>`;
      case 'live':
        return html`<p class="cam-hint">Fit the whole spot in the frame. Your location is read as you take the photo.</p>
          <button class="shutter" data-act="shoot" data-key="shoot">Take photo</button>`;
      case 'camera-error':
        return errorPanel(
          CAMERA_ERROR_COPY[st.cameraError],
          html`<button class="btn btn-primary btn-block" data-act="retry-camera">Try again</button>
            <a class="btn btn-quiet btn-block" href="#/">Back</a>`,
        );
      case 'locating':
        return busy('Reading your location');
      case 'geo-error':
        return errorPanel(
          GEO_ERROR_COPY[st.geoError],
          html`<button class="btn btn-primary btn-block" data-act="retry-geo">Try again</button>
            <button class="btn btn-outline btn-block" data-act="demo-location">
              Use demo location (${CONFIG.fallbackLocation.label})
            </button>
            <button class="btn btn-quiet btn-block" data-act="retake">Retake photo</button>`,
        );
      case 'analyzing':
        return busy('Checking the photo: dry or wet, and how much');
      case 'result': {
        const a = st.analysis;
        return html`<div class="sheet">
          <p class="source-note">Estimated by Claude from your photo</p>
          ${tags(a)}
          <p class="verdict">${a.reasoning}</p>
          ${a.itemsSeen.length ? html`<p class="seen">Seen: ${a.itemsSeen.join(', ')}</p>` : ''}
          ${receipt(a.wasteType, a.severity)} ${evidence()}
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="submit">Report this spot</button>
            <button class="btn btn-quiet btn-block" data-act="retake">Retake photo</button>
          </div>
        </div>`;
      }
      case 'not-waste':
        return html`<div class="sheet" role="alert">
          <h2 class="sheet-title">This doesn't look like a garbage spot</h2>
          <p>${st.analysis.reasoning}</p>
          <p class="fix"><strong>What to do:</strong> Point the camera at the litter or dump itself and take the photo again.</p>
          <div class="sheet-actions"><button class="btn btn-primary btn-block" data-act="retake">Retake photo</button></div>
        </div>`;
      case 'ai-error':
        return html`<div class="sheet" role="alert">
          <h2 class="sheet-title">The AI check didn't run</h2>
          <p>${st.aiError}</p>
          <p class="fix"><strong>What to do:</strong> Try again, or pick the waste type and size yourself.</p>
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="retry-ai">Try again</button>
            <button class="btn btn-outline btn-block" data-act="manual">Estimate it myself</button>
          </div>
        </div>`;
      case 'manual': {
        const { type, size } = st.manual;
        const option = (group, value, label, current) =>
          html`<label class="seg-option">
            <input type="radio" name="${group}" value="${value}" data-key="${group}-${value}" ${current === value ? html`checked` : ''} />
            <span>${label}</span>
          </label>`;
        return html`<div class="sheet">
          <p class="source-note source-manual">Estimated by you. AI analysis is unavailable.</p>
          <fieldset class="seg">
            <legend>Mostly</legend>
            ${option('type', 'dry', 'Dry waste', type)} ${option('type', 'wet', 'Wet waste', type)}
          </fieldset>
          <fieldset class="seg">
            <legend>How much</legend>
            ${option('size', 'small', 'Small', size)} ${option('size', 'medium', 'Medium', size)}
            ${option('size', 'large', 'Large', size)}
          </fieldset>
          ${receipt(type, size)} ${evidence()}
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="submit">Report this spot</button>
            <button class="btn btn-quiet btn-block" data-act="retake">Retake photo</button>
          </div>
        </div>`;
      }
      case 'submitted': {
        const { job } = st;
        return html`<div class="sheet sheet-done" role="status">
          <h2 class="sheet-title">Reported. ${job.notified} ${job.notified === 1 ? 'picker' : 'pickers'} within 2 km can see it.</h2>
          <p class="job-id mono">Job ${job.id}</p>
          <dl class="split">
            <div><dt>Picker gets</dt><dd>${rupees(job.payout.picker)}</dd></div>
            <div class="split-you"><dt>You get</dt><dd>${rupees(job.payout.reporter)}</dd></div>
            <div><dt>Ward fund pays</dt><dd>${rupees(job.payout.fundTotal)}</dd></div>
          </dl>
          <p class="fine">
            Your ${rupees(job.payout.reporter)} is paid when a picker's cleanup photo passes verification and the
            ${CONFIG.holdHours}-hour hold ends. It comes from the ward fund, not from the picker.
          </p>
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" data-act="retake">Report another spot</button>
            <a class="btn btn-outline btn-block" href="#/reports">My reports</a>
            <a class="btn btn-quiet btn-block" href="#/picker">Open picker dashboard</a>
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
    panel.querySelector('.sheet-title')?.setAttribute('tabindex', '-1');
    if (['result', 'submitted', 'ai-error', 'not-waste', 'geo-error', 'camera-error'].includes(st.phase)) {
      panel.querySelector('.sheet-title, .sheet button')?.focus({ preventScroll: true });
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
