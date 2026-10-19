import { useSyncExternalStore } from 'react';
import { t } from '../lib/i18n.js';

// Chrome on Android offers to install the picker app; this turns that offer into one big button.
// The offer can arrive before React renders, so it is caught here when the module loads.
let offer = null;
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  offer = e;
  changed();
});
window.addEventListener('appinstalled', () => {
  offer = null;
  changed();
});

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export default function InstallBanner() {
  const current = useSyncExternalStore(subscribe, () => offer);
  if (!current) return null;

  async function install() {
    current.prompt();
    await current.userChoice;
    offer = null;
    changed();
  }

  return (
    <div className="install-banner">
      <p>{t('picker.installHelp')}</p>
      <button type="button" className="btn btn-primary" onClick={install}>
        {t('picker.install')}
      </button>
    </div>
  );
}
