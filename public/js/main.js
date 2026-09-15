import { initDemoControls } from './demo.js';
import { releaseDue } from './store.js';
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

window.addEventListener('hashchange', route);
initDemoControls();
route();

// Releases payouts whose hold window has ended.
setInterval(releaseDue, 1000);
