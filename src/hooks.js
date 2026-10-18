import { useEffect, useState, useSyncExternalStore } from 'react';
import { language, onLanguageChange } from './lib/i18n.js';
import { getState, subscribe } from './lib/store.js';
import { onThemeChange, theme } from './lib/theme.js';

// The store replaces its state object on every change, so it can be read directly as a snapshot.
export const useStore = () => useSyncExternalStore(subscribe, getState);
export const useLanguage = () => useSyncExternalStore(onLanguageChange, language);
export const useTheme = () => useSyncExternalStore(onThemeChange, theme);

// Re-renders every `ms`, for countdowns and the job-code timer.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const readHash = () => location.hash.replace(/^#/, '') || '/';

export function useHashPath() {
  const [path, setPath] = useState(readHash);
  useEffect(() => {
    const onChange = () => setPath(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function useTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
