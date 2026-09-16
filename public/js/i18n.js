// Language handling: the chosen language is remembered, its strings are loaded on demand, and
// t() fills in placeholders. English is the fallback for anything a translation is missing.

import { strings as en } from './i18n/en.js';

// `english` is the name sent to the AI, so it answers in the language on screen.
export const LANGUAGES = [
  { code: 'en', label: 'English', script: 'latin', english: 'English' },
  { code: 'hi', label: 'हिंदी', script: 'deva', english: 'Hindi' },
  { code: 'ta', label: 'தமிழ்', script: 'taml', english: 'Tamil' },
  { code: 'kn', label: 'ಕನ್ನಡ', script: 'knda', english: 'Kannada' },
];

const KEY = 'safai-saathi:lang';
const listeners = new Set();
let strings = en;
let current = 'en';

export const language = () => current;
export const languageInfo = () => LANGUAGES.find((l) => l.code === current);

export function initialLanguage() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    // Storage blocked: fall through to the browser's language.
  }
  const fromBrowser = navigator.language?.slice(0, 2);
  return LANGUAGES.some((l) => l.code === fromBrowser) ? fromBrowser : 'en';
}

export async function loadLanguage(code) {
  const info = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
  strings = info.code === 'en' ? en : (await import(`./i18n/${info.code}.js`)).strings;
  current = info.code;
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Not remembering the choice is survivable.
  }
  document.documentElement.lang = current;
  document.documentElement.dataset.script = info.script;
  for (const fn of [...listeners]) fn(current);
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const fill = (template, vars) =>
  vars ? template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? vars[name] : `{${name}}`)) : template;

export function t(key, vars) {
  return fill(strings[key] ?? en[key] ?? key, vars);
}

// Sample jobs carry a translation key; real reports carry whatever the AI wrote.
export const jobReasoning = (job) =>
  job.analysis.reasoningKey ? t(job.analysis.reasoningKey) : job.analysis.reasoning;

// Counted strings use `<key>.one` and `<key>.other`, which covers all four languages here.
export function tn(key, count, vars) {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...vars });
}

// Latin digits everywhere: rupee amounts stay readable in every script.
export const locale = () => `${current}-IN-u-nu-latn`;
