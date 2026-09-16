// Small rendering helpers: an escaping html`` tag, time formatting, and the motion moments.

import { locale } from './i18n.js';

class Raw {
  constructor(s) {
    this.s = s;
  }
}

export const raw = (s) => new Raw(s);

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmt(value) {
  if (value == null || value === false) return '';
  if (value instanceof Raw) return value.s;
  if (Array.isArray(value)) return value.map(fmt).join('');
  return esc(value);
}

// Every interpolated value is escaped unless it is itself an html`` result, so AI text is safe.
export function html(strings, ...values) {
  return raw(strings.reduce((out, s, i) => out + s + (i < values.length ? fmt(values[i]) : ''), ''));
}

// Replaces `el`'s content, keeping keyboard focus on the element with the same data-key.
export function render(el, tpl) {
  const active = document.activeElement;
  const key = el.contains(active) ? active.closest('[data-key]')?.dataset.key : null;
  el.innerHTML = tpl instanceof Raw ? tpl.s : String(tpl);
  if (key) el.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

export const clock = (ts) =>
  new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(ts);

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

// The accepted row travels from its place in the list into the "In progress" slot.
export function flip(el, fromRect) {
  if (!el || !fromRect || reducedMotion()) return;
  const to = el.getBoundingClientRect();
  el.animate(
    [
      { transform: `translate(${fromRect.left - to.left}px, ${fromRect.top - to.top}px)`, opacity: 0.6 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}

// The released payout counts up once.
export function countUp(el, to, format) {
  if (!el) return;
  if (reducedMotion()) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / 900);
    el.textContent = format(Math.round(to * (1 - (1 - progress) ** 3)));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function toast(message) {
  const el = document.createElement('p');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}
