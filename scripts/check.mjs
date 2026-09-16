// Two guards, run with `npm run check`:
//   1. the anti-fraud rule: no photo may ever come from the gallery or a file;
//   2. every language file carries the same keys, with the same placeholders, as English.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN = [
  [/type\s*=\s*["']?file/i, 'file input'],
  [/showOpenFilePicker/, 'File System Access picker'],
  [/dataTransfer\s*\.\s*files/, 'drag-and-drop file read'],
  [/\bcapture\s*=\s*["']?(user|environment)/i, 'capture-attribute input (can fall back to gallery)'],
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(html|js|css)$/.test(entry.name)) yield path;
  }
}

let problems = 0;
for await (const file of walk(join(root, 'public'))) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const [pattern, label] of FORBIDDEN) {
      if (pattern.test(line)) {
        problems++;
        console.error(`${relative(root, file)}:${i + 1}  ${label}`);
      }
    }
  });
}

if (problems) {
  console.error(`\n${problems} way(s) to submit a non-live photo found.`);
  process.exit(1);
}
console.log('OK: photos can only come from the live camera.');

// Language files: same keys, same placeholders.
const load = async (code) =>
  (await import(pathToFileURL(join(root, 'public/js/i18n', `${code}.js`)).href)).strings;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const en = await load('en');
let langProblems = 0;
for (const code of ['hi', 'ta', 'kn']) {
  const strings = await load(code);
  for (const key of Object.keys(en)) {
    if (!(key in strings)) {
      console.error(`${code}.js  missing key: ${key}`);
      langProblems++;
    } else if (placeholders(en[key]) !== placeholders(strings[key])) {
      console.error(`${code}.js  placeholders differ: ${key}`);
      langProblems++;
    }
  }
  for (const key of Object.keys(strings)) {
    if (!(key in en)) {
      console.error(`${code}.js  key not in en.js: ${key}`);
      langProblems++;
    }
  }
}

if (langProblems) {
  console.error(`\n${langProblems} translation problem(s).`);
  process.exit(1);
}
console.log(`OK: hi, ta and kn match en.js (${Object.keys(en).length} keys each).`);
