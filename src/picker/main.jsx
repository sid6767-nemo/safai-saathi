import { createRoot } from 'react-dom/client';
import { isNativeApp } from '../lib/api.js';
import { initialLanguage, loadLanguage } from '../lib/i18n.js';
import { startSync } from '../lib/sync.js';
import { initTheme } from '../lib/theme.js';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/reporter.css';
import '../styles/picker.css';
import '../styles/react.css';
import PickerApp from './PickerApp.jsx';

async function boot() {
  initTheme();
  await loadLanguage(initialLanguage());
  createRoot(document.getElementById('app')).render(<PickerApp />);
  startSync();
  // Makes the picker website installable and lets it open with a weak connection. The Android
  // app already carries its files, so it skips this.
  if (!isNativeApp && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/picker/sw.js', { scope: '/picker/' }).catch(() => {});
  }
}

boot();
