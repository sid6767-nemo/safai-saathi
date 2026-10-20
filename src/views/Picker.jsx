// The picker app's job board. Earnings first, the job in hand second, open jobs nearest first.
// Distances come from this phone's GPS; the picker is whoever set up the app on this phone.

import { useEffect, useRef, useState } from 'react';
import DemoBadge from '../components/DemoBadge.jsx';
import JobRing from '../components/JobRing.jsx';
import LanguageMenu from '../components/LanguageMenu.jsx';
import Photo from '../components/Photo.jsx';
import Counter from '../components/reactbits/Counter/Counter.jsx';
import SpotMap from '../components/SpotMap.jsx';
import WasteTags from '../components/WasteTags.jsx';
import { useNow, useStore, useTitle } from '../hooks.js';
import { CONFIG } from '../lib/config.js';
import { distanceM, formatCoords, formatDistance, watchPosition } from '../lib/geo.js';
import { t } from '../lib/i18n.js';
import { rupees } from '../lib/payout.js';
import { JobError, acceptJob, activeJobFor, cancelJob, earningsFor, openJobsFor } from '../lib/store.js';
import { clock, countdown, timeAgo } from '../lib/time.js';
import { toast } from '../lib/toast.js';

const NEW_FOR_MS = 5 * 60_000;
// Fewer jobs than this look lonely on a ring, so they're shown as a list instead.
const RING_MIN_JOBS = 3;
const VIEW_KEY = 'safai-saathi:jobs-view';
// Tapping the logo this many times opens the demo controls, so pickers never find them by accident.
const DEMO_TAPS = 5;

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'ring';
  } catch {
    return 'ring';
  }
}

// The phone's own GPS, read live while the job board is open.
function useHere() {
  const [here, setHere] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(
    () =>
      watchPosition(
        (fix) => {
          setHere(fix);
          setDenied(false);
        },
        (err) => setDenied(err.kind === 'denied' || err.kind === 'insecure' || err.kind === 'unsupported'),
      ),
    [],
  );
  return { here, denied };
}

function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label={t('picker.view.label')}>
      {['ring', 'list'].map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}>
          {t(`picker.view.${v}`)}
        </button>
      ))}
    </div>
  );
}

const Distance = ({ meters }) => (meters == null ? null : <span className="job-dist mono">{formatDistance(meters)}</span>);

// The job at the front of the ring: everything needed to decide, and the Accept button.
function FocusedJob({ item, now, busy, onAccept }) {
  const { job, distance } = item;
  const fresh = now - job.createdAt < NEW_FOR_MS;
  return (
    <div className="ring-detail">
      <div className="ring-detail-top">
        <WasteTags analysis={job.analysis} isNew={fresh} />
        <div className="job-right">
          <span className="job-pay">{rupees(job.payout.picker)}</span>
          <Distance meters={distance} />
        </div>
      </div>
      <p className="job-why">{job.analysis.reasoning}</p>
      <p className="job-meta">
        <span className="mono">{job.id}</span>
        <span>{timeAgo(job.createdAt)}</span>
      </p>
      <button className="btn btn-primary btn-block" onClick={() => onAccept(job.id)} disabled={busy}>
        {t('picker.accept')}
      </button>
    </div>
  );
}

