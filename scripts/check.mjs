// Guard for the anti-fraud rule: no photo may ever come from the gallery or a file.
// Fails if anything in public/ offers a file picker, drag-and-drop, or a capture-attribute input.
// Usage: npm run check

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
