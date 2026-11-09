// Pronunciation through Microsoft Azure AI Speech (neural text to speech).
// The server builds SSML — Arabic runs wrapped in an Arabic <voice>, anything else in an English one — calls Azure's
// REST endpoint with the key kept server-side, and caches each clip on disk so a word is only ever paid for once.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLimiter } from "./security.js";

// Modern Standard Arabic only, for now. These are the only voices the server will ever use — a request for any
// other voice (e.g. a dialect voice saved before this change) falls back to the default.
// Dialect voices exist (ar-EG-SalmaNeural, ar-EG-ShakirNeural, ar-JO-SanaNeural, ar-JO-TaimNeural); add them here to offer them.
export const ARABIC_VOICES = [
  { id: "ar-SA-HamedNeural", label: "Hamed — Modern Standard Arabic (male)" },
  { id: "ar-SA-ZariyahNeural", label: "Zariyah — Modern Standard Arabic (female)" }
];
const MAX_CHARS = 600;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

// Arabic letters, harakat, Arabic punctuation, and the spaces between Arabic words.
const ARABIC_CHAR = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
const RUNS = new RegExp(`([${ARABIC_CHAR}](?:[${ARABIC_CHAR}\\s]*[${ARABIC_CHAR}])?)`, "g");
const ARABIC_SLASH = new RegExp(`([${ARABIC_CHAR}])\\s*/\\s*(?=[${ARABIC_CHAR}])`, "g");
const ARABIC_LETTER = /[\u0621-\u064A\u0671-\u06D3\u06FA-\u06FF]/;

export const escapeXml = text => String(text)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** 0.6 (slow) … 1.0 (normal) … 1.2 → an SSML prosody rate like "-15%". */
export function prosodyRate(rate) {
  const value = Number(rate);
  const percent = Number.isFinite(value) ? Math.max(-50, Math.min(30, Math.round((value - 1) * 100))) : -10;
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

/** Splits text into Arabic / non-Arabic runs and wraps each in the right voice. */
export function buildSsml(text, { voice, englishVoice, rate }) {
  const cleaned = String(text)
    .replace(/ـ/g, "")                       // tatweel (stretching) is visual only
    .replace(ARABIC_SLASH, "$1، ")            // "باب/أبواب" → read the forms with a pause between
    .replace(/[…]|\.\.\./g, " ")
    .slice(0, MAX_CHARS);
  const pieces = [];
  cleaned.split(/(_{2,})/).forEach(part => {
    if (/^_{2,}$/.test(part)) { pieces.push({ type: "pause" }); return; }  // a fill-in blank: pause instead of reading underscores
    part.split(RUNS).forEach((run, index) => {
      if (!run.trim()) return;
      if (index % 2 === 1) { if (ARABIC_LETTER.test(run)) pieces.push({ type: "ar", text: run }); }
      else if (/[A-Za-z0-9]/.test(run)) pieces.push({ type: "en", text: run.trim() });
    });
  });
  const body = pieces.map(piece => {
    if (piece.type === "pause") return `<voice name="${voice}"><break time="450ms"/></voice>`;
    const name = piece.type === "ar" ? voice : englishVoice;
    return `<voice name="${name}"><prosody rate="${prosodyRate(rate)}">${escapeXml(piece.text)}</prosody></voice>`;
  }).join("");
  const lang = voice.split("-").slice(0, 2).join("-");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">${body}</speak>`;
}

/**
 * options: { key, region, endpoint?, defaultVoice, englishVoice, cacheDir, fetchImpl (injectable for tests),
 *            perTenMinutes, perDay }
 * Returns null when Azure isn't configured.
 */
export function createSpeech({ key, region, endpoint, defaultVoice = "ar-SA-HamedNeural", englishVoice = "en-US-JennyNeural", cacheDir, fetchImpl = fetch, perTenMinutes = 120, perDay = 1500 } = {}) {
  if (!key || (!region && !endpoint)) return null;
  const url = endpoint || `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const voices = new Set(ARABIC_VOICES.map(voice => voice.id));
  const fallbackVoice = voices.has(defaultVoice) ? defaultVoice : ARABIC_VOICES[0].id;
  const memory = new Map(); // small in-process cache in front of the disk cache
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  const burst = createLimiter({ max: perTenMinutes, windowMs: 10 * 60 * 1000 });
  const daily = createLimiter({ max: perDay, windowMs: 24 * 60 * 60 * 1000 });

  return {
    voices: ARABIC_VOICES,
    defaultVoice: fallbackVoice,
    resolveVoice: voice => (voices.has(voice) ? voice : fallbackVoice),

    /** Returns { audio: Buffer, cached: boolean }. Only cache misses count against the student's limit. */
    async synthesize({ text, voice, rate, userId }) {
      const chosen = voices.has(voice) ? voice : fallbackVoice;
      const ssml = buildSsml(text, { voice: chosen, englishVoice, rate });
      const id = createHash("sha256").update(`${OUTPUT_FORMAT}|${ssml}`).digest("hex");
      if (memory.has(id)) return { audio: memory.get(id), cached: true };
      const file = cacheDir ? join(cacheDir, `${id}.mp3`) : null;
      if (file && existsSync(file)) {
        const audio = readFileSync(file);
        remember(id, audio);
        return { audio, cached: true };
      }
      if (!burst.hit(`b${userId}`) || !daily.hit(`d${userId}`)) {
        const error = new Error("You’ve played a lot of new audio — try again in a few minutes.");
        error.status = 429;
        throw error;
      }
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
          "User-Agent": "dartmouth-arabic-trainer"
        },
        body: ssml,
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const error = new Error(
          response.status === 401 || response.status === 403 ? "Azure Speech rejected the key. An administrator needs to check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION."
            : response.status === 429 ? "Azure Speech is busy right now. Try again in a moment."
              : `Azure Speech couldn’t create the audio (status ${response.status}).`
        );
        error.status = response.status === 429 ? 429 : 502;
        throw error;
      }
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length) { const error = new Error("Azure Speech returned no audio."); error.status = 502; throw error; }
      remember(id, audio);
      if (file) { try { writeFileSync(file, audio); } catch { /* cache is best-effort */ } }
      return { audio, cached: false };
    }
  };

  function remember(id, audio) {
    memory.set(id, audio);
    if (memory.size > 400) memory.delete(memory.keys().next().value);
  }
}
