// Reporter's list: what happened to each spot, rewards, and the two things a reporter can do:
// withdraw a spot nobody has taken yet, or flag a cleanup as still dirty during the hold.

import { useState } from 'react';
import Photo from '../components/Photo.jsx';
import CountUp from '../components/reactbits/CountUp/CountUp.jsx';
import WasteTags from '../components/WasteTags.jsx';
import { useNow, useStore, useTitle } from '../hooks.js';
import { CONFIG } from '../lib/config.js';
import { t, tn } from '../lib/i18n.js';
import { rupees } from '../lib/payout.js';
import { JobError, flagJob, pickerName, withdrawReport } from '../lib/store.js';
import { clock, countdown, timeAgo } from '../lib/time.js';
import { toast } from '../lib/toast.js';

function statusLine(s, job, now) {
  const name = pickerName(s, job.acceptedBy);
  switch (job.status) {
    case 'open':
      return tn('reports.status.open', job.notified);
    case 'accepted':
      return t('reports.status.accepted', { name, time: clock(job.acceptedAt) });
    case 'review':
      return t('reports.status.review', { name });
    case 'verified_hold':
      return t('reports.status.hold', { name, time: clock(job.verifiedAt), countdown: countdown(job.releaseAt - now) });
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

function RowAction({ job, confirming, setConfirming }) {
  const withdraw = job.status === 'open';
  const flag = job.status === 'verified_hold';
  if (!withdraw && !flag) return null;

  if (confirming !== job.id) {
    return withdraw ? (
      <button className="btn btn-quiet btn-block" onClick={() => setConfirming(job.id)}>
        {t('reports.withdraw')}
      </button>
    ) : (
      <button className="btn btn-danger btn-small" onClick={() => setConfirming(job.id)}>
        {t('reports.flag')}
      </button>
    );
  }

  function confirm() {
    setConfirming(null);
    try {
      if (withdraw) {
        withdrawReport(job.id);
        toast(t('reports.withdrawn'));
      } else {
        flagJob(job.id);
        toast(t('reports.flagged'));
      }
    } catch (err) {
      toast(err instanceof JobError ? t(withdraw ? 'reports.withdrawLate' : 'reports.flagLate') : err.message);
    }
  }

  return (
    <div className="confirm-box" role="group">
      <p>{withdraw ? t('reports.withdrawNote') : t('reports.flagNote', { amount: rupees(job.payout.picker) })}</p>
      <button className="btn btn-danger" onClick={confirm} autoFocus>
        {withdraw ? t('reports.withdraw') : t('reports.flag')}
      </button>
      <button className="btn btn-quiet" onClick={() => setConfirming(null)}>
        {t('action.keep')}
      </button>
    </div>
  );
}

export default function Reports() {
  useTitle(`${t('reports.title')} – Safai Saathi`);
  const s = useStore();
  const now = useNow(1000);
  const [confirming, setConfirming] = useState(null);

  const mine = s.jobs.filter((j) => !j.sample);
  const earned = mine.filter((j) => j.status === 'released').reduce((sum, j) => sum + j.payout.reporter, 0);
  const pending = mine
    .filter((j) => !['released', 'disputed', 'cancelled'].includes(j.status))
    .reduce((sum, j) => sum + j.payout.reporter, 0);

  return (
    <main className="reports">
      <header className="page-head">
        <a className="btn btn-quiet" href="#/">
          {t('nav.home')}
        </a>
        <h1>{t('reports.title')}</h1>
      </header>
      <section className="reward-strip" aria-label={t('reports.rewards')}>
        <span>{t('reports.rewards')}</span>
        <strong>
          <CountUp to={earned} prefix="₹" separator="," duration={0.9} trigger="load" />
        </strong>
        {pending > 0 && <span className="reward-pending">{t('reports.pending', { amount: rupees(pending) })}</span>}
      </section>
      {mine.length ? (
        <ol className="report-list">
          {mine.map((job) => (
            <li className="report-row" key={job.id}>
              <div className="report-photos">
                <figure>
                  <Photo photo={job.photo} />
                  <figcaption>{t('reports.before')}</figcaption>
                </figure>
                {job.afterPhoto && (
                  <figure>
                    <Photo photo={job.afterPhoto} />
                    <figcaption>{t('reports.after')}</figcaption>
                  </figure>
                )}
              </div>
              <div className="report-body">
                <WasteTags analysis={job.analysis} />
                <p className={`report-status status-${job.status}`}>{statusLine(s, job, now)}</p>
                <p className="job-meta">
                  <span className="mono">{job.id}</span>
                  <span>{timeAgo(job.createdAt)}</span>
                </p>
              </div>
              <RowAction job={job} confirming={confirming} setConfirming={setConfirming} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-light">{t('reports.empty', { share: Math.round(CONFIG.reporterShare * 100) })}</p>
      )}
      <a className="btn btn-primary btn-block" href="#/report">
        {t('home.report')}
      </a>
    </main>
  );
}
