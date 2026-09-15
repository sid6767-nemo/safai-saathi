// Zero-dependency local server: serves public/ and runs the same api/*.js handlers Vercel runs.
// Usage: npm run dev   (reads ANTHROPIC_API_KEY from .env if present)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const PORT = Number(process.env.PORT) || 4173;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // No .env: the API routes answer with a clear "no API key" error instead.
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Mimics the helpers Vercel's Node runtime adds: req.body, res.status(), res.json().
async function handleApi(pathname, req, res) {
  const name = pathname.slice('/api/'.length);
  if (!/^[a-z-]+$/.test(name)) return sendText(res, 404, 'Not found');

  let handler;
  try {
    ({ default: handler } = await import(pathToFileURL(join(root, 'api', `${name}.js`)).href));
  } catch {
    return sendText(res, 404, 'Not found');
  }

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };

  try {
    const raw = await readBody(req);
    req.body = raw ? JSON.parse(raw) : {};
  } catch (err) {
    return res.status(err.status ?? 400).json({ code: 'bad_request', message: 'The request body was not valid JSON.' });
  }
  await handler(req, res);
}

async function serveStatic(pathname, res) {
  let rel = normalize(decodeURIComponent(pathname));
  if (rel.endsWith(sep) || rel.endsWith('/')) rel = join(rel, 'index.html');
  const file = join(publicDir, rel);
  if (!file.startsWith(publicDir + sep)) return sendText(res, 403, 'Forbidden');
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname.startsWith('/api/')) await handleApi(pathname, req, res);
      else await serveStatic(pathname, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) sendText(res, 500, 'Internal error');
    }
  })
  .listen(PORT, () => {
    console.log(`Safai Saathi running at http://localhost:${PORT}`);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('No ANTHROPIC_API_KEY found: AI analysis will report that it is not configured.');
    }
  });
