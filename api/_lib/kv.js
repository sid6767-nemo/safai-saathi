// A tiny key-value store for the shared job list and photos.
//
// Production: Upstash Redis over its REST API. Adding "Upstash for Redis" to the Vercel project
// from the Marketplace sets KV_REST_API_URL and KV_REST_API_TOKEN.
// `npm run dev` without those keys: an in-memory store, so two browsers on one machine still share.
// Neither: `store` is null and the app stays on-device only.

import { HttpError } from './errors.js';

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Writes only if the value hasn't changed since it was read, so two devices saving at the same
// moment can't silently overwrite each other.
const COMPARE_AND_SET =
  "if (redis.call('GET', KEYS[1]) or '') == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 end return 0";

async function upstash(command) {
  let res;
  try {
    res = await fetch(REST_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(504, 'store_unreachable', "The server couldn't reach the shared job store.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) throw new HttpError(502, 'store_error', 'The shared job store returned an error.');
  return data.result;
}

const upstashStore = {
  get: (key) => upstash(['GET', key]),
  set: (key, value, ttlSeconds) =>
    upstash(ttlSeconds ? ['SET', key, value, 'EX', String(ttlSeconds)] : ['SET', key, value]),
  cas: async (key, expected, value) => (await upstash(['EVAL', COMPARE_AND_SET, '1', key, expected ?? '', value])) === 1,
};

const memory = new Map();

const memoryStore = {
  get: async (key) => memory.get(key) ?? null,
  set: async (key, value) => {
    memory.set(key, value);
  },
  cas: async (key, expected, value) => {
    if ((memory.get(key) ?? '') !== (expected ?? '')) return false;
    memory.set(key, value);
    return true;
  },
};

export const store = REST_URL && REST_TOKEN ? upstashStore : process.env.SAFAI_MEMORY_STORE ? memoryStore : null;

// The live site, preview deploys and local development share one database, so each gets its own
// key prefix: testing on a laptop never touches the real job list.
export const namespace = `safai-saathi:${process.env.VERCEL_ENV || 'dev'}`;
