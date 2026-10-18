import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// public/ holds the static assets (favicon, sample photos); the app itself is src/.
// The api/ folder is not part of the bundle: Vercel runs it as serverless functions, and
// scripts/dev-server.mjs runs the same handlers locally.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
});
