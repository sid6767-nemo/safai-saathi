// Picker dashboard: a shift console. Earnings first, the job in hand second, open jobs by distance.

import { useEffect, useRef, useState } from 'react';
import DemoBadge from '../components/DemoBadge.jsx';
import LanguageMenu from '../components/LanguageMenu.jsx';
import Photo from '../components/Photo.jsx';
import Counter from '../components/reactbits/Counter/Counter.jsx';
import SpotMap from '../components/SpotMap.jsx';
import ThemeButton from '../components/ThemeButton.jsx';
import WasteTags from '../components/WasteTags.jsx';
import { useNow, useStore, useTitle } from '../hooks.js';
import { CONFIG } from '../lib/config.js';
import { distanceM, formatCoords, formatDistance, getPosition } from '../lib/geo.js';
import { jobReasoning, t } from '../lib/i18n.js';
import { rupees } from '../lib/payout.js';
import {
  JobError,
  acceptJob,
  activeJobFor,
  activePicker,
  cancelJob,
  earningsFor,
  ensureAnchor,
  openJobsFor,
  setActivePicker,
} from '../lib/store.js';
import { clock, countdown, timeAgo } from '../lib/time.js';
import { toast } from '../lib/toast.js';

const NEW_FOR_MS = 5 * 60_000;

function ActiveJob({ job, me, highlight, markRef }) {
  const [confirming, setConfirming] = useState(false);
  const last = job.attempts.at(-1);

  function giveUp() {
    setConfirming(false);
    try {
      cancelJob(job.id, me.id);
      toast(t('picker.gaveUp'));
    } catch {
      toast(t('picker.giveUpLate'));
    }
  }

  return (
    <article className={`active-job${highlight ? ' just-accepted' : ''}`} aria-labelledby="active-title">
      <h2 className="section-label" id="active-title">
        {t('picker.inProgress')}
      </h2>
      <div className="active-grid">
        <Photo className="active-photo" photo={job.photo} />
        <div className="active-info">
          <WasteTags analysis={job.analysis} sample={job.sample} />
          <p className="active-pay">{rupees(job.payout.picker)}</p>
          <p className="mono active-dist">{t('picker.away', { distance: formatDistance(distanceM(me, job)) })}</p>
        </div>
      </div>
      <p className="active-why">{jobReasoning(job)}</p>
      <dl className="facts mono">
        <div>
          <dt>{t('picker.job')}</dt>
          <dd>{job.id}</dd>
        </div>
        <div>
          <dt>{t('picker.spot')}</dt>
          <dd>{formatCoords(job)}</dd>
        </div>
        <div>
          <dt>{t('picker.accepted')}</dt>
          <dd>{clock(job.acceptedAt)}</dd>
        </div>
      </dl>
      {last && (
        <p className="last-reject" role="status">
          {t('picker.lastReject', { title: last.title })}
        </p>
      )}
      <SpotMap lat={job.lat} lng={job.lng} />
      <p className="map-note">{t('map.circle', { m: CONFIG.proofRadiusM })}</p>
      <a ref={markRef} className="btn btn-primary btn-block" href={`#/proof/${job.id}`}>
        {t('picker.markCleaned')}
      </a>
      <p className="btn-help">{t('picker.markCleanedHelp')}</p>
      <a
        className="btn btn-quiet btn-block"
        target="_blank"
        rel="noopener"
        href={`https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}&travelmode=walking`}
      >
        {t('picker.directions')}
      </a>
      {confirming ? (
        <div className="confirm-box" role="group">
          <p>{t('picker.giveUpNote')}</p>
          <button className="btn btn-danger" onClick={giveUp} autoFocus>
            {t('picker.giveUp')}
          </button>
          <button className="btn btn-quiet" onClick={() => setConfirming(false)}>
            {t('action.keep')}
          </button>
        </div>
      ) : (
        <button className="btn btn-quiet btn-block" onClick={() => setConfirming(true)}>
          {t('picker.giveUp')}
        </button>
      )}
    </article>
  );
}

function FinishedRow({ job, now }) {
  const paid = job.status === 'released';
  const statusKey = job.status === 'verified_hold' ? 'hold' : job.status;
  return (
    <li>
      <a className="held-row" href={`#/job/${job.id}`}>
        <Photo className="held-photo" photo={job.afterPhoto ?? job.photo} />
        <span className="held-text">
          <span className={`held-status${job.status === 'disputed' ? ' is-flagged' : ''}${paid ? ' is-paid' : ''}`}>
            {paid ? t('picker.status.paid', { time: clock(job.releasedAt) }) : t(`picker.status.${statusKey}`)}
          </span>
          {job.status === 'verified_hold' && (
            <span className="mono held-count">{countdown(job.releaseAt - now)}</span>
          )}
        </span>
        <span className="held-pay">{rupees(job.payout.picker)}</span>
      </a>
    </li>
  );
}

