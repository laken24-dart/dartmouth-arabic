# Dartmouth Arabic — server

Node + Express + SQLite (Node's built-in `node:sqlite`, no native modules). Stores accounts, sessions,
each learner's saved progress, classes, join codes, lesson plans, homework and submissions. In production it
also serves the built React app from `../app/dist`, so the site and API share one origin.

## Daal, the AI Arabic tutor

Daal runs the lessons and quizzes on every page (no AI needed for that), and its AI tools are powered by
Claude through the official Anthropic SDK: **Ask** (any question), **Talk** (role-play conversations at
Dartmouth in simple Arabic), **Check** (corrects Arabic you wrote), **Quiz me**, and **Why?** (explains a
missed question beside the question itself).

- **Turn it on:** add `ANTHROPIC_API_KEY` to `.env` and restart. Without a key the AI tools say they're off.
- **What Daal knows:** the full course vocabulary (cached, so it's cheap to resend), the student's current
  unit and recently missed words, and the conversation so far. It never sees passwords or other students' data.
- **Model and cost controls:** `claude-opus-5-5` at `low` effort with a 4,000-token reply cap, plus per-student
  limits (30 messages / 10 minutes, 300 / day). All adjustable in `.env`.
- **Refusals:** server-side fallback (`fallbacks: "default"`) is on, so if a request is declined Anthropic
  retries it on its recommended model; a request that is still declined gets a friendly redirect.
- **Academic integrity:** Daal's instructions tell it to coach students through graded homework rather than
  write answers they would hand in.
- Code: `src/daal.js` (prompt + Claude call) and `POST /api/daal/chat` in `src/app.js` (streams replies as
  server-sent events).

## Pronunciation (Microsoft Azure AI Speech)

Every "hear it" button, Daal's tappable Arabic, and Daal's mouth movements use Azure neural voices when
`AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set (otherwise the browser's built-in voice is used).

- **How it works:** the browser sends the text to `POST /api/speech`. The server builds SSML — each Arabic run
  is wrapped in `<voice name="ar-…Neural">` with a `<prosody rate>` for the student's speed, any English in the
  same text gets an English voice, slashes between word forms (`باب/أبواب`) become pauses and fill-in blanks
  become `<break>`s — then calls `https://<region>.tts.speech.microsoft.com/cognitiveservices/v1` and returns MP3.
  The Azure key never leaves the server; all text is XML-escaped.
- **Voices:** Modern Standard Arabic only for now — students can choose Hamed (male) or Zariyah (female) in their
  account settings. The server rejects any other voice (dialect voices fall back to Hamed). To offer dialects later,
  add their voice IDs to `ARABIC_VOICES` in `src/speech.js`.
- **Cost control:** each clip is cached on disk (`data/tts-cache/`) and in the browser, so a word is synthesized
  once for everyone; only new audio counts toward a per-student limit (120 / 10 minutes, 1,500 / day).
- **If Azure fails** (bad key, outage), the site quietly falls back to the browser voice.
- Code: `src/speech.js` (SSML + Azure call + cache), `app/src/lib/speech.js` (playback + fallback).

## Dartmouth single sign-on

Students and instructors click **Sign in with Dartmouth**, enter their NetID and password on Dartmouth's own
login page, and come back signed in. The site never sees their Dartmouth password. It uses SAML 2.0, the
protocol Dartmouth supports for app integrations.

**Connecting the real Dartmouth login (one-time):**

1. Deploy the site at its permanent HTTPS address (e.g. `https://arabic.dartmouth.edu`) with `PUBLIC_URL` set.
2. Request an SSO integration from Dartmouth ITC (services.dartmouth.edu → "Single Sign-on Integration";
   per Dartmouth's page, ITC, professional-school IT teams and partners can submit it, so a faculty sponsor
   may need to file it). Give them:
   - **Metadata URL:** `https://<your-site>/api/auth/sso/metadata`
   - **Entity ID:** `https://<your-site>/api/auth/sso/metadata`
   - **Assertion Consumer Service (POST):** `https://<your-site>/api/auth/sso/callback`
   - **Attributes requested:** email (`mail`), display name, given name, surname.
3. ITC sends back their **SSO URL** and **signing certificate** → put them in `SAML_ENTRY_POINT` and `SAML_IDP_CERT`.
4. Restart. Email+password sign-in turns off automatically once SSO is configured.

**Instructors:** list their emails in `TEACHER_EMAILS` to give them instructor tools on first sign-in.
Anyone else who signs in through the instructor page can unlock instructor tools once with `TEACHER_ACCESS_CODE`.

Existing email+password accounts are linked automatically when the same @dartmouth.edu address signs in with SSO.

**Trying it before ITC registers the site:** `npm run mock-sso` starts a stand-in "Dartmouth Login" page on
port 8790 that issues properly signed SAML responses (development only, never deploy it). Add the three lines
it prints to `.env` and restart the server.

What the server checks on every sign-in: the response is signed by Dartmouth's certificate, it answers a
login this server started (one-time ID, 10-minute limit), it was started in the same browser, it is meant
for this site (audience), it is within its time window, and the email is @dartmouth.edu.

## Run locally

```bash
# terminal 1 — API
cd server
npm install
cp .env.example .env      # then set TEACHER_ACCESS_CODE
npm run dev               # http://localhost:8787

# terminal 2 — React app with hot reload (proxies /api to :8787)
cd app
npm run dev               # http://localhost:5173
```

## Production

```bash
cd app && npm install && npm run build
cd ../server && npm install
NODE_ENV=production TEACHER_ACCESS_CODE=... npm start
```

Put it behind HTTPS (Render, Fly.io, Railway, a VM with Caddy/nginx…). The database is the single file
`server/data/dalt.db` — put it on a persistent disk and back it up. Requires Node 22.13+.

## Security model

- Passwords: scrypt (N=16384, r=8, p=1, 16-byte salt); never stored or logged in plain text.
- Sessions: 32-byte random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); only its SHA-256 is stored; 30-day expiry; logout deletes it.
- CSRF: every write must send `X-Requested-With: dalt`, which cross-site pages can't do without a CORS preflight (never allowed).
- Rate limits: 10 failed sign-ins per email+IP per 15 min; sign-up and email-check limits per IP (in memory).
- Instructor accounts require `TEACHER_ACCESS_CODE`; teachers only see and edit their own classes.
- Learner state is limited to a whitelist of keys, 512 KB each.

Not included yet: an admin UI, and password reset for the email+password fallback (not needed once SSO is on).

## Tests

```bash
npm test
```

## API

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | /api/config | anyone | which sign-in methods are on |
| GET | /api/auth/sso/login?intent= | anyone | start Dartmouth sign-in |
| POST | /api/auth/sso/callback | Dartmouth | SAML response comes back here |
| GET | /api/auth/sso/metadata | anyone | our SAML metadata for ITC |
| POST | /api/speech | signed in | Azure pronunciation (returns MP3) |
| POST | /api/daal/chat | signed in | Daal's AI tutor (streams text) |
| POST | /api/auth/claim-teacher | signed in | unlock instructor tools with the access code |
| POST | /api/auth/check | anyone | does an account exist for this email |
| POST | /api/auth/signup | anyone | create learner account (+ session) |
| POST | /api/auth/teacher-signup | anyone with access code | create instructor account |
| POST | /api/auth/login | anyone | sign in (`role: "teacher"` to require instructor) |
| POST | /api/auth/logout | signed in | end session |
| GET | /api/me | signed in | current user + joined classes |
| GET / PUT | /api/state, /api/state/:key | signed in | learner's saved progress documents |
| POST | /api/classes/join | signed in | join with a class code |
| GET | /api/classwork?unit=&day= | signed in | instructor plan/homework for that day |
| POST | /api/homework/:id/submit | class member | submit homework |
| GET / POST / DELETE | /api/teacher/classes | instructor | own classes with roster, progress, plans, homework, submissions |
| POST / DELETE | /api/teacher/lessons, /api/teacher/homework | instructor | publish or remove day content |
