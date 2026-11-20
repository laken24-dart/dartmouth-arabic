# Dartmouth Arabic Language Trainer

https://dartmouth-arabic.onrender.com/#/

A day-by-day Arabic course (Alif Baa → Al-Kitaab Part 1) for Dartmouth students, with an instructor platform.

- `app/` — the website (React + Framer Motion, built with Vite)
- `server/` — the backend (Node + Express + SQLite): Dartmouth single sign-on, accounts, saved progress, classes, homework

## Quick start (on your computer)

```bash
npm run setup                 # install everything (first time)
cp server/.env.example server/.env
npm run dev:server            # terminal 1 — API on http://localhost:8787
npm run dev:app               # terminal 2 — site on http://localhost:5173
```

To try "Sign in with Dartmouth" before Dartmouth has registered the site, run the stand-in login
(`npm run mock-sso`) and add the three lines it prints to `server/.env`. See `server/README.md`.

## Going live

```bash
npm run setup && npm run build
NODE_ENV=production npm start      # serves the site and API together
```

See `server/README.md` for hosting, HTTPS, and connecting the real Dartmouth login.

## Editing course content

- Vocabulary: `app/src/data/vocab-raw.js`
- Arabic fill-in-the-blank sentences: `app/src/data/sentence-bank.js`
- Grammar questions and pattern tables: `app/src/data/grammar.js`
