// One short status message at a time, shown by components/Toaster.jsx.

const listeners = new Set();
let current = null;
let timer;

export function toast(message) {
  current = { id: Date.now() + Math.random(), message };
  for (const fn of listeners) fn();
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    for (const fn of listeners) fn();
  }, 3500);
}

export function onToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const currentToast = () => current;
