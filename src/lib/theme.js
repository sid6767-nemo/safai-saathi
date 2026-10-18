// Light or dark, remembered per browser. With no choice saved, the phone's own setting decides.

const KEY = 'safai-saathi:theme';
const listeners = new Set();
let current = 'light';

const systemPrefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

function apply(theme) {
  current = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#050607' : '#14161a');
  for (const fn of [...listeners]) fn(theme);
}

export const theme = () => current;

export function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: follow the system setting for this visit.
  }
  apply(saved === 'dark' || saved === 'light' ? saved : systemPrefersDark() ? 'dark' : 'light');

  // Follow the system if the user hasn't picked a side themselves.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let chosen = null;
    try {
      chosen = localStorage.getItem(KEY);
    } catch {
      /* ignore */
    }
    if (!chosen) apply(e.matches ? 'dark' : 'light');
  });
}

export function toggleTheme() {
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not remembering the choice is survivable.
  }
  apply(next);
  return next;
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
