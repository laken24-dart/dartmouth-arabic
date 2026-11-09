# Dartmouth Arabic — React app

The redesigned learner site and instructor platform (React 19 + Framer Motion + Vite).

## Run it

The app needs the API server — see `../server/README.md`. In short:

```bash
cd server && npm install && cp .env.example .env && npm run dev   # API on :8787
cd app && npm install && npm run dev                              # app on :5173, proxies /api
```

## Build

```bash
npm run build    # outputs app/dist, which the server serves in production
```

## Where the content lives (single source of truth)

- **Vocabulary**: `src/data/vocab-raw.js`
- **Arabic fill-in-the-blank sentences**: `src/data/sentence-bank.js`
- **Grammar questions & pattern tables**: `src/data/grammar.js`

Edit those files and the app picks up the changes; rebuild for production.

## Saved data

Accounts, progress, review queues, starred words, classes and homework live on the server (`../server`).
The browser keeps a cached copy of the signed-in learner's progress so the app stays fast; changes are sent
to the server within half a second. When a learner creates an account, progress already saved in that browser
(from before accounts existed) is uploaded into it. Signing out clears the cached copy from that computer.
