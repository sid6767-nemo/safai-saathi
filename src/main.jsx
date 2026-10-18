import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initialLanguage, loadLanguage } from './lib/i18n.js';
import { initTheme } from './lib/theme.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/reporter.css';
import './styles/picker.css';
import './styles/react.css';

async function boot() {
  // Theme and language are applied before the first render, so nothing flashes.
  initTheme();
  await loadLanguage(initialLanguage());
  createRoot(document.getElementById('app')).render(<App />);
}

boot();
