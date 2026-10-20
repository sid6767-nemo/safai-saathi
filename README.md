# Safai Saathi <sub>सफ़ाई साथी</sub>

**Photograph a garbage spot. A local waste picker gets paid to clear it.**

Safai Saathi ("cleanliness companion") is an Uber-style marketplace prototype. Citizens report litter
and dumps with a live photo in the reporter app (or on the website). An AI vision model sorts the waste
and sizes the job, and informal waste pickers see it in their own Android app, on a job board with the
payout up front. Reporters aren't paid: a garbage spot is already a nuisance to them. Payment is released (in this prototype,
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
3. **Notify.** *Report this spot* posts the job to the shared list. Every picker app shows it within seconds.
4. **Accept.** In the picker app, open jobs are sorted by distance from the picker's phone and shown
   as a ring of photos (three or more jobs) or a list.
   *Accept job* moves it to *In progress*, shows a map of the spot with the 30 m proof circle drawn
   on it, and removes the job from every other picker's list. A picker who can't get there can
   *Give up this job* and it returns to the queue; a reporter can *Withdraw this report* while
   nobody has accepted it.
5. **Proof.** *Mark as cleaned* opens the live camera with a one-time job code on screen. The photo
   is stamped with that code, the time and the GPS position, then checked (see below).
6. **Payout.** If every check passes, the payout is held for 24 hours, during which the reporter can
   flag the spot as still dirty. Then it's released to the picker from the ward cleanup fund.
   Reporters get no reward: the bet is that people will photograph a spot that bothers them anyway.

## What's real and what's simulated

| Real in this prototype | Simulated |
|---|---|
| Four languages with a live switcher; the AI replies in the chosen one | The Hindi, Tamil and Kannada wording is machine-translated and unchecked |
| Live camera capture through `getUserMedia`; no file or gallery input exists anywhere (`npm run check` fails the build if one appears) | Picker identity: a name typed once on the phone, with no accounts or verification yet |
| GPS through the Geolocation API, read at the moment of capture | Notifications: pickers see new jobs while the app is open; there are no push messages or SMS yet |
| AI vision analysis of the report photo (Gemini or Claude), returned as schema-checked JSON | Payments: no money moves; "ward cleanup fund" is a label |
| Payout formula (rule-based, documented below) | The 24-hour hold: a real timer, but it can be skipped in Demo controls |
| One-time job code, burned into the proof photo's pixels | Ward officer review after a flag or an AI outage |
| Time, code-expiry and 30 m distance checks on the proof photo | Access: the picker app is a separate address, not locked to pickers yet |
| AI before/after comparison: reads the code, checks the spot is clear and that it's the same place | Storage: a shared job list in Upstash Redis once connected (see below), otherwise this browser only; no accounts, so anyone with the link can add jobs |
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
picker payout = base rate × size multiplier, rounded to the nearest ₹5
```

| | Small ×1 | Medium ×2.5 | Large ×5 |
|---|---|---|---|
| **Dry waste** (₹120 base) | ₹120 | ₹300 | ₹600 |
| **Wet waste** (₹200 base) | ₹200 | ₹500 | ₹1,000 |

Wet waste pays more because it's heavier, smells, and has to reach a compost or biogas site the same
day. The rates are illustrative, not official ward rates, and live in
[`src/lib/config.js`](src/lib/config.js). The AI only supplies the two labels; it never sets a price.

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

## Two Android apps, one job list

| | Who | Android app | Also on the web | What it does |
|---|---|---|---|---|
| **Reporter app** | People reporting garbage | `in.safaisaathi.reporter` ("Safai Saathi") | `/` | Report a spot, see what happened to your reports, flag a bad cleanup |
| **Picker app** | Waste pickers | `in.safaisaathi.picker` ("Safai Picker") | `/picker/` | See jobs nearby, accept one, take the proof photo, see earnings |

Both apps, and both web addresses, read and write the same job list on the server
(`https://safai-saathi-mu.vercel.app/api/state`), so a spot reported in one shows up in the other
within seconds, and the reporter sees the picker's name once it's accepted.

