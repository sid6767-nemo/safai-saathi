// Time formatting and the reduced-motion check, shared by the screens.

import { locale } from './i18n.js';

export const clock = (ts) =>
  new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(ts);

// The evidence stamp stays in English so a photo reads the same to anyone checking it.
export const stamp = (ts) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(ts);

// Relative times use the browser's own wording for the current language.
export function timeAgo(ts) {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const minutes = Math.round((ts - Date.now()) / 60_000);
  if (minutes > -1) return rtf.format(0, 'minute');
  if (minutes > -60) return rtf.format(minutes, 'minute');
  return rtf.format(Math.round(minutes / 60), 'hour');
}

export function countdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const pause = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
