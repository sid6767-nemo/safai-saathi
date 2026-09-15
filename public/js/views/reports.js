// Reporter's list: what happened to each spot, rewards, and "Flag as still dirty" during the hold.

import { CONFIG } from '../config.js';
import { SIZE_LABEL, WASTE_LABEL, rupees } from '../payout.js';
import { hydratePhotos } from '../photos.js';
import { JobError, flagJob, getState, pickerName, subscribe } from '../store.js';
import { clock, countdown, html, render, timeAgo, toast } from '../ui.js';

export function mount(root) {
  document.title = 'My reports – Safai Saathi';
  let confirming = null;

  function statusLine(s, job) {
    const who = pickerName(s, job.acceptedBy);
    switch (job.status) {
      case 'open':
        return html`Waiting for a picker. Sent to ${job.notified} ${job.notified === 1 ? 'picker' : 'pickers'} within 2 km.`;
      case 'accepted':
        return html`${who} accepted it at ${clock(job.acceptedAt)} and is on the way.`;
      case 'review':
        return html`${who} sent a cleanup photo. A ward officer is reviewing it.`;
      case 'verified_hold':
        return html`Cleaned by ${who}, verified at ${clock(job.verifiedAt)}. Payout releases in
          <span class="mono" data-release="${job.releaseAt}">${countdown(job.releaseAt - Date.now())}</span>.`;
      case 'disputed':
        return html`You flagged this as still dirty. The payout is paused while a ward officer checks it.`;
      case 'released':
        return html`Cleaned and paid. You earned ${rupees(job.payout.reporter)}.`;
      default:
        return '';
    }
  }

  function flagBox(job) {
    if (job.status !== 'verified_hold') return '';
    if (confirming !== job.id) {
      return html`<button class="btn btn-danger btn-small" data-act="flag" data-id="${job.id}" data-key="flag-${job.id}">
        Flag as still dirty
      </button>`;
    }
    return html`<div class="flag-box" role="group" aria-label="Confirm flag">
      <p>The picker's ${rupees(job.payout.picker)} payout pauses while a ward officer re-checks the spot.</p>
      <button class="btn btn-danger" data-act="flag-confirm" data-id="${job.id}" data-key="confirm-${job.id}">Flag as still dirty</button>
      <button class="btn btn-quiet" data-act="flag-cancel">Cancel</button>
    </div>`;
  }

  function draw() {
    const s = getState();
    const mine = s.jobs.filter((j) => !j.sample);
    const earned = mine.filter((j) => j.status === 'released').reduce((sum, j) => sum + j.payout.reporter, 0);
    const pending = mine
      .filter((j) => !['released', 'disputed'].includes(j.status))
      .reduce((sum, j) => sum + j.payout.reporter, 0);

    render(
      root,
      html`<main class="reports">
        <header class="page-head">
          <a class="btn btn-quiet" href="#/">Home</a>
          <h1>My reports</h1>
        </header>
        <section class="reward-strip" aria-label="Your rewards">
          <span>Rewards earned</span>
          <strong>${rupees(earned)}</strong>
          ${pending ? html`<span class="reward-pending">${rupees(pending)} still to come</span>` : ''}
        </section>
        ${mine.length
          ? html`<ol class="report-list">
              ${mine.map(
                (job) => html`<li class="report-row">
                  <div class="report-photos">
                    <figure><img data-photo="${job.photo}" alt="Reported spot ${job.id}" /><figcaption>Before</figcaption></figure>
                    ${job.afterPhoto
                      ? html`<figure><img data-photo="${job.afterPhoto}" alt="After cleanup" /><figcaption>After</figcaption></figure>`
                      : ''}
                  </div>
                  <div class="report-body">
                    <div class="tags">
                      <span class="tag tag-${job.analysis.wasteType}">${WASTE_LABEL[job.analysis.wasteType]}</span>
                      <span class="tag tag-outline">${SIZE_LABEL[job.analysis.severity]}</span>
                    </div>
                    <p class="report-status status-${job.status}">${statusLine(s, job)}</p>
                    <p class="job-meta"><span class="mono">${job.id}</span><span>${timeAgo(job.createdAt)}</span></p>
                  </div>
                  ${flagBox(job)}
                </li>`,
              )}
            </ol>`
          : html`<p class="empty-light">
              No reports yet. Each spot you report earns you ${Math.round(CONFIG.reporterShare * 100)}% of the
              picker's payout once it's verified clean.
            </p>`}
        <a class="btn btn-primary btn-block" href="#/report">Report waste</a>
      </main>`,
    );
    hydratePhotos(root);
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'flag') confirming = el.dataset.id;
    else if (el.dataset.act === 'flag-cancel') confirming = null;
    else if (el.dataset.act === 'flag-confirm') {
      confirming = null;
      try {
        flagJob(el.dataset.id);
        toast('Flagged. The payout is paused until a ward officer checks the spot.');
      } catch (err) {
        toast(err instanceof JobError ? err.message : 'Could not flag this cleanup.');
      }
    }
    draw();
  });

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
