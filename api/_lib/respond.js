import { HttpError } from './errors.js';

// Turns a thrown error into the JSON shape the app shows: a status, a code and a readable message.
export function sendError(res, err) {
  if (!(err instanceof HttpError)) console.error(err);
  const e = err instanceof HttpError ? err : new HttpError(500, 'server_error', 'Something went wrong on the server.');
  res.status(e.status).json({ code: e.code, message: e.message });
}
