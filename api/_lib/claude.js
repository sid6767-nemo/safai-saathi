// Shared plumbing for the two AI routes: the Anthropic client, image blocks, JSON output,
// and error messages specific enough to show a user during a live demo.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let client;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, 'no_key', "AI analysis isn't set up on this server: the ANTHROPIC_API_KEY setting is missing.");
  }
  client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

export function imageBlock(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? '');
  if (!match) throw new HttpError(400, 'bad_image', 'The photo was missing or was not a JPEG, PNG or WebP image.');
  if (match[2].length > 5_000_000) throw new HttpError(413, 'image_too_large', 'The photo is too large to analyse.');
  return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
}

// One vision call that must come back as JSON matching `schema`.
export async function askForJson({ system, content, schema }) {
  let response;
  try {
    response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(schema) },
    });
  } catch (err) {
    throw toHttpError(err);
  }
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new HttpError(502, 'unreadable', "The AI couldn't give a usable answer for this photo.");
  }
  return response.parsed_output;
}

function toHttpError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new HttpError(502, 'bad_key', "The server's Anthropic API key was rejected.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, 'rate_limited', 'The AI service is busy. Wait a few seconds and try again.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new HttpError(504, 'upstream_unreachable', "The server couldn't reach the AI service.");
  }
  if (err instanceof Anthropic.APIError) {
    return new HttpError(502, 'upstream_error', `The AI service returned an error (${err.status ?? 'no status'}).`);
  }
  return new HttpError(500, 'server_error', 'Something went wrong on the server.');
}

// Wraps a route body as a Vercel Node handler: POST only, JSON in, JSON out.
export function jsonRoute(run) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ code: 'method', message: 'Use POST.' });
    try {
      res.status(200).json(await run(req.body ?? {}));
    } catch (err) {
      const httpErr = toHttpError(err);
      if (!(err instanceof HttpError)) console.error(err);
      res.status(httpErr.status).json({ code: httpErr.code, message: httpErr.message });
    }
  };
}
