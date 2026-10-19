// Reporter flow: the camera opens immediately, one shutter tap, the AI verdict, "Report this spot".

import { useEffect, useRef, useState } from 'react';
import CountUp from '../components/reactbits/CountUp/CountUp.jsx';
import ShinyText from '../components/reactbits/ShinyText.jsx';
import WasteTags from '../components/WasteTags.jsx';
import { useTitle } from '../hooks.js';
import { AiError, analyzePhoto } from '../lib/ai.js';
import { CameraError, canvasToBlob, grabFrame, scaledDataUrl, stampPhoto, startCamera } from '../lib/camera.js';
import { CONFIG } from '../lib/config.js';
import { cssVar } from '../lib/css.js';
import { formatCoords, getPosition, watchPosition } from '../lib/geo.js';
import { t } from '../lib/i18n.js';
import { estimatePayout, rupees, sizeLabel, wasteLabel } from '../lib/payout.js';
import { newPhotoId, putPhoto } from '../lib/photos.js';
import { createReport } from '../lib/store.js';
import { stamp } from '../lib/time.js';

const STEP_OF = {
  starting: 1,
  live: 1,
  'camera-error': 1,
  locating: 2,
  'geo-error': 2,
  analyzing: 2,
  result: 2,
  'not-waste': 2,
  'ai-error': 2,
  manual: 2,
  submitted: 3,
};

function Receipt({ type, size }) {
  const p = estimatePayout(type, size);
  return (
    <>
      <dl className="receipt">
        <div className="receipt-row receipt-main">
          <dt>{t('report.pickerEarns')}</dt>
          <dd>
            <CountUp to={p.picker} prefix="₹" separator="," duration={0.7} trigger="load" />
          </dd>
        </div>
        <div className="receipt-row receipt-you">
          <dt>{t('report.youEarn')}</dt>
          <dd>{rupees(p.reporter)}</dd>
        </div>
      </dl>
      <p className="fine">
        {t('report.fine', {
          rate: rupees(p.base),
          type: wasteLabel(type),
          mult: p.multiplier,
          size: sizeLabel(size).toLowerCase(),
        })}
      </p>
    </>
  );
}

function Evidence({ capture }) {
  return (
    <p className="evidence mono">
      {formatCoords(capture.fix)} ±{capture.fix.accuracy} m{capture.source === 'demo' ? ' (demo)' : ''}
    </p>
  );
}

function ProblemSheet({ prefix, kind, children }) {
  return (
    <div className="sheet" role="alert">
      <h2 className="sheet-title">{t(`${prefix}.${kind}.title`)}</h2>
      <p>{t(`${prefix}.${kind}.body`)}</p>
      <p className="fix">
        <strong>{t('action.whatToDo')}</strong> {t(`${prefix}.${kind}.fix`)}
      </p>
      <div className="sheet-actions">{children}</div>
    </div>
  );
}

