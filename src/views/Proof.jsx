// Proof of completion: live camera only, a one-time job code on screen and burned into the photo,
// GPS and time read at capture, then the checks in lib/verify.js run one by one.

import { useEffect, useRef, useState } from 'react';
import DemoBadge from '../components/DemoBadge.jsx';
import Photo from '../components/Photo.jsx';
import ShinyText from '../components/reactbits/ShinyText.jsx';
import { useNow, useStore, useTitle } from '../hooks.js';
import { CameraError, canvasToBlob, formatCode, grabFrame, scaledDataUrl, stampPhoto, startCamera } from '../lib/camera.js';
import { CONFIG } from '../lib/config.js';
import { cssVar } from '../lib/css.js';
import { formatCoords, getPosition, offsetM, watchPosition } from '../lib/geo.js';
import { t } from '../lib/i18n.js';
import { newPhotoId, putPhoto } from '../lib/photos.js';
import { ensureCode, getState, markReview, markVerified, recordAttempt } from '../lib/store.js';
import { countdown, pause, stamp } from '../lib/time.js';
import { CHECKS, aiChecks, checkLabel, localChecks, noLocationRejection } from '../lib/verify.js';

const MARK = { pending: '', running: '', pass: '✓', fail: '✕', skipped: '–' };

function NotYours() {
  return (
    <main className="notice">
      <h1>{t('proof.notYours.title')}</h1>
      <p>{t('proof.notYours.body')}</p>
      <a className="btn btn-primary btn-block" href="#/">
        {t('nav.backToJobs')}
      </a>
    </main>
  );
}

