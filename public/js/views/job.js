// A picker's finished job: verified and on hold, released, paused by a flag, or in manual review.

import { CONFIG } from '../config.js';
import { rupees } from '../payout.js';
import { hydratePhotos } from '../photos.js';
import { getState, subscribe } from '../store.js';
import { clock, countUp, countdown, html, render } from '../ui.js';

const celebrated = new Set();

export function mount(root, jobId) {
  document.title = 'Job result – Safai Saathi';
  root.classList.add('is-dark');

  const split = (job) =>
    html`<dl class="split">
      <div class="split-you"><dt>You get</dt><dd>${rupees(job.payout.picker)}</dd></div>
      <div><dt>Reporter's reward</dt><dd>${rupees(job.payout.reporter)}</dd></div>
      <div><dt>Ward fund pays</dt><dd>${rupees(job.payout.fundTotal)}</dd></div>
    </dl>`;

  const photos = (job) =>
    html`<div class="before-after">
      <figure><img data-photo="${job.photo}" alt="The spot when it was reported" /><figcaption>Reported</figcaption></figure>
      <figure><img data-photo="${job.afterPhoto}" alt="Your proof photo" /><figcaption>Your proof, ${clock(job.proofCapturedAt)}</figcaption></figure>
    </div>`;

  const checks = (job) =>
    job.proofChecks
      ? html`<ul class="check-summary">
          ${job.proofChecks.map(
            (c) => html`<li class="is-${c.state}"><span aria-hidden="true">${c.state === 'pass' ? '✓' : '–'}</span> ${c.label}</li>`,
          )}
        </ul>`
      : '';

  function body(job) {
    switch (job.status) {
      case 'verified_hold':
        return html`<h1 class="result-title"><span class="result-mark" aria-hidden="true">✓</span>Cleanup verified</h1>
          <div class="hold-box">
            <span>Payout releases in</span>
            <strong class="hold-count mono" data-release="${job.releaseAt}">${countdown(job.releaseAt - Date.now())}</strong>
            <p>The person who reported this spot can flag it during these ${CONFIG.holdHours} hours if it still looks dirty.</p>
          </div>
          ${split(job)} ${photos(job)} ${checks(job)}`;
      case 'released':
        return html`<h1 class="result-title">Payout released</h1>
          <p class="release-amount" aria-live="polite">${rupees(job.payout.picker)}</p>
          <p class="result-note">Added to today's earnings. Paid from the ward cleanup fund (simulated, no real money moves).</p>
          ${split(job)} ${photos(job)}`;
      case 'disputed':
        return html`<h1 class="result-title is-paused">Payout paused</h1>
          <p class="result-note">
            The person who reported this spot flagged it as still dirty at ${clock(job.disputedAt)}. A ward officer will
            re-check the spot (simulated). Your ${rupees(job.payout.picker)} is held until then.
          </p>
          ${photos(job)}`;
      case 'review':
        return html`<h1 class="result-title">Held for manual review</h1>
          <p class="result-note">
            Time, code and location passed, but the AI check couldn't run: ${job.reviewReason} A ward officer will
            compare the photos by hand before paying (simulated).
          </p>
          ${photos(job)} ${checks(job)}`;
      default:
        return html`<h1 class="result-title">This job isn't finished yet</h1>`;
    }
  }

  function draw() {
    const job = getState().jobs.find((j) => j.id === jobId);
    render(
      root,
      html`<main class="result">
        <header class="result-head">
          <a class="btn btn-quiet" href="#/picker">Back to jobs</a>
          <span class="mono result-id">${jobId}</span>
        </header>
        ${job ? body(job) : html`<h1 class="result-title">This job no longer exists</h1>`}
      </main>`,
    );
    hydratePhotos(root);
    if (job?.status === 'released' && !celebrated.has(job.id)) {
      celebrated.add(job.id);
      countUp(root.querySelector('.release-amount'), job.payout.picker, rupees);
    }
  }

  draw();
  const unsubscribe = subscribe(draw);
  const timer = setInterval(() => {
    for (const el of root.querySelectorAll('[data-release]')) {
      el.textContent = countdown(Number(el.dataset.release) - Date.now());
    }
  }, 1000);

  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}
