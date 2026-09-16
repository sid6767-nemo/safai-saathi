// Shared plumbing for the AI routes: picks a vision provider, builds image blocks, validates the
// JSON answer, and turns failures into messages specific enough to show during a live demo.
//
// Provider choice: AI_PROVIDER=gemini|claude if set; otherwise Gemini when GEMINI_API_KEY is set
// (free tier), otherwise Claude when ANTHROPIC_API_KEY is set.

import * as claude from './claude.js';
import { HttpError } from './errors.js';
import * as gemini from './gemini.js';

export { HttpError };

const PROVIDERS = { gemini, claude };

function pickProvider() {
  const forced = PROVIDERS[process.env.AI_PROVIDER?.toLowerCase()];
  if (forced) return forced;
  if (process.env.GEMINI_API_KEY) return gemini;
  if (process.env.ANTHROPIC_API_KEY) return claude;
  throw new HttpError(
    503,
    'no_key',
    "AI analysis isn't set up on this server: add a GEMINI_API_KEY (free) or ANTHROPIC_API_KEY setting.",
  );
}

// The app shows the model's one-line reasoning to the user, so it should be in their language.
const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Kannada'];

export function languageInstruction(language) {
  return LANGUAGES.includes(language) && language !== 'English'
    ? `\n\nWrite every text field you return (reasoning, and any description of what you see) in ${language}, in that language's own script. Keep the field names and the fixed label values in English.`
    : '';
}

// A provider-neutral image block; each provider converts it to its own format.
export function imageBlock(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? '');
  if (!match) throw new HttpError(400, 'bad_image', 'The photo was missing or was not a JPEG, PNG or WebP image.');
  if (match[2].length > 5_000_000) throw new HttpError(413, 'image_too_large', 'The photo is too large to analyse.');
  return { type: 'image', mediaType: match[1], data: match[2] };
}

// One vision call whose answer must match the zod `schema`. Adds which provider answered.
export async function askForJson({ system, content, schema }) {
  const provider = pickProvider();
  const answer = schema.safeParse(await provider.askForJson({ system, content, schema }));
  if (!answer.success) {
    throw new HttpError(502, 'unreadable', "The AI's answer wasn't in the expected format. Try again.");
  }
  return { ...answer.data, provider: provider.LABEL };
}

// Wraps a route body as a Vercel Node handler: POST only, JSON in, JSON out.
export function jsonRoute(run) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ code: 'method', message: 'Use POST.' });
    try {
      res.status(200).json(await run(req.body ?? {}));
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      const e = err instanceof HttpError ? err : new HttpError(500, 'server_error', 'Something went wrong on the server.');
      res.status(e.status).json({ code: e.code, message: e.message });
    }
  };
}
