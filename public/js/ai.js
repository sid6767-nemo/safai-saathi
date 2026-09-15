// Browser side of the two AI routes. The API key stays on the server (api/_lib/claude.js).

import { getState } from './store.js';

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function post(path, body) {
  if (getState().demo.aiOffline) {
    throw new AiError('offline', 'AI offline mode is switched on in Demo controls.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw err.name === 'AbortError'
      ? new AiError('timeout', 'The AI check took longer than 50 seconds.')
      : new AiError('network', "Couldn't reach the Safai Saathi server. Check the internet connection.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new AiError(data?.code ?? 'server', data?.message ?? `The server answered with an error (${res.status}).`);
  }
  return data;
}

export async function analyzePhoto(image) {
  const r = await post('/api/analyze', { image });
  return {
    isWasteSite: r.is_waste_site,
    wasteType: r.waste_type,
    severity: r.severity,
    itemsSeen: r.items_seen.slice(0, 5),
    reasoning: r.reasoning,
    source: 'ai',
  };
}

export const verifyProof = (payload) => post('/api/verify', payload);
