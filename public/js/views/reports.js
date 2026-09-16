// Reporter's list: what happened to each spot, rewards, and "Flag as still dirty" during the hold.

import { CONFIG } from '../config.js';
import { t, tn } from '../i18n.js';
import { rupees, sizeLabel, wasteLabel } from '../payout.js';
import { hydratePhotos } from '../photos.js';
import { JobError, flagJob, getState, pickerName, subscribe, withdrawReport } from '../store.js';
import { clock, countdown, html, render, timeAgo, toast } from '../ui.js';

export function mount(root) {
  document.title = `${t('reports.title')} – Safai Saathi`;
  let confirming = null;

  function statusLine(s, job) {
    const name = pickerName(s, job.acceptedBy);
    switch (job.status) {
      case 'open':
        return tn('reports.status.open', job.notified);
      case 'accepted':
        return t('reports.status.accepted', { name, time: clock(job.acceptedAt) });
      case 'review':
        return t('reports.status.review', { name });
      case 'verified_hold':
        return html`${t('reports.status.hold', {
          name,
          time: clock(job.verifiedAt),
          countdown: '',
        })}<span class="mono" data-release="${job.releaseAt}">${countdown(job.releaseAt - Date.now())}</span>`;
      case 'disputed':
        return t('reports.status.disputed');
      case 'cancelled':
        return t('reports.status.cancelled');
      case 'released':
        return t('reports.status.released', { amount: rupees(job.payout.reporter) });
      default:
        return '';
    }
  }

  // While nobody has accepted a spot, the reporter can take it back.
  function withdrawBox(job) {
    if (job.status !== 'open') return '';
    if (confirming !== job.id) {
      return html`<button class="btn btn-quiet btn-block" data-act="withdraw" data-id="${job.id}" data-key="withdraw-${job.id}">
        ${t('reports.withdraw')}
      </button>`;
    }
    return html`<div class="confirm-box" role="group">
      <p>${t('reports.withdrawNote')}</p>
      <button class="btn btn-danger" data-act="withdraw-confirm" data-id="${job.id}" data-key="withdraw-yes-${job.id}">
        ${t('reports.withdraw')}
      </button>
      <button class="btn btn-quiet" data-act="flag-cancel">${t('action.keep')}</button>
    </div>`;
  }

  function flagBox(job) {
    if (job.status !== 'verified_hold') return '';
    if (confirming !== job.id) {
      return html`<button class="btn btn-danger btn-small" data-act="flag" data-id="${job.id}" data-key="flag-${job.id}">
        ${t('reports.flag')}
      </button>`;
    }
    return html`<div class="flag-box" role="group">
      <p>${t('reports.flagNote', { amount: rupees(job.payout.picker) })}</p>
      <button class="btn btn-danger" data-act="flag-confirm" data-id="${job.id}" data-key="confirm-${job.id}">
        ${t('reports.flag')}
      </button>
      <button class="btn btn-quiet" data-act="flag-cancel">${t('action.cancel')}</button>
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
          <a class="btn btn-quiet" href="#/">${t('nav.home')}</a>
          <h1>${t('reports.title')}</h1>
        </header>
        <section class="reward-strip" aria-label="${t('reports.rewards')}">
          <span>${t('reports.rewards')}</span>
          <strong>${rupees(earned)}</strong>
          ${pending ? html`<span class="reward-pending">${t('reports.pending', { amount: rupees(pending) })}</span>` : ''}
        </section>
        ${mine.length
          ? html`<ol class="report-list">
              ${mine.map(
                (job) => html`<li class="report-row">
                  <div class="report-photos">
                    <figure><img data-photo="${job.photo}" alt="" /><figcaption>${t('reports.before')}</figcaption></figure>
                    ${job.afterPhoto
                      ? html`<figure>
                          <img data-photo="${job.afterPhoto}" alt="" />
                          <figcaption>${t('reports.after')}</figcaption>
                        </figure>`
                      : ''}
                  </div>
                  <div class="report-body">
                    <div class="tags">
                      <span class="tag tag-${job.analysis.wasteType}">${wasteLabel(job.analysis.wasteType)}</span>
                      <span class="tag tag-outline">${sizeLabel(job.analysis.severity)}</span>
                    </div>
                    <p class="report-status status-${job.status}">${statusLine(s, job)}</p>
                    <p class="job-meta"><span class="mono">${job.id}</span><span>${timeAgo(job.createdAt)}</span></p>
                  </div>
                  ${flagBox(job)} ${withdrawBox(job)}
                </li>`,
              )}
            </ol>`
          : html`<p class="empty-light">${t('reports.empty', { share: Math.round(CONFIG.reporterShare * 100) })}</p>`}
        <a class="btn btn-primary btn-block" href="#/report">${t('home.report')}</a>
      </main>`,
    );
    hydratePhotos(root);
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'flag' || el.dataset.act === 'withdraw') confirming = el.dataset.id;
    else if (el.dataset.act === 'flag-cancel') confirming = null;
    else if (el.dataset.act === 'withdraw-confirm') {
      confirming = null;
      try {
        withdrawReport(el.dataset.id);
        toast(t('reports.withdrawn'));
      } catch (err) {
        toast(err instanceof JobError ? t('reports.withdrawLate') : err.message);
      }
    } else if (el.dataset.act === 'flag-confirm') {
      confirming = null;
      try {
        flagJob(el.dataset.id);
        toast(t('reports.flagged'));
      } catch (err) {
        toast(err instanceof JobError ? t('reports.flagLate') : err.message);
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
