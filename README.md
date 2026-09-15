# Safai Saathi <sub>सफ़ाई साथी</sub>

**Photograph a garbage spot. A local waste picker gets paid to clear it.**

Safai Saathi ("cleanliness companion") is an Uber-style marketplace prototype. Citizens report litter
and dumps with a live photo. An AI vision model sorts the waste and sizes the job, and nearby informal
waste pickers see it on a job board with the payout up front. Payment is released (in this prototype,
simulated) only after a live, code-stamped, GPS-checked proof photo passes verification.

> **This is a prototype built for a school STEM competition pitch, not a production system.**
> The camera, GPS, AI analysis and fraud checks really run. The pickers, notifications and payments
> are simulated. The table below marks the line exactly.

**Live demo:** https://safai-saathi-mu.vercel.app
Works best on a phone, or a laptop browser narrowed to phone width. The camera needs HTTPS, which the live link has.

---

## The flow

1. **Report.** Tap *Report waste*. The camera opens straight away (there is no upload option). Take
   the photo; the phone's GPS is read at the same moment and stamped into the picture.
2. **AI analysis.** The photo goes to a vision model (Google Gemini `gemini-3.8-flash` on its free
   tier by default, or Claude `claude-sonnet-4-6`; see [Choosing the AI](#choosing-the-ai)), which
   returns structured JSON: dry or wet, small/medium/large, what it sees, and one sentence of
   reasoning. A fixed formula turns those labels into a payout.
3. **Notify.** *Report this spot* posts the job. Every simulated picker within 2 km can see it.
4. **Accept.** On the picker dashboard, open jobs are sorted by distance from the selected picker.
   *Accept job* moves it to *In progress* and removes it from every other picker's list.
5. **Proof.** *Mark as cleaned* opens the live camera with a one-time job code on screen. The photo
   is stamped with that code, the time and the GPS position, then checked (see below).
6. **Payout.** If every check passes, the payout is held for 24 hours, during which the reporter can
   flag the spot as still dirty. Then it's released: the picker gets the payout and the reporter gets
   a 1/20 reward on top, both from the ward cleanup fund.

## What's real and what's simulated

| Real in this prototype | Simulated |
|---|---|
| Live camera capture through `getUserMedia`; no file or gallery input exists anywhere (`npm run check` fails the build if one appears) | The 9 waste pickers: fixed positions placed around the first location the app reads |
| GPS through the Geolocation API, read at the moment of capture | Notifications: "sent to N pickers" is a distance count, not a push message or SMS |
| AI vision analysis of the report photo (Gemini or Claude), returned as schema-checked JSON | Payments: no money moves; "ward cleanup fund" is a label |
| Payout formula (rule-based, documented below) | The 24-hour hold: a real timer, but it can be skipped in Demo controls |
| One-time job code, burned into the proof photo's pixels | Ward officer review after a flag or an AI outage |
| Time, code-expiry and 30 m distance checks on the proof photo | Accounts: there's no login; "Working as" switches between the simulated pickers |
| AI before/after comparison: reads the code, checks the spot is clear and that it's the same place | Storage: everything lives in this browser (localStorage + IndexedDB), no server database |
| | Three sample jobs (tagged "Sample") with drawn placeholder photos |
| | The job code is generated in the browser; production would issue it from the server |

## How a cleanup is verified

The proof step is where fraud would happen, so it has the most checks. In order:

| # | Check | Where | Rejects when |
|---|---|---|---|
| 1 | Taken after accepting | Device | The photo's timestamp is before the job's *Accept* time |
| 2 | Job code still valid | Device | The code is more than 10 minutes old, so a photo can't be prepared in advance |
| 3 | At the spot | Device | GPS puts the photo more than 30 m from the report (haversine distance) |
| 4 | Code readable | AI | The code read from the photo doesn't match. The expected code is never sent to the model: it reads what it sees and the server compares |
| 5 | Spot is cleared | AI | Waste is still visible where the before photo showed it |
| 6 | Same place | AI | Walls, kerbs, poles and buildings don't match the report photo |

The code is shown on the live viewfinder and burned into the photo along with the time and GPS,
so an AI-edited or pre-made "after" picture has no valid code, and there's no way to submit one
anyway: the only photo source is the live camera. Checks 1 to 3 run first and instantly; the AI is
only called once they pass.

Every rejection names the check, the measured value and the next step, for example:

> **Too far from the reported spot.** This photo was taken 152 m from where the waste was reported
> (GPS accuracy ±12 m). Proof photos must be taken within 30 m of the spot.
> **What to do:** Walk back to the spot and take the proof photo again.

If the AI can't be reached, the job goes to *Held for manual review*. It is never approved without
the AI checks.

## How the payout is calculated

```
picker payout   = base rate × size multiplier, rounded to the nearest ₹5
reporter reward = picker payout ÷ 20   (paid by the fund on top, not taken from the picker)
```

| | Small ×1 | Medium ×2.5 | Large ×5 |
|---|---|---|---|
| **Dry waste** (₹120 base) | ₹120 | ₹300 | ₹600 |
| **Wet waste** (₹200 base) | ₹200 | ₹500 | ₹1,000 |

Wet waste pays more because it's heavier, smells, and has to reach a compost or biogas site the same
day. The rates are illustrative, not official ward rates, and live in
[`public/js/config.js`](public/js/config.js). The AI only supplies the two labels; it never sets a price.

## Choosing the AI

Both providers get the same prompts and must return JSON matching the same schema, which the server
checks before the app uses it. The report screen says which one answered.

| | Google Gemini (default) | Anthropic Claude |
|---|---|---|
| Cost | Free tier (rate-limited) | Paid per use, about ₹2 per full report-to-payout cycle |
| Key | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | [console.anthropic.com](https://console.anthropic.com) |
| Setting | `GEMINI_API_KEY` (model: `GEMINI_MODEL`, default `gemini-3.8-flash`) | `ANTHROPIC_API_KEY` (model: `CLAUDE_MODEL`, default `claude-sonnet-4-6`) |

If both keys are set, Gemini is used unless `AI_PROVIDER=claude`. Both services require the account
holder to be 18 or older. On Gemini's free tier Google may use submitted photos to improve its
products, and human reviewers may see them, so keep people's faces and anything private out of
demo photos.

## Demo controls

Open with the gear on the picker dashboard, the link on the home screen, or **Shift+D**. A red strip
appears on screen whenever one of these is on, so a recording never passes one off as real.

- **Pretend I'm 150 m from the spot**: shifts the proof photo's GPS, to trigger the distance rejection.
- **Pretend my clock is 1 hour behind**: back-dates the proof photo, to trigger the timestamp rejection.
- **AI offline mode**: makes AI calls fail, to show the manual-estimate and manual-review paths.
- **Expire job codes now**: to trigger the expired-code rejection.
- **Skip the 24-hour hold**: releases verified payouts immediately.
- **Reset demo data**: erases everything stored in this browser.

The "spot is still dirty" rejection needs no control: take the proof photo without cleaning up.

## Run it locally

Needs Node 20.12 or newer and a free [Gemini API key](https://aistudio.google.com/apikey)
(or an Anthropic key).

```bash
npm install
cp .env.example .env        # then paste your key after GEMINI_API_KEY=
npm run dev                 # http://localhost:4173
```

Browsers allow the camera and GPS on `localhost`. On a phone you need HTTPS, so use the deployed version.

## Deploy

The repo is ready for [Vercel](https://vercel.com): static files in `public/`, two serverless
functions in `api/`, no build step.

```bash
vercel deploy --prod
vercel env add GEMINI_API_KEY production   # then redeploy
```

The key stays on the server; the browser only ever talks to `/api/analyze` and `/api/verify`.

## Design

The two flows are meant to feel like two different products for two different people.

- **Reporter**: a citizen with 30 seconds on a street corner. The camera *is* the app: full-bleed
  viewfinder, one fat yellow shutter bar in the thumb zone, then a receipt-style sheet over the photo.
- **Picker**: someone working a shift. A dark console with today's earnings in big numerals, the job
  in hand pinned below, and open jobs as dense rows ranked by distance. No map: on foot, "how far"
  and "how much" decide it.

Colours come from Indian street infrastructure rather than eco branding: asphalt `#15171A`, kerb
concrete `#E4E6E1`, auto-rickshaw yellow `#FFC20E`, and the Swachh Bharat segregation-bin colours,
dry blue `#1E5BC6` and wet green `#1B7A43` (the only green in the app, so it always means wet
waste), plus signal red `#D12A25` for rejections. Type: [Anek](https://fonts.google.com/specimen/Anek+Latin)
and [Mukta](https://fonts.google.com/specimen/Mukta) from the Indian foundry Ek Type, with IBM Plex
Mono for evidence (codes, coordinates, timestamps). Motion is used only to confirm something
happened: a job accepted, a check passing, a payout released. All of it switches off under
`prefers-reduced-motion`.

## Swapping the sample jobs for real ones

The three sample jobs are defined in [`public/js/seed.js`](public/js/seed.js). To use real photos:
put JPEGs in `public/assets/samples/`, point each job's `photo` at them, set `illustration: false`
(so the same-place check runs), and update the labels to match the photos. Sample jobs sit hundreds
of metres from the anchor point, so their proof photos fail the 30 m check unless you are really there.

## Project structure

```
api/
  _lib/ai.js          picks the provider, image blocks, answer validation, error messages
  _lib/gemini.js      Google Gemini provider (REST, free tier)
  _lib/claude.js      Anthropic Claude provider (SDK)
  analyze.js          POST /api/analyze: report photo -> type, size, reasoning
  verify.js           POST /api/verify: before + after -> code read, cleared, same place
public/
  index.html
  css/                tokens, base, reporter side, picker side
  js/
    config.js         every tunable number (rates, radii, TTLs, hold window)
    store.js          job state machine, persistence, cross-tab sync
    camera.js         live capture and the evidence stamp
    geo.js            GPS reads and distance maths
    verify.js         the six proof checks and their rejection copy
    payout.js         the payout formula
    pickers.js        simulated picker roster
    seed.js           sample jobs
    demo.js           demo controls
    views/            home, report, reports, picker, proof, job
scripts/
  dev-server.mjs      zero-dependency local server that runs the api/ handlers
  check.mjs           fails if any file or gallery input appears in public/
```

## Known limits

- **Laptop GPS is coarse.** Laptops locate by Wi-Fi, often to ±30 to 100 m. Two readings on the same
  laptop usually match, so the honest path passes, but a phone outdoors is far more reliable.
- **Device clocks can be changed.** Production would stamp time and issue codes on the server.
- **One browser, one set of data.** Two tabs stay in sync (try a reporter tab and a picker tab side
  by side), but two devices don't share jobs without a backend.
- **The AI can be wrong.** That's why there's a hold window, a reporter flag and a human review path.

## License

MIT. See [LICENSE](LICENSE).
