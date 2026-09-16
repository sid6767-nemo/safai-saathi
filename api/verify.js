// POST /api/verify  { before, after, code, beforeIsIllustration }
//   -> { code_read, code_matches, site_clean, same_place_likely, same_place_checked, remaining_waste,
//        reasoning, provider }
//
// The expected code is deliberately NOT given to the model: it reads whatever code it sees, and
// the server compares. That way the model can't be nudged into "seeing" the right answer.

import { z } from 'zod';
import { HttpError, askForJson, imageBlock, jsonRoute, languageInstruction } from './_lib/ai.js';

const Verification = z.object({
  code_read: z.string(),
  site_clean: z.boolean(),
  same_place_likely: z.boolean(),
  remaining_waste: z.string(),
  reasoning: z.string(),
});

const SYSTEM = `You check proof-of-cleanup photos for a municipal marketplace in India that pays waste pickers to clear reported garbage spots. Payment is released only if you confirm the work, so be strict but fair.

You get a BEFORE photo (from when the spot was reported) and an AFTER photo (taken live by the picker through the app).

code_read: the app stamps a one-time job code inside a yellow box in the top-left corner of the AFTER photo, labelled "Job code". Copy the 6 characters exactly as printed, without spaces. If there is no readable code, return an empty string.

site_clean: true only if the area that held waste in the BEFORE photo is now substantially clear in the AFTER photo. A few tiny scraps are acceptable; bags of collected waste left on the spot are not.

same_place_likely: true if the AFTER photo plausibly shows the same location as the BEFORE photo, judged by fixed features such as walls, kerbs, poles, trees, gates and buildings. Framing, lighting and angle may differ.

remaining_waste: a short phrase for any waste still visible in the AFTER photo, or an empty string if none.

reasoning: one plain sentence of at most 30 words, written for the picker, explaining your decision. Ignore the dark timestamp strip along the bottom of either photo.`;

const ILLUSTRATION_NOTE =
  'Note: the BEFORE image is a drawn illustration standing in for a sample job, not a real photo. Set same_place_likely to true and judge site_clean from the AFTER photo alone.';

export default jsonRoute(async ({ before, after, code, beforeIsIllustration, language }) => {
  if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code)) {
    throw new HttpError(400, 'bad_code', 'The job code sent for checking was malformed.');
  }

  const result = await askForJson({
    // code_read must stay exactly as printed, so the language note excludes it by naming the rest.
    system: SYSTEM + languageInstruction(language),
    schema: Verification,
    content: [
      { type: 'text', text: 'BEFORE photo:' },
      imageBlock(before),
      { type: 'text', text: 'AFTER photo (proof):' },
      imageBlock(after),
      { type: 'text', text: beforeIsIllustration ? ILLUSTRATION_NOTE : 'Check this cleanup.' },
    ],
  });

  const codeRead = result.code_read.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return {
    ...result,
    code_read: codeRead,
    code_matches: codeRead === code,
    same_place_likely: beforeIsIllustration ? true : result.same_place_likely,
    same_place_checked: !beforeIsIllustration,
  };
});
