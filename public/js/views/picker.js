// Picker dashboard: a shift console. Earnings first, the job in hand second, open jobs by distance.

import { CONFIG } from '../config.js';
import { demoBadge } from '../demo.js';
import { distanceM, formatCoords, formatDistance, getPosition } from '../geo.js';
import { SIZE_LABEL, WASTE_LABEL, rupees } from '../payout.js';
import { hydratePhotos } from '../photos.js';
import {
  JobError,
  acceptJob,
  activeJobFor,
  activePicker,
  earningsFor,
  ensureAnchor,
  getState,
  openJobsFor,
  setActivePicker,
  subscribe,
} from '../store.js';
import { clock, countdown, flip, html, render, timeAgo, toast } from '../ui.js';

const NEW_FOR_MS = 5 * 60_000;

const STATUS_LINE = {
  verified_hold: 'Verified. Payout releases in',
  review: 'Held for manual review',
  disputed: 'Payout paused: reporter flagged it',
};

export function mount(root) {
  document.title = 'Picker dashboard – Safai Saathi';
  root.classList.add('is-dark');

  if (!getState().anchor) {
    getPosition()
      .then((fix) => ensureAnchor(fix, 'gps'))
      .catch(() => ensureAnchor(CONFIG.fallbackLocation, 'demo'));
  }

  const tags = (job, short = true) =>
    html`<div class="tags">
      <span class="tag tag-${job.analysis.wasteType}">${short ? WASTE_LABEL[job.analysis.wasteType].split(' ')[0] : WASTE_LABEL[job.analysis.wasteType]}</span>
      <span class="tag tag-outline">${SIZE_LABEL[job.analysis.severity]}</span>
      ${job.sample ? html`<span class="tag tag-sample">Sample</span>` : ''}
      ${Date.now() - job.createdAt < NEW_FOR_MS && job.status === 'open' ? html`<span class="tag tag-new">New</span>` : ''}
    </div>`;

  function activeSlot(job, me) {
    const last = job.attempts.at(-1);
    return html`<article class="active-job" data-job="${job.id}" aria-labelledby="active-title">
      <h2 class="section-label" id="active-title">In progress</h2>
      <div class="active-grid">
        <img class="active-photo" data-photo="${job.photo}" alt="Reported spot ${job.id}" />
        <div class="active-info">
          ${tags(job, false)}
          <p class="active-pay">${rupees(job.payout.picker)}</p>
          <p class="mono active-dist">${formatDistance(distanceM(me, job))} away</p>
        </div>
      </div>
      <p class="active-why">${job.analysis.reasoning}</p>
      <dl class="facts mono">
        <div><dt>Job</dt><dd>${job.id}</dd></div>
        <div><dt>Spot</dt><dd>${formatCoords(job)}</dd></div>
        <div><dt>Accepted</dt><dd>${clock(job.acceptedAt)}</dd></div>
      </dl>
      ${last ? html`<p class="last-reject" role="status">Last proof rejected: ${last.title}</p>` : ''}
      <a class="btn btn-primary btn-block" href="#/proof/${job.id}" data-key="mark-${job.id}">Mark as cleaned</a>
      <a class="btn btn-quiet btn-block" target="_blank" rel="noopener"
        href="https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}">Directions in Google Maps</a>
    </article>`;
  }

  function jobRow({ job, distance: d }, busy) {
    return html`<li class="job-row${Date.now() - job.createdAt < NEW_FOR_MS ? ' is-new' : ''}" data-job="${job.id}">
      <img class="job-photo" data-photo="${job.photo}" alt="Reported spot ${job.id}" />
      <div class="job-mid">
        ${tags(job)}
        <p class="job-why">${job.analysis.reasoning}</p>
        <p class="job-meta"><span class="mono">${job.id}</span><span>${timeAgo(job.createdAt)}</span></p>
      </div>
      <div class="job-right">
        <span class="job-pay">${rupees(job.payout.picker)}</span>
        <span class="job-dist mono">${formatDistance(d)}</span>
      </div>
      <button class="btn btn-accept" data-act="accept" data-id="${job.id}" data-key="accept-${job.id}" ${busy ? html`disabled` : ''}>
        Accept job
      </button>
    </li>`;
  }

  function heldRow(job) {
    return html`<li>
      <a class="held-row" href="#/job/${job.id}">
        <img class="held-photo" data-photo="${job.afterPhoto ?? job.photo}" alt="" />
        <span class="held-text">
          <span class="held-status${job.status === 'disputed' ? ' is-flagged' : ''}">${STATUS_LINE[job.status]}</span>
          ${job.status === 'verified_hold' ? html`<span class="mono held-count" data-release="${job.releaseAt}">${countdown(job.releaseAt - Date.now())}</span>` : ''}
        </span>
        <span class="held-pay">${rupees(job.payout.picker)}</span>
      </a>
    </li>`;
  }

  function draw() {
    const s = getState();
    if (!s.anchor) {
      render(root, html`<main class="console"><p class="console-wait" role="status">Finding jobs near you</p></main>`);
      return;
    }
    const me = activePicker(s);
    const active = activeJobFor(s, me.id);
    const open = openJobsFor(s, me);
    const money = earningsFor(s, me.id);

    render(
      root,
      html`<main class="console">
        <header class="console-head">
          <a class="wm-small" href="#/" aria-label="Safai Saathi home"><span lang="hi">सफ़ाई साथी</span></a>
          <label class="who">
            <span>Working as</span>
            <select data-act="picker" data-key="picker-select">
              ${s.pickers.map((p) => html`<option value="${p.id}" ${p.id === me.id ? html`selected` : ''}>${p.name}</option>`)}
            </select>
          </label>
          <button class="icon-btn" type="button" data-action="demo" aria-label="Demo controls">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/></svg>
          </button>
        </header>
        ${demoBadge()}
        <section class="earnings" aria-label="Your earnings">
          <div class="earn-main">
            <span class="earn-label">Earned today</span>
            <span class="earn-amount">${rupees(money.earned)}</span>
          </div>
          <div class="earn-side"><span>On hold</span><strong>${rupees(money.onHold)}</strong></div>
          <div class="earn-side"><span>Jobs done</span><strong>${money.done}</strong></div>
        </section>

        ${active ? activeSlot(active, me) : ''}

        <section class="open-jobs" aria-labelledby="open-title">
          <h2 class="section-label" id="open-title">Open jobs near you <span class="count">${open.length}</span></h2>
          ${active && open.length ? html`<p class="busy-note">Finish your current job before accepting another.</p>` : ''}
          ${open.length
            ? html`<ol class="jobs">${open.map((o) => jobRow(o, Boolean(active)))}</ol>`
            : html`<p class="empty">No open jobs right now. New reports show up here the moment they're made.</p>`}
        </section>

        ${money.held.length || money.paid.length
          ? html`<section class="held" aria-labelledby="held-title">
              <h2 class="section-label" id="held-title">Your finished jobs</h2>
              <ul class="held-list">
                ${money.held.map(heldRow)}
                ${money.paid.map(
                  (j) => html`<li>
                    <a class="held-row" href="#/job/${j.id}">
                      <img class="held-photo" data-photo="${j.afterPhoto}" alt="" />
                      <span class="held-text"><span class="held-status is-paid">Paid ${clock(j.releasedAt)}</span></span>
                      <span class="held-pay">${rupees(j.payout.picker)}</span>
                    </a>
                  </li>`,
                )}
              </ul>
            </section>`
          : ''}
      </main>`,
    );
    hydratePhotos(root);
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="accept"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const from = root.querySelector(`.job-row[data-job="${id}"]`)?.getBoundingClientRect();
    try {
      acceptJob(id, activePicker(getState()).id);
    } catch (err) {
      toast(err instanceof JobError ? err.message : 'Could not accept the job.');
      return;
    }
    const slot = root.querySelector(`.active-job[data-job="${id}"]`);
    slot?.scrollIntoView({ block: 'nearest' });
    flip(slot, from && slot ? { left: from.left, top: from.top } : null);
    slot?.classList.add('just-accepted');
    root.querySelector(`[data-key="mark-${id}"]`)?.focus({ preventScroll: true });
  });

  root.addEventListener('change', (e) => {
    if (e.target.dataset.act === 'picker') setActivePicker(e.target.value);
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