export default function Picker({ onOpenDemo }) {
  useTitle(`${t('picker.title')} – Safai Saathi`);
  const s = useStore();
  const now = useNow(1000);
  const [justAccepted, setJustAccepted] = useState(null);
  const markRef = useRef(null);

  // The first location read places the simulated pickers and sample jobs.
  useEffect(() => {
    if (s.anchor) return;
    getPosition()
      .then((fix) => ensureAnchor(fix, 'gps'))
      .catch(() => ensureAnchor(CONFIG.fallbackLocation, 'demo'));
  }, [s.anchor]);

  // After accepting, the new job's main action gets focus and scrolls into view.
  useEffect(() => {
    if (!justAccepted) return;
    markRef.current?.focus({ preventScroll: true });
    markRef.current?.closest('.active-job')?.scrollIntoView({ block: 'nearest' });
  }, [justAccepted]);

  if (!s.anchor) {
    return (
      <main className="console">
        <p className="console-wait" role="status">
          {t('picker.finding')}
        </p>
      </main>
    );
  }

  const me = activePicker(s);
  const active = activeJobFor(s, me.id);
  const open = openJobsFor(s, me);
  const money = earningsFor(s, me.id);

  function accept(id) {
    try {
      acceptJob(id, me.id);
      setJustAccepted(id);
    } catch (err) {
      toast(err instanceof JobError ? t(err.kind === 'taken' ? 'picker.takenToast' : 'picker.busyToast') : err.message);
    }
  }

  return (
    <main className="console">
      <header className="console-head">
        <a className="wm-small" href="#/" aria-label="Safai Saathi">
          <span lang="hi">सफ़ाई साथी</span>
        </a>
        <LanguageMenu dark />
        <label className="who">
          <span className="visually-hidden">{t('picker.workingAs')}</span>
          <select value={me.id} onChange={(e) => setActivePicker(e.target.value)}>
            {s.pickers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <ThemeButton dark />
        <button className="icon-btn" type="button" onClick={onOpenDemo} aria-label={t('home.demo')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
              transform="translate(-1 0)"
            />
          </svg>
        </button>
      </header>
      <DemoBadge />

      <section className="earnings" aria-label={t('picker.earnedToday')}>
        <div className="earn-main">
          <span className="earn-label">{t('picker.earnedToday')}</span>
          {/* Odometer digits roll whenever a payout lands, so the number visibly goes up. */}
          <span className="earn-amount">
            <Counter value={money.earned} prefix="₹" locale="en-IN" fontSize={56} fontWeight={800} />
          </span>
        </div>
        <div className="earn-side">
          <span>{t('picker.onHold')}</span>
          <strong>{rupees(money.onHold)}</strong>
        </div>
        <div className="earn-side">
          <span>{t('picker.jobsDone')}</span>
          <strong>
            <Counter value={money.done} fontSize={23} fontWeight={800} />
          </strong>
        </div>
      </section>

      {active && (
        <ActiveJob key={active.id} job={active} me={me} highlight={justAccepted === active.id} markRef={markRef} />
      )}

      <section className="open-jobs" aria-labelledby="open-title">
        <h2 className="section-label" id="open-title">
          {t('picker.openJobs')} <span className="count">{open.length}</span>
        </h2>
        {active && open.length > 0 && <p className="busy-note">{t('picker.busyNote')}</p>}
        {open.length ? (
          <ol className="jobs">
            {open.map(({ job, distance }, i) => {
              const fresh = now - job.createdAt < NEW_FOR_MS;
              return (
                <li className={`job-row${fresh ? ' is-new' : ''}`} key={job.id} style={{ '--row': i }}>
                  <Photo className="job-photo" photo={job.photo} />
                  <div className="job-mid">
                    <WasteTags analysis={job.analysis} short sample={job.sample} isNew={fresh} />
                    <p className="job-why">{jobReasoning(job)}</p>
                    <p className="job-meta">
                      <span className="mono">{job.id}</span>
                      <span>{timeAgo(job.createdAt)}</span>
                    </p>
                  </div>
                  <div className="job-right">
                    <span className="job-pay">{rupees(job.payout.picker)}</span>
                    <span className="job-dist mono">{formatDistance(distance)}</span>
                  </div>
                  <button className="btn btn-accept" onClick={() => accept(job.id)} disabled={Boolean(active)}>
                    {t('picker.accept')}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty">{t('picker.empty')}</p>
        )}
      </section>

      {(money.held.length > 0 || money.paid.length > 0) && (
        <section className="held" aria-labelledby="held-title">
          <h2 className="section-label" id="held-title">
            {t('picker.finished')}
          </h2>
          <ul className="held-list">
            {[...money.held, ...money.paid].map((job) => (
              <FinishedRow key={job.id} job={job} now={now} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
