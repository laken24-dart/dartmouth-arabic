import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { createSso } from "./sso.js";
import { createDaal } from "./daal.js";
import { createSpeech } from "./speech.js";
import { scheduleBackups } from "./backup.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (KEY=value lines) so no extra dependency is needed.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 8787);
const dbFile = process.env.DATABASE_FILE || join(root, "data", "dalt.db");
let teacherAccessCode = process.env.TEACHER_ACCESS_CODE;
if (!teacherAccessCode) {
  if (production) {
    console.error("TEACHER_ACCESS_CODE must be set in production (it gates instructor sign-up).");
    process.exit(1);
  }
  teacherAccessCode = randomBytes(4).toString("hex").toUpperCase();
  console.log(`\n  No TEACHER_ACCESS_CODE set — using a temporary one for this run: ${teacherAccessCode}\n`);
}

const sso = createSso(process.env);
const passwordLogin = process.env.PASSWORD_LOGIN ? process.env.PASSWORD_LOGIN !== "off" : !sso;
console.log(sso ? `  Dartmouth SSO: on (metadata at ${sso.issuer})` : "  Dartmouth SSO: off (set SAML_ENTRY_POINT + SAML_IDP_CERT + PUBLIC_URL to enable)");
console.log(`  Email + password sign-in: ${passwordLogin ? "on" : "off"}`);

const daal = createDaal({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.DAAL_MODEL || "claude-opus-5-5",
  effort: process.env.DAAL_EFFORT || "low",
  perTenMinutes: Number(process.env.DAAL_LIMIT_PER_10_MIN || 30),
  perDay: Number(process.env.DAAL_LIMIT_PER_DAY || 300)
});
console.log(daal ? `  Daal AI tutor: on (${daal.model})` : "  Daal AI tutor: off (set ANTHROPIC_API_KEY to enable)");

const speech = createSpeech({
  key: process.env.AZURE_SPEECH_KEY,
  region: process.env.AZURE_SPEECH_REGION,
  endpoint: process.env.AZURE_SPEECH_ENDPOINT,
  defaultVoice: process.env.AZURE_SPEECH_VOICE || "ar-SA-HamedNeural",
  englishVoice: process.env.AZURE_SPEECH_ENGLISH_VOICE || "en-US-JennyNeural",
  cacheDir: process.env.TTS_CACHE_DIR || join(root, "data", "tts-cache")
});
console.log(speech ? `  Azure pronunciation: on (${speech.defaultVoice})` : "  Azure pronunciation: off (set AZURE_SPEECH_KEY + AZURE_SPEECH_REGION; using browser voices)");

const db = openDatabase(dbFile);
const backupDir = process.env.BACKUP_DIR || join(dirname(dbFile), "backups");
scheduleBackups(db, backupDir, Number(process.env.BACKUP_KEEP || 7));
console.log(`  Nightly database backups: ${backupDir} (keeping ${process.env.BACKUP_KEEP || 7})`);

const app = createApp({
  speech,
  daal,
  sso,
  passwordLogin,
  teacherEmails: String(process.env.TEACHER_EMAILS || "").split(","),
  db,
  allowedDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? "dartmouth.edu",
  teacherAccessCode,
  staticDir: process.env.STATIC_DIR || join(root, "..", "app", "dist"),
  secureCookies: production
});

app.listen(port, () => {
  console.log(`Dartmouth Arabic server on http://localhost:${port}  (database: ${dbFile})`);
});
