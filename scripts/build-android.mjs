// Builds the two Android apps' screens and copies them into their Android projects.
//
//   npm run android              both apps
//   npm run android -- picker    one app
//
// Each app gets its own copy of the React build with VITE_API_ORIGIN pointing at the live site,
// so both apps (and the website) read and write the same shared job list. Set SAFAI_API_ORIGIN
// to point them somewhere else, e.g. a Vercel preview.

import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.env.SAFAI_API_ORIGIN || 'https://safai-saathi-mu.vercel.app';

const APPS = {
  reporter: { page: 'index.html' },
  picker: { page: 'picker/index.html' },
};

const wanted = process.argv.slice(2).filter((a) => a in APPS);
for (const name of wanted.length ? wanted : Object.keys(APPS)) {
  const project = join(root, 'native', name);
  const www = join(project, 'www');
  console.log(`\n▸ ${name}: building against ${origin}`);
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_ORIGIN': JSON.stringify(origin),
      'import.meta.env.VITE_NATIVE': JSON.stringify('1'),
    },
    build: { outDir: www, emptyOutDir: true, rollupOptions: { input: join(root, APPS[name].page) } },
  });
  // The app opens www/index.html. The picker page is built at www/picker/index.html, so move it up;
  // its asset paths are absolute (/assets/...), so they still resolve.
  if (name === 'picker') await rename(join(www, 'picker', 'index.html'), join(www, 'index.html'));
  else await rm(join(www, 'picker'), { recursive: true, force: true });

  // Without viewport-fit=cover, Android keeps the screens between the status bar and the gesture
  // bar on every WebView version, and paints those bars in the app's colour (styles.xml).
  const page = join(www, 'index.html');
  await writeFile(page, (await readFile(page, 'utf8')).replace(', viewport-fit=cover', ''));

  execFileSync(join(root, 'node_modules', '.bin', 'cap'), ['sync', 'android'], { cwd: project, stdio: 'inherit' });
}
