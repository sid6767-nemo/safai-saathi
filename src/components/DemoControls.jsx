import { useEffect, useRef } from 'react';
import { useStore } from '../hooks.js';
import { CONFIG } from '../lib/config.js';
import { t } from '../lib/i18n.js';
import { expireCodes, resetAll, setDemo, skipHolds } from '../lib/store.js';
import { toast } from '../lib/toast.js';

// Staged conditions so judges can trigger the fraud checks from a laptop that can't walk 150 m.
// Opened from the home footer, the dashboard gear, or Shift+D.
const SWITCHES = [
  ['spoofLocation', () => t('demo.spoof', { m: CONFIG.demo.spoofDistanceM })],
  ['clockSkew', () => t('demo.clock', { hours: CONFIG.demo.clockSkewMin / 60 })],
  ['aiOffline', () => t('demo.ai')],
];

export default function DemoControls({ open, onClose }) {
  const dialog = useRef(null);
  const { demo } = useStore();

  useEffect(() => {
    const d = dialog.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function reset() {
    if (!confirm(t('demo.resetConfirm'))) return;
    await resetAll();
    dialog.current.close();
    location.hash = '#/';
  }

  return (
    <dialog ref={dialog} className="demo" aria-labelledby="demo-title" onClose={onClose}>
      <form method="dialog" className="demo-inner">
        <h2 id="demo-title">{t('demo.title')}</h2>
        <p className="demo-lede">{t('demo.lede')}</p>
        <fieldset className="demo-group">
          <legend>{t('demo.group')}</legend>
          {SWITCHES.map(([name, label]) => (
            <label className="switch" key={name}>
              <input
                type="checkbox"
                checked={Boolean(demo[name])}
                onChange={(e) => setDemo({ [name]: e.target.checked })}
              />
              <span>{label()}</span>
            </label>
          ))}
        </fieldset>
        <div className="demo-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              expireCodes();
              toast(t('demo.expired'));
            }}
          >
            {t('demo.expire')}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              skipHolds();
              toast(t('demo.skipped'));
            }}
          >
            {t('demo.skip', { hours: CONFIG.holdHours })}
          </button>
          <button type="button" className="btn btn-danger" onClick={reset}>
            {t('demo.reset')}
          </button>
        </div>
        <button className="btn btn-primary btn-block" value="close">
          {t('demo.close')}
        </button>
      </form>
    </dialog>
  );
}
