import { initDemoControls, redrawDemoControls } from './demo.js';
import { LANGUAGES, initialLanguage, loadLanguage } from './i18n.js';
import { releaseDue } from './store.js';
import { initTheme, toggleTheme } from './theme.js';
import * as home from './views/home.js';
import * as job from './views/job.js';
import * as picker from './views/picker.js';
import * as proof from './views/proof.js';
import * as report from './views/report.js';
import * as reports from './views/reports.js';

const ROUTES = [
  [/^\/?$/, home],
  [/^\/report$/, report],
  [/^\/reports$/, reports],
  [/^\/picker$/, picker],
  [/^\/proof\/([\w-]+)$/, proof],
  [/^\/job\/([\w-]+)$/, job],
];

let root = document.getElementById('app');
let cleanup = null;

function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  cleanup?.();
  cleanup = null;
  // A fresh element per screen, so event listeners from the previous view can't linger.
  const fresh = root.cloneNode(false);
  fresh.className = 'app';
  root.replaceWith(fresh);
  root = fresh;
  for (const [pattern, view] of ROUTES) {
    const match = pattern.exec(path);
    if (match) {
      cleanup = view.mount(root, ...match.slice(1)) ?? null;
      window.scrollTo(0, 0);
      return;
    }
  }
  location.replace('#/');
}

// Any language menu, on any screen, switches the whole app and redraws it.
document.addEventListener('change', (e) => {
  const select = e.target.closest('[data-lang]');
  if (select && LANGUAGES.some((l) => l.code === select.value)) {
    loadLanguage(select.value).then(() => {
      redrawDemoControls();
      route();
    });
  }
});

// Light/dark toggle: the palette is CSS, but the button's own label has to be redrawn.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="theme"]')) {
    toggleTheme();
    route();
  }
});

window.addEventListener('hashchange', route);

initTheme();
await loadLanguage(initialLanguage());
initDemoControls();
route();

// Releases payouts whose hold window has ended.
setInterval(releaseDue, 1000);