The Android apps are built with [Capacitor](https://capacitorjs.com): each is a native Android
project (`native/reporter/android`, `native/picker/android`) that carries the same React screens
inside the app and asks Android for the camera and location itself. Nothing is rewritten, so a fix
to a screen reaches the website and both apps. A small native class, `SafeChromeClient.java`, asks for
the camera and location one at a time (Capacitor's default crashes when both are asked at once on
first launch) and refuses every file chooser, so photos can still only come from the live camera.

The picker app asks for the language (Kannada, Tamil, Hindi or English) and the picker's name once,
on first launch; distances come from the phone's GPS. The demo controls open only after five taps on
the logo. It is not locked to pickers yet.

### Building the apps

Needs Java 21 and the Android SDK (platform 36). On a Mac:

```bash
brew install openjdk@21
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
sdkmanager --licenses                     # read and accept Google's Android SDK licence
npm run android                           # builds both apps' screens and copies them in
cd native/picker/android && ./gradlew assembleDebug    # -> app/build/outputs/apk/debug/app-debug.apk
```

`npm run android -- picker` builds one app. `SAFAI_API_ORIGIN=https://... npm run android` points the
apps at another server (a Vercel preview, say). A debug APK installs on any Android phone once
*Install unknown apps* is allowed for whatever opens it (Files, WhatsApp, Drive).

### Putting them on the Play Store

Each app is a separate Play listing under one developer account (a one-time $25, held by someone 18
or older). A new personal account must run a closed test with at least 12 testers for 14 days before
an app can go public.

1. Decide the names first. The package ids (`in.safaisaathi.reporter`, `in.safaisaathi.picker`) can
   never change once uploaded, so change `appId` in `native/*/capacitor.config.json` before the first
   upload if the project is renamed.
2. Create an upload key once per app and keep it safe (outside this repo):
   `keytool -genkey -v -keystore picker-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
3. Build a signed bundle: `./gradlew bundleRelease`, then sign it, or use Android Studio's
   *Build → Generate Signed App Bundle*. Upload the `.aab` and let Play App Signing hold the real key.
4. Raise `versionCode` in `native/*/android/app/build.gradle` for every new upload.

## Sharing jobs between devices

Reports, jobs and photos are shared through two small API routes: `api/state.js` holds one list of
every job, and `api/photo.js` holds the photos. Each device checks in every four seconds and right
after any change. For each job the most recent change wins, a write only lands if nobody else wrote
in between (so two pickers can't both take the same job), and "Reset demo data" resets every
device.

The store is Upstash Redis, free tier, added to the Vercel project from the Marketplace:

```bash
vercel integration add upstash     # asks you to accept Upstash's terms, then links it to the project
vercel deploy --prod
```

(or in the Vercel dashboard: the project, then **Storage**, then **Create Database**, then
**Upstash for Redis**). That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Without it the app
still works, but each device keeps its own jobs. `npm run dev` uses an in-memory store instead, so
two browsers on the same machine share jobs while developing.

This is prototype-grade: anyone with the link can add jobs, and there are no accounts.

## The map

The spot is shown on a map inside the app, with a circle at the 30 m radius the proof photo has to
be taken inside. The maximise button opens it full screen, clear of the action buttons, and
**Show the walk from here** draws the route from where the picker is standing, with the distance and
a walking time. The line comes from the free walking profile of [OSRM](https://project-osrm.org/)
run by FOSSGIS (routing.openstreetmap.de), so it uses footpaths and ignores one-way streets; a car
route once sent a picker 2 km round a one-way loop to reach a spot 1 m away. Inside the 30 m circle
the button is hidden, because there's nothing to walk.

Set `MAPS_EMBED_KEY` (a [Google Maps Embed](https://developers.google.com/maps/documentation/embed/get-api-key)
key, which needs a Google Cloud billing account even though the Embed API itself is free) and the
map becomes Google Maps, with Google's own walking directions in the full-screen view. With no key
it draws [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles through Leaflet, which needs
no key at all.

## Light and dark

The toggle sits next to the language menu on both entry screens and is remembered per browser; with
no choice saved the app follows the phone's own setting. Only the four surface tokens in
[`tokens.css`](src/styles/tokens.css) change between themes, so every component follows.

## Demo controls

Open with the link at the bottom of the website, by tapping the logo in the picker app five times, or
**Shift+D**. A red strip
appears on screen whenever one of these is on, so a recording never passes one off as real.

- **Pretend I'm 150 m from the spot**: shifts the proof photo's GPS, to trigger the distance rejection.
- **Pretend my clock is 1 hour behind**: back-dates the proof photo, to trigger the timestamp rejection.
- **AI offline mode**: makes AI calls fail, to show the manual-estimate and manual-review paths.
- **Expire job codes now**: to trigger the expired-code rejection.
- **Skip the 24-hour hold**: releases verified payouts immediately.
- **Reset demo data**: erases everything stored in this browser.

The "spot is still dirty" rejection needs no control: take the proof photo without cleaning up.

## Run it locally

Needs Node 20.19 or newer and a free [Gemini API key](https://aistudio.google.com/apikey)
(or an Anthropic key).

```bash
npm install
cp .env.example .env        # then paste your key after GEMINI_API_KEY=
npm run dev                 # http://localhost:4173, with hot reload
npm run build               # production bundle in dist/
```

Browsers allow the camera and GPS on `localhost`. On a phone you need HTTPS, so use the deployed version.

## Deploy

The repo is ready for [Vercel](https://vercel.com): Vite builds the React app into `dist/`, and the
three files in `api/` run as serverless functions.

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
  in hand pinned below, and open jobs as dense rows ranked by distance. The list has no map: on foot,
  "how far" and "how much" decide it. A map appears once a job is accepted, when the exact spot matters.

Colours come from Indian street and festival colour rather than eco branding: asphalt `#14161A`,
kerb concrete `#E2E5E0`, auto-rickshaw yellow `#FFC20E` for actions, marigold `#FF7A1A` for the job
in hand, and the Swachh Bharat segregation-bin colours, dry blue
`#1E5BC6` and wet green `#1B7A43` (only ever used for waste types; a brighter signal green
`#24B26B` marks verified and paid), plus
signal red `#D12A25` for rejections. Buttons are slabs with a hard offset shadow, like painted
signage, and they move when pressed.

Type: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) for Latin
headings, with [Anek](https://fonts.google.com/specimen/Anek+Devanagari) Devanagari, Tamil and
Kannada so every language shares one voice; [Mukta](https://fonts.google.com/specimen/Mukta),
Mukta Malar and Baloo Tamma 2 for body text; IBM Plex Mono for evidence (codes, coordinates,
timestamps). Motion confirms that something happened: a screen arriving, a job accepted, each check
passing or failing, a payout counting up. All of it switches off under `prefers-reduced-motion`.

## Built with

React 19 and Vite. The logic in `src/lib/` is plain JavaScript with no framework, so the proof
checks, payout formula and state machine read the same as before the move to React.

Seven components come from [React Bits](https://reactbits.dev). The rule for picking them: the main
users are waste pickers on phones, so nothing that gets in the way, slows a cheap phone or needs
explaining. Each one marks something that just happened or deserves attention:

| Component | Where |
|---|---|
| CircularCarousel | The picker's open jobs as a ring of photos, nearest first; the job in front shows its payout, distance and Accept button underneath |
| Particles | Behind the home headline: slow scraps of litter in the bin colours tumbling down and leaning after the cursor or a finger |
| GlassIcons | The three "How it works" tiles (camera, sack, rupee), each a link to that step's screen |
| BlurText | The home headline resolves word by word (replays when the language changes) |
| Counter | The picker's earnings and jobs done: odometer digits roll up when a payout lands |
| CountUp | The receipt's payout (re-counts as you change the estimate) and the released payout |
| ShinyText | "Reported", "Cleanup verified" and "Payout released": one sweep of light when they appear |

The ring only appears with three or more open jobs; with fewer it would look empty, so the dashboard
shows the plain list. A Cards / List switch beside the heading lets any picker who prefers the list
keep it (the choice is remembered on the phone), and the ring has no autoplay, so a job never drifts
away while someone is reading it.

Considered and left out: button effects such as Magnet and Specular Button (people open this on a
phone, where hover effects do nothing), Glass Surface over the camera (WebGL on top of a live camera
feed is too heavy for a cheap phone), and Grainient as the background (it read as grimy, the opposite
of clean). The WebGL pieces pause when off-screen or in a background tab.

They live in `src/components/reactbits/` as copied source, which is how React Bits is meant to be
used. One local change: BlurText takes an `as` prop so the headline stays an `<h1>`. React Bits is
under the MIT + Commons Clause license: free to use in an app like this one, but the components
themselves may not be sold or redistributed on their own. All of them stop animating under
`prefers-reduced-motion`.

## Languages

The app runs in **English, हिंदी, தமிழ் and ಕನ್ನಡ**, switched from the menu on the home screen or
the dashboard header, and remembered in the browser. The choice is also sent to the AI, so its
one-line reasoning comes back in the same language.

Strings live in [`src/lib/i18n/`](src/lib/i18n/), one file per language with identical keys.
`npm run check` fails if a language is missing a key or its placeholders don't match English, and
English is the fallback at runtime for anything still missing.

> **The Hindi, Tamil and Kannada translations were written by an AI and have not been checked by a
> native speaker.** Get someone who speaks the language to read them before the pitch; each file
> says so at the top.

## Project structure

```
index.html            the page shell; Vite injects the app
src/
  main.jsx            applies theme and language, then mounts <App>
  App.jsx             hash router, demo controls, toasts
  hooks.js            useStore, useLanguage, useTheme, useNow, useHashPath
  views/              website: Home, Report, Reports; picker app: Picker, Proof, Job
  picker/             the picker app: PickerApp, first-run Setup, InstallBanner, main.jsx
  components/         SpotMap, Photo, WasteTags, LanguageMenu, ThemeButton, DemoControls, ...
  components/reactbits/  CircularCarousel, Particles, GlassIcons, BlurText, Counter, CountUp, ShinyText
  lib/                framework-free logic, unchanged by the React move:
    config.js         every tunable number (rates, radii, TTLs, hold window)
    store.js          job state machine, persistence, cross-tab sync
    camera.js         live capture and the evidence stamp
    geo.js            GPS reads and distance maths
    verify.js         the six proof checks and their rejection copy
    payout.js         the payout formula
    ai.js             calls to /api/analyze and /api/verify
    maps.js           Leaflet / Google map and the walking route
    i18n.js, i18n/    language loading and the en, hi, ta, kn strings
    profile.js        the picker's name on this phone
    sync.js           keeps every device on the shared job list
    api.js            where the server is (the website's own /api, or the live site from the apps)
    photos.js, theme.js, time.js, toast.js, css.js, litter.js
  styles/             tokens, base, reporter side, picker side, react
picker/index.html     the picker app's page
public/assets/        the website's favicon
public/picker/        the picker app's manifest, service worker and icons
native/
  reporter/           Capacitor config and the reporter app's Android project
  picker/             Capacitor config and the picker app's Android project
                      (each has SafeChromeClient.java: one permission prompt at a time, no file picker)
api/
  _lib/ai.js          picks the provider, image blocks, answer validation, error messages
  _lib/gemini.js      Google Gemini provider (REST, free tier)
  _lib/claude.js      Anthropic Claude provider (SDK)
  analyze.js          POST /api/analyze: report photo -> type, size, reasoning
  verify.js           POST /api/verify: before + after -> code read, cleared, same place
  config.js           GET /api/config: whether a Google Maps key is set
scripts/
  dev-server.mjs      Vite in middleware mode plus the same api/ handlers Vercel runs
  check.mjs           fails if any file or gallery input appears, or a language is missing keys
  build-android.mjs   builds each app's screens against the live server and syncs them into Android
```

## Known limits

- **Laptop GPS is coarse.** Laptops locate by Wi-Fi, often to ±30 to 100 m. Two readings on the same
  laptop usually match, so the honest path passes, but a phone outdoors is far more reliable.
- **Device clocks can be changed.** Production would stamp time and issue codes on the server.
- **No accounts.** Anyone with an app or the link can add jobs, and a picker is just a typed name.
- **The AI can be wrong.** That's why there's a hold window, a reporter flag and a human review path.

## License

MIT. See [LICENSE](LICENSE).
