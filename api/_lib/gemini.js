// Google Gemini provider (the default: it has a free tier). Plain REST, no SDK.
// Docs: https://ai.google.dev/api/generate-content

import { z } from 'zod';
import { HttpError } from './errors.js';

export const LABEL = 'Gemini';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const endpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Gemini's responseSchema takes an OpenAPI-style subset: upper-case types, and no $schema or
// additionalProperties keys. The answer is still validated against the full zod schema in ai.js.
function toGeminiSchema(node) {
  const out = {};
  if (node.type) out.type = String(node.type).toUpperCase();
  if (node.enum) out.enum = node.enum;
  if (node.properties) {
    out.properties = Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.required = node.required ?? Object.keys(node.properties);
  }
  if (node.items) out.items = toGeminiSchema(node.items);
  return out;
}

const toPart = (block) =>
  block.type === 'image' ? { inline_data: { mime_type: block.mediaType, data: block.data } } : { text: block.text };

function statusError(status, data) {
  const message = data?.error?.message ?? '';
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) {
    return new HttpError(502, 'bad_key', "The server's Gemini API key was rejected.");
  }
  if (status === 429) {
    return new HttpError(429, 'rate_limited', 'The free AI quota is used up for the moment. Wait a minute and try again.');
  }
  if (status === 404) {
    return new HttpError(502, 'upstream_error', `The AI model "${MODEL}" wasn't found. Set GEMINI_MODEL to a current model.`);
  }
  return new HttpError(502, 'upstream_error', `The AI service returned an error (${status}).`);
}

export async function askForJson({ system, content, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, 'no_key', "AI analysis isn't set up on this server: the GEMINI_API_KEY setting is missing.");

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: content.map(toPart) }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(z.toJSONSchema(schema)),
    },
  };

  let res;
  try {
    res = await fetch(endpoint(MODEL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new HttpError(504, 'upstream_unreachable', "The server couldn't reach the AI service.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw statusError(res.status, data);
  if (data?.promptFeedback?.blockReason) {
    throw new HttpError(502, 'unreadable', 'The AI declined to assess this photo.');
  }

  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, 'unreadable', "The AI couldn't give a usable answer for this photo.");
  }
}
