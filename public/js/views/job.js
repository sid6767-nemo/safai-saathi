// A picker's finished job: verified and on hold, released, paused by a flag, or in manual review.

import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { rupees } from '../payout.js';
import { hydratePhotos } from '../photos.js';
import { getState, subscribe } from '../store.js';
import { clock, countUp, countdown, html, render } from '../ui.js';
import { checkLabel } from '../verify.js';

const celebrated = new Set();

export function mount(root, jobId) {
  document.title = `${t('job.title')} ${jobId} – Safai Saathi`;
  root.classList.add('is-dark');

  const split = (job) =>
    html`<dl class="split">
      <div class="split-picker"><dt>${t('split.you')}</dt><dd>${rupees(job.payout.picker)}</dd></div>
      <div><dt>${t('job.reporterReward')}</dt><dd>${rupees(job.payout.reporter)}</dd></div>
      <div><dt>${t('split.fund')}</dt><dd>${rupees(job.payout.fundTotal)}</dd></div>
    </dl>`;

  const photos = (job) =>
    html`<div class="before-after">
      <figure><img data-photo="${job.photo}" alt="" /><figcaption>${t('job.reported')}</figcaption></figure>
      <figure>
        <img data-photo="${job.afterPhoto}" alt="" />
        <figcaption>${t('job.yourProof', { time: clock(job.proofCapturedAt) })}</figcaption>
      </figure>
    </div>`;

  const checks = (job) =>
    job.proofChecks
      ? html`<ul class="check-summary">
          ${job.proofChecks.map(
            (c) => html`<li class="is-${c.state}">
              <span aria-hidden="true">${c.state === 'pass' ? '✓' : '–'}</span> ${checkLabel(c.id)}
            </li>`,
          )}
        </ul>`
      : '';

  function body(job) {
    switch (job.status) {
      case 'verified_hold':
        return html`<h1 class="result-title"><span class="result-mark" aria-hidden="true">✓</span>${t('proof.verified')}</h1>
          <div class="hold-box">
            <span>${t('job.releasesIn')}</span>
            <strong class="hold-count mono" data-release="${job.releaseAt}">${countdown(job.releaseAt - Date.now())}</strong>
            <p>${t('job.holdNote', { hours: CONFIG.holdHours })}</p>
          </div>
          ${split(job)} ${photos(job)} ${checks(job)}`;
      case 'released':
        return html`<h1 class="result-title">${t('job.released')}</h1>
          <p class="release-amount" aria-live="polite">${rupees(job.payout.picker)}</p>
          <p class="result-note">${t('job.releasedNote')}</p>
          ${split(job)} ${photos(job)}`;
      case 'disputed':
        return html`<h1 class="result-title is-paused">${t('job.paused')}</h1>
          <p class="result-note">
            ${t('job.pausedNote', { time: clock(job.disputedAt), amount: rupees(job.payout.picker) })}
          </p>
          ${photos(job)}`;
      case 'review':
        return html`<h1 class="result-title">${t('job.review')}</h1>
          <p class="result-note">${t('job.reviewNote', { reason: job.reviewReason })}</p>
          ${photos(job)} ${checks(job)}`;
      default:
        return html`<h1 class="result-title">${t('job.unfinished')}</h1>`;
    }
  }

  function draw() {
    const job = getState().jobs.find((j) => j.id === jobId);
    render(
      root,
      html`<main class="result">
        <header class="result-head">
          <a class="btn btn-quiet" href="#/picker">${t('nav.backToJobs')}</a>
          <span class="mono result-id">${jobId}</span>
        </header>
        ${job ? body(job) : html`<h1 class="result-title">${t('job.gone')}</h1>`}
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