function Checklist({ checks }) {
  return (
    <ol className="checklist">
      {checks.map((c) => (
        <li className={`check is-${c.state}`} key={c.id}>
          <span className="check-mark" aria-hidden="true">
            {MARK[c.state]}
          </span>
          <span>
            <span className="check-label">{checkLabel(c.id)}</span>
            <span className="visually-hidden">: {t(`check.state.${c.state}`)}.</span>
            {c.detail && <span className="check-detail">{c.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const findJob = (id) => getState().jobs.find((j) => j.id === id);

async function savePhoto(capture) {
  const id = newPhotoId('proof');
  await putPhoto(id, capture.blob);
  return id;
}

const proofRecord = (capture, afterPhoto, list) => ({
  afterPhoto,
  proofCapturedAt: capture.capturedAt,
  proofFix: capture.fix,
  proofChecks: list.map(({ id, state, detail }) => ({ id, state, detail })),
});

function ProofCamera({ jobId }) {
  const { jobs } = useStore();
  const job = jobs.find((j) => j.id === jobId);
  const now = useNow(1000);

  const video = useRef(null);
  const cameraStop = useRef(null);
  const watchStop = useRef(null);
  const fixRef = useRef(null);
  const alive = useRef(true);

  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState('starting');
  const [frozen, setFrozen] = useState(null);
  const [fix, setFix] = useState(null);
  const [fixError, setFixError] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [checks, setChecks] = useState([]);
  const [rejection, setRejection] = useState(null);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const release = () => {
    cameraStop.current?.();
    cameraStop.current = null;
    watchStop.current?.();
    watchStop.current = null;
  };

  // A fresh code unless the current one is still valid, then the camera and GPS. Runs per retake.
  useEffect(() => {
    let cancelled = false;
    ensureCode(jobId);
    setChecks([]);
    setRejection(null);
    setFrozen(null);
    setPhase('starting');
    watchStop.current = watchPosition(
      (f) => {
        fixRef.current = f;
        setFix(f);
        setFixError(null);
      },
      (err) => setFixError(err.kind),
    );
    startCamera(video.current)
      .then((stop) => {
        if (cancelled) return stop();
        cameraStop.current = stop;
        setPhase('live');
      })
      .catch((err) => {
        if (cancelled) return;
        setCameraError(err instanceof CameraError ? err.kind : 'unknown');
        setPhase('camera-error');
      });
    return () => {
      cancelled = true;
      release();
    };
  }, [jobId, attempt]);

  const retake = () => setAttempt((n) => n + 1);

  function reject(r, list) {
    setChecks(list.map((c) => (c.state === 'pending' || c.state === 'running' ? { ...c, state: 'skipped' } : c)));
    recordAttempt(jobId, { check: r.check, title: r.title });
    setRejection(r);
    setPhase('rejected');
  }

  async function runChecks(capture) {
    let list = CHECKS.map((c) => ({ ...c, state: 'pending', detail: '' }));
    const show = () => setChecks(list);
    show();
    setPhase('checking');
    const current = findJob(jobId);

    // Each check ticks as its result comes in.
    const tick = async (results) => {
      for (const r of results) {
        list = list.map((c) => (c.id === r.id ? { ...c, state: r.ok ? 'pass' : 'fail', detail: r.detail } : c));
        show();
        await pause(320);
      }
    };

    const local = localChecks(current, capture);
    await tick(local.results);
    if (local.rejection) return reject(local.rejection, list);

    list = list.map((c) => (c.ai ? { ...c, state: 'running' } : c));
    show();

    let ai;
    try {
      ai = await aiChecks(current, capture.dataUrl);
    } catch (err) {
      if (!alive.current) return;
      // Never auto-approve without the AI checks: a person decides instead.
      list = list.map((c) => (c.ai ? { ...c, state: 'skipped', detail: t('detail.aiUnavailable') } : c));
      show();
      const afterPhoto = await savePhoto(capture);
      markReview(jobId, { ...proofRecord(capture, afterPhoto, list), reviewReason: err.message });
      location.hash = `#/job/${jobId}`;
      return;
    }
    if (!alive.current) return;
    await tick(ai.results);
    if (ai.rejection) return reject(ai.rejection, list);

    const afterPhoto = await savePhoto(capture);
    markVerified(jobId, proofRecord(capture, afterPhoto, list));
    setPhase('passed');
    await pause(1300);
    if (alive.current) location.hash = `#/job/${jobId}`;
  }

  async function takePhoto() {
    const { demo } = getState();
    const capturedAt = Date.now() - (demo.clockSkew ? CONFIG.demo.clockSkewMin * 60_000 : 0);
    const canvas = grabFrame(video.current);
    const recent = fixRef.current && Date.now() - fixRef.current.at < CONFIG.maxFixAgeMs ? fixRef.current : null;
    release();
    setFrozen(canvas.toDataURL('image/jpeg', 0.8));

    let where = recent;
    if (!where) {
      setPhase('locating');
      try {
        where = await getPosition();
      } catch (err) {
        if (alive.current) reject(noLocationRejection(err.kind), []);
        return;
      }
    }
    if (!alive.current) return;
    if (demo.spoofLocation) where = { ...where, ...offsetM(where, CONFIG.demo.spoofDistanceM, 0) };

    const current = findJob(jobId);
    await stampPhoto(canvas, {
      code: current.proof.code,
      lines: [`Safai Saathi proof ${current.id}  ${stamp(capturedAt)}`, `${formatCoords(where)}  ±${where.accuracy} m`],
    });
    setFrozen(canvas.toDataURL('image/jpeg', 0.85));
    runChecks({ capturedAt, fix: where, blob: await canvasToBlob(canvas), dataUrl: scaledDataUrl(canvas, 1024) });
  }

  function panel() {
    switch (phase) {
      case 'starting':
        return (
          <button className="shutter" disabled>
            {t('report.starting')}
          </button>
        );
      case 'live':
        return (
          <>
            <DemoBadge />
            <p className="cam-hint">{t('proof.hint')}</p>
            <button className="shutter" onClick={takePhoto}>
              {t('proof.take')}
            </button>
          </>
        );
      case 'camera-error':
        return (
          <div className="sheet sheet-dark" role="alert">
            <h2 className="sheet-title">{t(`cam.${cameraError}.title`)}</h2>
            <p>{t(`cam.${cameraError}.body`)}</p>
            <p className="fix">
              <strong>{t('action.whatToDo')}</strong> {t(`cam.${cameraError}.fix`)}
            </p>
            <div className="sheet-actions">
              <button className="btn btn-primary btn-block" onClick={retake} autoFocus>
                {t('action.tryAgain')}
              </button>
              <a className="btn btn-quiet btn-block" href="#/">
                {t('nav.backToJobs')}
              </a>
            </div>
          </div>
        );
      case 'locating':
        return (
          <div className="sheet sheet-dark sheet-busy" role="status">
            <span className="spinner" aria-hidden="true" />
            {t('report.locating')}
          </div>
        );
      case 'checking':
        return (
          <div className="sheet sheet-dark">
            <h2 className="sheet-title">{t('proof.checking')}</h2>
            <Checklist checks={checks} />
          </div>
        );
      case 'passed':
        return (
          <div className="sheet sheet-dark" role="status">
            <h2 className="sheet-title">
              <ShinyText
                text={t('proof.verified')}
                color={cssVar('--verified-soft', '#35d183')}
                shineColor="#ffffff"
                speed={1.4}
                trigger="view"
              />
            </h2>
            <Checklist checks={checks} />
          </div>
        );
      case 'rejected':
        return (
          <div className="sheet sheet-dark">
            {checks.length > 0 && <Checklist checks={checks} />}
            <div className="reject" role="alert">
              <p className="reject-kicker">{t('proof.rejected')}</p>
              <h2 className="sheet-title">{rejection.title}</h2>
              <p>{rejection.body}</p>
              <p className="fix">
                <strong>{t('action.whatToDo')}</strong> {rejection.fix}
              </p>
            </div>
            <div className="sheet-actions">
              <button className="btn btn-primary btn-block" onClick={retake} autoFocus>
                {t('proof.take')}
              </button>
              <a className="btn btn-quiet btn-block" href="#/">
                {t('nav.backToJobs')}
              </a>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  const live = phase === 'starting' || phase === 'live';
  const gps = fix ? t('report.gps', { m: fix.accuracy }) : fixError ? t('report.gpsNone') : t('report.gpsFinding');
  const codeLeft = job?.proof ? job.proof.issuedAt + CONFIG.codeTtlMin * 60_000 - now : 0;

  return (
    <div className="cam cam-proof">
      <video ref={video} className="cam-feed" playsInline muted aria-label="Live camera" hidden={Boolean(frozen)} />
      {frozen && <img className="cam-frozen" src={frozen} alt="" />}
      <div className="cam-top">
        <a className="cam-close" href="#/" aria-label={t('proof.close')}>
          ✕
        </a>
        {live && (
          <span className="chip chip-live mono" role="status">
            {gps}
          </span>
        )}
      </div>
      {live && job?.proof && (
        <div className="code-plate" aria-live="polite">
          <span className="plate-label">{t('proof.jobCode')}</span>
          <span className="plate-code">{formatCode(job.proof.code)}</span>
          <span className="plate-ttl">
            {codeLeft > 0 ? t('proof.validFor', { time: countdown(codeLeft).slice(3) }) : t('proof.expired')}
          </span>
        </div>
      )}
      {live && job && (
        <figure className="ref-photo">
          <Photo photo={job.photo} />
          <figcaption>{t('proof.reportPhoto')}</figcaption>
        </figure>
      )}
      <div className="cam-panel">{panel()}</div>
    </div>
  );
}

export default function Proof({ param: jobId, profile }) {
  useTitle(`${t('proof.title')} – Safai Saathi`);
  const s = useStore();
  // Decided once when the screen opens: verifying changes the job's status, and the checklist
  // must stay on screen while that happens.
  const [allowed] = useState(() => {
    const job = s.jobs.find((j) => j.id === jobId);
    return job?.status === 'accepted' && job.acceptedBy === profile?.id;
  });
  return allowed ? <ProofCamera jobId={jobId} /> : <NotYours />;
}
