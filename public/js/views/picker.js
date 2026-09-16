// Picker dashboard: a shift console. Earnings first, the job in hand second, open jobs by distance.

import { CONFIG } from '../config.js';
import { demoBadge } from '../demo.js';
import { distanceM, formatCoords, formatDistance, getPosition } from '../geo.js';
import { jobReasoning, t } from '../i18n.js';
import { rupees, sizeLabel, wasteLabel } from '../payout.js';
import { mountMaps } from '../map.js';
import { hydratePhotos } from '../photos.js';
import {
  JobError,
  acceptJob,
  cancelJob,
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
import { languageMenu, themeButton } from './home.js';

const NEW_FOR_MS = 5 * 60_000;

export function mount(root) {
  document.title = `${t('picker.title')} – Safai Saathi`;
  root.classList.add('is-dark');

  if (!getState().anchor) {
    getPosition()
      .then((fix) => ensureAnchor(fix, 'gps'))
      .catch(() => ensureAnchor(CONFIG.fallbackLocation, 'demo'));
  }

  let confirmingCancel = null;

  const tags = (job, short = true) =>
    html`<div class="tags">
      <span class="tag tag-${job.analysis.wasteType}">${wasteLabel(job.analysis.wasteType, short)}</span>
      <span class="tag tag-outline">${sizeLabel(job.analysis.severity)}</span>
      ${job.sample ? html`<span class="tag tag-sample">${t('picker.sample')}</span>` : ''}
      ${Date.now() - job.createdAt < NEW_FOR_MS && job.status === 'open'
        ? html`<span class="tag tag-new">${t('picker.new')}</span>`
        : ''}
    </div>`;

  const activeSlot = (job, me) => {
    const last = job.attempts.at(-1);
    return html`<article class="active-job" data-job="${job.id}" aria-labelledby="active-title">
      <h2 class="section-label" id="active-title">${t('picker.inProgress')}</h2>
      <div class="active-grid">
        <img class="active-photo" data-photo="${job.photo}" alt="" />
        <div class="active-info">
          ${tags(job, false)}
          <p class="active-pay">${rupees(job.payout.picker)}</p>
          <p class="mono active-dist">${t('picker.away', { distance: formatDistance(distanceM(me, job)) })}</p>
        </div>
      </div>
      <p class="active-why">${jobReasoning(job)}</p>
      <dl class="facts mono">
        <div><dt>${t('picker.job')}</dt><dd>${job.id}</dd></div>
        <div><dt>${t('picker.spot')}</dt><dd>${formatCoords(job)}</dd></div>
        <div><dt>${t('picker.accepted')}</dt><dd>${clock(job.acceptedAt)}</dd></div>
      </dl>
      ${last ? html`<p class="last-reject" role="status">${t('picker.lastReject', { title: last.title })}</p>` : ''}
      <div class="map-box" data-map="${job.lat},${job.lng}" role="img" aria-label="${t('map.title')}"></div>
      <p class="map-note">${t('map.circle', { m: CONFIG.proofRadiusM })}</p>
      <a class="btn btn-primary btn-block" href="#/proof/${job.id}" data-key="mark-${job.id}">${t('picker.markCleaned')}</a>
      <p class="btn-help">${t('picker.markCleanedHelp')}</p>
      <a
        class="btn btn-quiet btn-block"
        target="_blank"
        rel="noopener"
        href="https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}"
        >${t('picker.directions')}</a
      >
      ${confirmingCancel === job.id
        ? html`<div class="confirm-box" role="group">
            <p>${t('picker.giveUpNote')}</p>
            <button class="btn btn-danger" data-act="give-up-confirm" data-id="${job.id}" data-key="give-up-${job.id}">
              ${t('picker.giveUp')}
            </button>
            <button class="btn btn-quiet" data-act="give-up-cancel">${t('action.keep')}</button>
          </div>`
        : html`<button class="btn btn-quiet btn-block" data-act="give-up" data-id="${job.id}">${t('picker.giveUp')}</button>`}
    </article>`;
  };

  const jobRow = ({ job, distance }, busy) =>
    html`<li class="job-row${Date.now() - job.createdAt < NEW_FOR_MS ? ' is-new' : ''}" data-job="${job.id}">
      <img class="job-photo" data-photo="${job.photo}" alt="" />
      <div class="job-mid">
        ${tags(job)}
        <p class="job-why">${jobReasoning(job)}</p>
        <p class="job-meta"><span class="mono">${job.id}</span><span>${timeAgo(job.createdAt)}</span></p>
      </div>
      <div class="job-right">
        <span class="job-pay">${rupees(job.payout.picker)}</span>
        <span class="job-dist mono">${formatDistance(distance)}</span>
      </div>
      <button
        class="btn btn-accept"
        data-act="accept"
        data-id="${job.id}"
        data-key="accept-${job.id}"
        ${busy ? html`disabled` : ''}
      >
        ${t('picker.accept')}
      </button>
    </li>`;

  const heldRow = (job) =>
    html`<li>
      <a class="held-row" href="#/job/${job.id}">
        <img class="held-photo" data-photo="${job.afterPhoto ?? job.photo}" alt="" />
        <span class="held-text">
          <span class="held-status${job.status === 'disputed' ? ' is-flagged' : ''}">
            ${t(`picker.status.${job.status === 'verified_hold' ? 'hold' : job.status}`)}
          </span>
          ${job.status === 'verified_hold'
            ? html`<span class="mono held-count" data-release="${job.releaseAt}">${countdown(job.releaseAt - Date.now())}</span>`
            : ''}
        </span>
        <span class="held-pay">${rupees(job.payout.picker)}</span>
      </a>
    </li>`;

  function draw() {
    const s = getState();
    if (!s.anchor) {
      render(root, html`<main class="console"><p class="console-wait" role="status">${t('picker.finding')}</p></main>`);
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
          <a class="wm-small" href="#/" aria-label="Safai Saathi"><span lang="hi">सफ़ाई साथी</span></a>
          ${languageMenu(true)}
          <label class="who">
            <span class="visually-hidden">${t('picker.workingAs')}</span>
            <select data-act="picker" data-key="picker-select">
              ${s.pickers.map(
                (p) => html`<option value="${p.id}" ${p.id === me.id ? html`selected` : ''}>${p.name}</option>`,
              )}
            </select>
          </label>
          ${themeButton(true)}
          <button class="icon-btn" type="button" data-action="demo" aria-label="${t('home.demo')}">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
                transform="translate(-1 0)"
              />
            </svg>
          </button>
        </header>
        ${demoBadge()}
        <section class="earnings" aria-label="${t('picker.earnedToday')}">
          <div class="earn-main">
            <span class="earn-label">${t('picker.earnedToday')}</span>
            <span class="earn-amount">${rupees(money.earned)}</span>
          </div>
          <div class="earn-side"><span>${t('picker.onHold')}</span><strong>${rupees(money.onHold)}</strong></div>
          <div class="earn-side"><span>${t('picker.jobsDone')}</span><strong>${money.done}</strong></div>
        </section>

        ${active ? activeSlot(active, me) : ''}

        <section class="open-jobs" aria-labelledby="open-title">
          <h2 class="section-label" id="open-title">
            ${t('picker.openJobs')} <span class="count">${open.length}</span>
          </h2>
          ${active && open.length ? html`<p class="busy-note">${t('picker.busyNote')}</p>` : ''}
          ${open.length
            ? html`<ol class="jobs">${open.map((o) => jobRow(o, Boolean(active)))}</ol>`
            : html`<p class="empty">${t('picker.empty')}</p>`}
        </section>

        ${money.held.length || money.paid.length
          ? html`<section class="held" aria-labelledby="held-title">
              <h2 class="section-label" id="held-title">${t('picker.finished')}</h2>
              <ul class="held-list">
                ${money.held.map(heldRow)}
                ${money.paid.map(
                  (j) => html`<li>
                    <a class="held-row" href="#/job/${j.id}">
                      <img class="held-photo" data-photo="${j.afterPhoto}" alt="" />
                      <span class="held-text">
                        <span class="held-status is-paid">${t('picker.status.paid', { time: clock(j.releasedAt) })}</span>
                      </span>
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
    mountMaps(root);
  }

  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-act]')?.dataset.act;
    if (action === 'give-up') {
      confirmingCancel = e.target.closest('[data-act]').dataset.id;
      draw();
      return;
    }
    if (action === 'give-up-cancel') {
      confirmingCancel = null;
      draw();
      return;
    }
    if (action === 'give-up-confirm') {
      const id = e.target.closest('[data-act]').dataset.id;
      confirmingCancel = null;
      try {
        cancelJob(id, activePicker(getState()).id);
        toast(t('picker.gaveUp'));
      } catch {
        toast(t('picker.giveUpLate'));
        draw();
      }
      return;
    }

    const btn = e.target.closest('[data-act="accept"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const from = root.querySelector(`.job-row[data-job="${id}"]`)?.getBoundingClientRect();
    try {
      acceptJob(id, activePicker(getState()).id);
    } catch (err) {
      toast(err instanceof JobError ? t(err.kind === 'taken' ? 'picker.takenToast' : 'picker.busyToast') : err.message);
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