function ActiveJob({ job, here, profile, highlight, markRef }) {
  const [confirming, setConfirming] = useState(false);
  const last = job.attempts.at(-1);
  const gap = here ? distanceM(here, job) : null;
  // Inside the proof circle there's nowhere to go, so say so instead of offering the map link.
  const atSpot = gap !== null && gap <= CONFIG.proofRadiusM;

  function giveUp() {
    setConfirming(false);
    try {
      cancelJob(job.id, profile.id);
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
          <WasteTags analysis={job.analysis} />
          <p className="active-pay">{rupees(job.payout.picker)}</p>
          {gap !== null && <p className="mono active-dist">{t('picker.away', { distance: formatDistance(gap) })}</p>}
        </div>
      </div>
      <p className="active-why">{job.analysis.reasoning}</p>
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
      <SpotMap lat={job.lat} lng={job.lng} walk={!atSpot} />
      <p className="map-note">{t('map.circle', { m: CONFIG.proofRadiusM })}</p>
      <a ref={markRef} className="btn btn-primary btn-block" href={`#/proof/${job.id}`}>
        {t('picker.markCleaned')}
      </a>
      <p className="btn-help">{t('picker.markCleanedHelp')}</p>
      {atSpot ? (
        <p className="at-spot" role="status">
          {t('picker.atSpot', { distance: formatDistance(gap) })}
        </p>
      ) : (
        <a
          className="btn btn-quiet btn-block"
          target="_blank"
          rel="noopener"
          href={`https://www.google.com/maps/search/?api=1&query=${job.lat},${job.lng}`}
        >
          {t('picker.directions')}
        </a>
      )}
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
          {job.status === 'verified_hold' && <span className="mono held-count">{countdown(job.releaseAt - now)}</span>}
        </span>
        <span className="held-pay">{rupees(job.payout.picker)}</span>
      </a>
    </li>
  );
}

export default function Picker({ profile, onOpenDemo, onChangeName }) {
  useTitle(`${t('picker.title')} – Safai Saathi`);
  const s = useStore();
  const now = useNow(1000);
  const { here, denied } = useHere();
  const [justAccepted, setJustAccepted] = useState(null);
  const [view, setView] = useState(readView);
  const [focus, setFocus] = useState(0);
  const [focusFor, setFocusFor] = useState('');
  const taps = useRef({ count: 0, at: 0 });
  const markRef = useRef(null);

  // After accepting, the new job's main action gets focus and scrolls into view.
  useEffect(() => {
    if (!justAccepted) return;
    markRef.current?.focus({ preventScroll: true });
    markRef.current?.closest('.active-job')?.scrollIntoView({ block: 'nearest' });
  }, [justAccepted]);

  const active = activeJobFor(s, profile.id);
  const open = openJobsFor(s, here);
  const money = earningsFor(s, profile.id);
  const ringable = open.length >= RING_MIN_JOBS;
  const showRing = ringable && view === 'ring';
  const focusIndex = Math.min(focus, Math.max(0, open.length - 1));
  // When the set of jobs changes, the ring restarts at the nearest one so the card in front and
  // the details underneath can't disagree.
  const ringKey = open.map(({ job }) => job.id).join('|');
  if (focusFor !== ringKey) {
    // Adjusting state during render (React's documented pattern for resetting on a key change).
    setFocusFor(ringKey);
    setFocus(0);
  }

  function chooseView(next) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembering the choice is fine.
    }
  }

  function tapLogo() {
    const at = Date.now();
    taps.current = { count: at - taps.current.at < 800 ? taps.current.count + 1 : 1, at };
    if (taps.current.count >= DEMO_TAPS) {
      taps.current.count = 0;
      onOpenDemo();
    }
  }

  function accept(id) {
    try {
      acceptJob(id, profile);
      setJustAccepted(id);
    } catch (err) {
      toast(err instanceof JobError ? t(err.kind === 'taken' ? 'picker.takenToast' : 'picker.busyToast') : err.message);
    }
  }

  return (
    <main className="console">
      <header className="console-head">
        <button type="button" className="wm-small wm-button" onClick={tapLogo} aria-label="Safai Saathi">
          <span lang="hi">सफ़ाई साथी</span>
        </button>
        <LanguageMenu dark />
        <button type="button" className="who-name" onClick={onChangeName} title={t('picker.changeName')}>
          <span className="visually-hidden">{t('picker.changeName')}: </span>
          {profile.name}
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

      {!here && (
        <p className="locating" role="status">
          {denied ? t('picker.noLocation') : t('picker.finding')}
        </p>
      )}

      {active && (
        <ActiveJob
          key={active.id}
          job={active}
          here={here}
          profile={profile}
          highlight={justAccepted === active.id}
          markRef={markRef}
        />
      )}

      <section className="open-jobs" aria-labelledby="open-title">
        <div className="open-head">
          <h2 className="section-label" id="open-title">
            {t('picker.openJobs')} <span className="count">{open.length}</span>
          </h2>
          {ringable && <ViewToggle view={view} onChange={chooseView} />}
        </div>
        {active && open.length > 0 && <p className="busy-note">{t('picker.busyNote')}</p>}
        {showRing ? (
          <>
            <JobRing key={ringKey} jobs={open} onFocus={setFocus} />
            <p className="ring-hint">{t('picker.ringHint')}</p>
            <FocusedJob
              key={open[focusIndex].job.id}
              item={open[focusIndex]}
              now={now}
              busy={Boolean(active)}
              onAccept={accept}
            />
          </>
        ) : open.length ? (
          <ol className="jobs">
            {open.map(({ job, distance }, i) => {
              const fresh = now - job.createdAt < NEW_FOR_MS;
              return (
                <li className={`job-row${fresh ? ' is-new' : ''}`} key={job.id} style={{ '--row': i }}>
                  <Photo className="job-photo" photo={job.photo} />
                  <div className="job-mid">
                    <WasteTags analysis={job.analysis} short isNew={fresh} />
                    <p className="job-why">{job.analysis.reasoning}</p>
                    <p className="job-meta">
                      <span className="mono">{job.id}</span>
                      <span>{timeAgo(job.createdAt)}</span>
                    </p>
                  </div>
                  <div className="job-right">
                    <span className="job-pay">{rupees(job.payout.picker)}</span>
                    <Distance meters={distance} />
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
