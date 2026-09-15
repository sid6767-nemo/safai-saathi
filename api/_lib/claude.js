// Anthropic Claude provider (paid). Used when ANTHROPIC_API_KEY is set and no Gemini key is,
// or when AI_PROVIDER=claude.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { HttpError } from './errors.js';

export const LABEL = 'Claude';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

let client;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, 'no_key', "AI analysis isn't set up on this server: the ANTHROPIC_API_KEY setting is missing.");
  }
  client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

const toBlock = (block) =>
  block.type === 'image'
    ? { type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.data } }
    : block;

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
  return err;
}

export async function askForJson({ system, content, schema }) {
  let response;
  try {
    response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: content.map(toBlock) }],
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
