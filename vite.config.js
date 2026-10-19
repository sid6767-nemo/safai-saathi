import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Two pages: the reporters' website (index.html) and the picker app (picker/index.html).
// public/ holds static files, including the picker app's manifest, service worker and icons.
// The api/ folder is not part of the bundle: Vercel runs it as serverless functions, and
// scripts/dev-server.mjs runs the same handlers locally.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: { input: { main: 'index.html', picker: 'picker/index.html' } },
  },
});
