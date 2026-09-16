// POST /api/analyze  { image: dataURL }
//   -> { is_waste_site, waste_type, severity, items_seen, reasoning, provider }
// The AI only labels the photo. The rupee amount is computed by the fixed formula in
// public/js/payout.js, so the model never sets a price directly.

import { z } from 'zod';
import { askForJson, imageBlock, jsonRoute, languageInstruction } from './_lib/ai.js';

const Analysis = z.object({
  is_waste_site: z.boolean(),
  waste_type: z.enum(['dry', 'wet']),
  severity: z.enum(['small', 'medium', 'large']),
  items_seen: z.array(z.string()),
  reasoning: z.string(),
});

const SYSTEM = `You assess photos of litter and garbage dumps in Indian towns and cities for a municipal cleanup marketplace. Informal waste pickers are paid according to your labels, so be accurate and do not exaggerate.

The app stamps a dark strip along the bottom of every photo with a timestamp and GPS coordinates. Ignore it.

waste_type
- "dry": mainly plastic, paper, cardboard, packaging, cloth, glass, metal, rubber or construction debris.
- "wet": mainly organic waste such as food scraps, vegetable or fruit waste, flowers and leaves mixed with food, or anything rotting.
- If mixed, choose whichever makes up more of the visible volume. If it is roughly even, choose "wet", because mixed wet waste is harder to handle.

severity
- "small": a few scattered items; one person with one bag clears it in a few minutes.
- "medium": a scattered patch or a pile; several bags or 30 to 60 minutes of work.
- "large": a dump heap, an overflowing site, or an area that needs a cart or more than one person.

is_waste_site: false when the photo does not show litter or dumped waste (for example a face, a clean street, an indoor room, or a screen). When false, still fill the other fields with "dry" and "small".

items_seen: up to 5 short, lowercase noun phrases for what is visible.

reasoning: one plain sentence of at most 25 words, written for the citizen who took the photo, explaining the type and size you chose.`;

export default jsonRoute(async ({ image, language }) =>
  askForJson({
    system: SYSTEM + languageInstruction(language),
    schema: Analysis,
    content: [imageBlock(image), { type: 'text', text: 'Label this reported spot.' }],
  }),
);