function Busy({ text }) {
  return (
    <div className="sheet sheet-busy" role="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  );
}

export default function Report() {
  useTitle(`${t('home.report')} – Safai Saathi`);

  const video = useRef(null);
  const cameraStop = useRef(null);
  const watchStop = useRef(null);
  const fixRef = useRef(null);
  const pending = useRef(null);
  const captureRef = useRef(null);
  const alive = useRef(true);

  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState('starting');
  const [frozen, setFrozen] = useState(null);
  const [fix, setFix] = useState(null);
  const [fixError, setFixError] = useState(null);
  const [problem, setProblem] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [capture, setCapture] = useState(null);
  const [manual, setManual] = useState({ type: 'dry', size: 'small' });
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);

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

  // Opens the camera and starts reading GPS; runs again for every retake.
  useEffect(() => {
    let cancelled = false;
    setPhase('starting');
    setFrozen(null);
    setAnalysis(null);
    setCapture(null);
    setJob(null);
    setProblem(null);
    setBusy(false);
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
        setProblem(err instanceof CameraError ? err.kind : 'unknown');
        setPhase('camera-error');
      });
    return () => {
      cancelled = true;
      release();
    };
  }, [attempt]);

  const retake = () => setAttempt((n) => n + 1);

  async function takePhoto() {
    const capturedAt = Date.now();
    const canvas = grabFrame(video.current);
    const recent = fixRef.current && Date.now() - fixRef.current.at < CONFIG.maxFixAgeMs ? fixRef.current : null;
    release();
    setFrozen(canvas.toDataURL('image/jpeg', 0.8));
    pending.current = { canvas, capturedAt };
    if (recent) finish(recent, 'gps');
    else locate();
  }

  function locate() {
    setPhase('locating');
    getPosition()
      .then((f) => alive.current && finish(f, 'gps'))
      .catch((err) => {
        if (!alive.current) return;
        setProblem(err.kind ?? 'unavailable');
        setPhase('geo-error');
      });
  }

  async function finish(where, source) {
    const { canvas, capturedAt } = pending.current;
    await stampPhoto(canvas, {
      lines: [
        `Safai Saathi report  ${stamp(capturedAt)}`,
        `${formatCoords(where)}  ±${where.accuracy} m${source === 'demo' ? '  demo location' : ''}`,
      ],
    });
    setFrozen(canvas.toDataURL('image/jpeg', 0.85));
    const c = { blob: await canvasToBlob(canvas), dataUrl: scaledDataUrl(canvas, 1024), capturedAt, fix: where, source };
    captureRef.current = c;
    setCapture(c);
    analyze(c);
  }

  async function analyze(c) {
    setPhase('analyzing');
    try {
      const a = await analyzePhoto(c.dataUrl);
      if (!alive.current) return;
      setAnalysis(a);
      setPhase(a.isWasteSite ? 'result' : 'not-waste');
    } catch (err) {
      if (!alive.current) return;
      setProblem(err instanceof AiError ? err.message : 'The AI check failed.');
      setPhase('ai-error');
    }
  }

  async function submit() {
    setBusy(true);
    const c = captureRef.current;
    const a =
      phase === 'manual'
        ? {
            wasteType: manual.type,
            severity: manual.size,
            itemsSeen: [],
            reasoning: t('report.estimatedByYou'),
            source: 'manual',
          }
        : analysis;
    const photo = newPhotoId('report');
    await putPhoto(photo, c.blob);
    const created = createReport({ fix: c.fix, locationSource: c.source, photo, analysis: a });
    if (!alive.current) return;
    setJob(created);
    setPhase('submitted');
  }

  const option = (group, value, label) => (
    <label className="seg-option" key={value}>
      <input
        type="radio"
        name={group}
        value={value}
        checked={manual[group] === value}
        onChange={() => setManual((m) => ({ ...m, [group]: value }))}
      />
      <span>{label}</span>
    </label>
  );

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
            <p className="cam-hint">{t('report.hint')}</p>
            <button className="shutter" onClick={takePhoto}>
              {t('report.take')}
            </button>
          </>
        );
      case 'camera-error':
        return (
          <ProblemSheet prefix="cam" kind={problem}>
            <button className="btn btn-primary btn-block" onClick={retake} autoFocus>
              {t('action.tryAgain')}
            </button>
            <a className="btn btn-quiet btn-block" href="#/">
              {t('nav.home')}
            </a>
          </ProblemSheet>
        );
      case 'locating':
        return <Busy text={t('report.locating')} />;
      case 'geo-error':
        return (
          <ProblemSheet prefix="geo" kind={problem}>
            <button className="btn btn-primary btn-block" onClick={locate} autoFocus>
              {t('action.tryAgain')}
            </button>
            <button
              className="btn btn-outline btn-block"
              onClick={() => finish({ ...CONFIG.fallbackLocation, accuracy: 0, at: Date.now() }, 'demo')}
            >
              {t('report.demoLocation', { place: CONFIG.fallbackLocation.label })}
            </button>
            <button className="btn btn-quiet btn-block" onClick={retake}>
              {t('report.retake')}
            </button>
          </ProblemSheet>
        );
      case 'analyzing':
        return <Busy text={t('report.analyzing')} />;
      case 'result':
        return (
          <div className="sheet">
            <p className="source-note">{t('report.estimatedBy', { provider: analysis.provider ?? 'AI' })}</p>
            <WasteTags analysis={analysis} />
            <p className="verdict">{analysis.reasoning}</p>
            {analysis.itemsSeen.length > 0 && (
              <p className="seen">{t('report.seen', { items: analysis.itemsSeen.join(', ') })}</p>
            )}
            <Receipt type={analysis.wasteType} size={analysis.severity} />
            <Evidence capture={capture} />
            <div className="sheet-actions">
              <button className="btn btn-primary btn-block" onClick={submit} disabled={busy} autoFocus>
                {t('report.submit')}
              </button>
              <button className="btn btn-quiet btn-block" onClick={retake}>
                {t('report.retake')}
              </button>
            </div>
          </div>
        );
      case 'not-waste':
        return (
          <div className="sheet" role="alert">
            <h2 className="sheet-title">{t('report.notWaste.title')}</h2>
            <p>{analysis.reasoning}</p>
            <p className="fix">
              <strong>{t('action.whatToDo')}</strong> {t('report.notWaste.fix')}
            </p>
            <div className="sheet-actions">
              <button className="btn btn-primary btn-block" onClick={retake} autoFocus>
                {t('report.retake')}
              </button>
            </div>
          </div>
        );
      case 'ai-error':
        return (
          <div className="sheet" role="alert">
            <h2 className="sheet-title">{t('report.aiError.title')}</h2>
            <p>{problem}</p>
            <p className="fix">
              <strong>{t('action.whatToDo')}</strong> {t('report.aiError.fix')}
            </p>
            <div className="sheet-actions">
              <button className="btn btn-primary btn-block" onClick={() => analyze(captureRef.current)} autoFocus>
                {t('action.tryAgain')}
              </button>
              <button className="btn btn-outline btn-block" onClick={() => setPhase('manual')}>
                {t('report.manual')}
              </button>
            </div>
          </div>
        );
      case 'manual':
        return (
          <div className="sheet">
            <p className="source-note source-manual">{t('report.estimatedByYou')}</p>
            <fieldset className="seg">
              <legend>{t('report.mostly')}</legend>
              {option('type', 'dry', wasteLabel('dry'))}
              {option('type', 'wet', wasteLabel('wet'))}
            </fieldset>
            <fieldset className="seg">
              <legend>{t('report.howMuch')}</legend>
              {option('size', 'small', sizeLabel('small'))}
              {option('size', 'medium', sizeLabel('medium'))}
              {option('size', 'large', sizeLabel('large'))}
            </fieldset>
            <Receipt type={manual.type} size={manual.size} />
            <Evidence capture={capture} />
            <div className="sheet-actions">
              <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
                {t('report.submit')}
              </button>
              <button className="btn btn-quiet btn-block" onClick={retake}>
                {t('report.retake')}
              </button>
            </div>
          </div>
        );
      case 'submitted':
        return (
          <div className="sheet sheet-done" role="status">
            <h2 className="sheet-title">
              <ShinyText
                text={t('report.done.title')}
                color={cssVar('--ink', '#14161a')}
                shineColor={cssVar('--verified', '#24b26b')}
                speed={1.6}
                trigger="view"
              />
            </h2>
            <p className="job-id mono">{t('report.done.job', { id: job.id })}</p>
            <dl className="split">
              <div>
                <dt>{t('split.picker')}</dt>
                <dd>{rupees(job.payout.picker)}</dd>
              </div>
              <div className="split-you">
                <dt>{t('split.you')}</dt>
                <dd>{rupees(job.payout.reporter)}</dd>
              </div>
              <div>
                <dt>{t('split.fund')}</dt>
                <dd>{rupees(job.payout.fundTotal)}</dd>
              </div>
            </dl>
            <p className="fine">
              {t('report.done.note', { amount: rupees(job.payout.reporter), hours: CONFIG.holdHours })}
            </p>
            <div className="sheet-actions">
              <button className="btn btn-primary btn-block" onClick={retake} autoFocus>
                {t('report.another')}
              </button>
              <a className="btn btn-outline btn-block" href="#/reports">
                {t('report.myReports')}
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

  return (
    <div className="cam">
      <video ref={video} className="cam-feed" playsInline muted aria-label="Live camera" hidden={Boolean(frozen)} />
      {frozen && <img className="cam-frozen" src={frozen} alt="" />}
      <div className="cam-top">
        <a className="cam-close" href="#/" aria-label={t('report.close')}>
          ✕
        </a>
        <span className="step-chip">{t('report.step', { n: STEP_OF[phase] })}</span>
        {live ? (
          <span className="chip chip-live mono" role="status">
            {gps}
          </span>
        ) : (
          <span className="chip-spacer" />
        )}
      </div>
      <div className="cam-panel">{panel()}</div>
    </div>
  );
}
