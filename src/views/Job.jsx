// A picker's finished job: verified and on hold, released, paused by a flag, or in manual review.

import Photo from '../components/Photo.jsx';
import CountUp from '../components/reactbits/CountUp/CountUp.jsx';
import ShinyText from '../components/reactbits/ShinyText.jsx';
import { useNow, useStore, useTitle } from '../hooks.js';
import { CONFIG } from '../lib/config.js';
import { cssVar } from '../lib/css.js';
import { t } from '../lib/i18n.js';
import { rupees } from '../lib/payout.js';
import { clock, countdown } from '../lib/time.js';
import { checkLabel } from '../lib/verify.js';

function Split({ job }) {
  return (
    <dl className="split">
      <div className="split-picker">
        <dt>{t('split.you')}</dt>
        <dd>{rupees(job.payout.picker)}</dd>
      </div>
      <div>
        <dt>{t('job.reporterReward')}</dt>
        <dd>{rupees(job.payout.reporter)}</dd>
      </div>
      <div>
        <dt>{t('split.fund')}</dt>
        <dd>{rupees(job.payout.fundTotal)}</dd>
      </div>
    </dl>
  );
}

function BeforeAfter({ job }) {
  return (
    <div className="before-after">
      <figure>
        <Photo photo={job.photo} />
        <figcaption>{t('job.reported')}</figcaption>
      </figure>
      <figure>
        <Photo photo={job.afterPhoto} />
        <figcaption>{t('job.yourProof', { time: clock(job.proofCapturedAt) })}</figcaption>
      </figure>
    </div>
  );
}

function CheckSummary({ job }) {
  if (!job.proofChecks) return null;
  return (
    <ul className="check-summary">
      {job.proofChecks.map((c) => (
        <li className={`is-${c.state}`} key={c.id}>
          <span aria-hidden="true">{c.state === 'pass' ? '✓' : '–'}</span> {checkLabel(c.id)}
        </li>
      ))}
    </ul>
  );
}

function Body({ job, now }) {
  switch (job.status) {
    case 'verified_hold':
      return (
        <>
          <h1 className="result-title">
            <span className="result-mark" aria-hidden="true">
              ✓
            </span>
            <ShinyText
              text={t('proof.verified')}
              color={cssVar('--on-dark', '#f2f4f0')}
              shineColor={cssVar('--verified-soft', '#35d183')}
              speed={1.6}
              trigger="view"
            />
          </h1>
          <div className="hold-box">
            <span>{t('job.releasesIn')}</span>
            <strong className="hold-count mono">{countdown(job.releaseAt - now)}</strong>
            <p>{t('job.holdNote', { hours: CONFIG.holdHours })}</p>
          </div>
          <Split job={job} />
          <BeforeAfter job={job} />
          <CheckSummary job={job} />
        </>
      );
    case 'released':
      return (
        <>
          <h1 className="result-title">
            <ShinyText
              text={t('job.released')}
              color={cssVar('--on-dark', '#f2f4f0')}
              shineColor={cssVar('--verified-soft', '#35d183')}
              speed={1.6}
              trigger="view"
            />
          </h1>
          <p className="release-amount" aria-live="polite">
            <CountUp to={job.payout.picker} prefix="₹" separator="," duration={1.1} trigger="load" />
          </p>
          <p className="result-note">{t('job.releasedNote')}</p>
          <Split job={job} />
          <BeforeAfter job={job} />
        </>
      );
    case 'disputed':
      return (
        <>
          <h1 className="result-title is-paused">{t('job.paused')}</h1>
          <p className="result-note">
            {t('job.pausedNote', { time: clock(job.disputedAt), amount: rupees(job.payout.picker) })}
          </p>
          <BeforeAfter job={job} />
        </>
      );
    case 'review':
      return (
        <>
          <h1 className="result-title">{t('job.review')}</h1>
          <p className="result-note">{t('job.reviewNote', { reason: job.reviewReason })}</p>
          <BeforeAfter job={job} />
          <CheckSummary job={job} />
        </>
      );
    default:
      return <h1 className="result-title">{t('job.unfinished')}</h1>;
  }
}

export default function Job({ param: jobId }) {
  useTitle(`${t('job.title')} ${jobId} – Safai Saathi`);
  const { jobs } = useStore();
  const now = useNow(1000);
  const job = jobs.find((j) => j.id === jobId);

  return (
    <main className="result">
      <header className="result-head">
        <a className="btn btn-quiet" href="#/picker">
          {t('nav.backToJobs')}
        </a>
        <span className="mono result-id">{jobId}</span>
      </header>
      {job ? <Body job={job} now={now} /> : <h1 className="result-title">{t('job.gone')}</h1>}
    </main>
  );
}
