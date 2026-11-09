// Keeps each learner's saved data on the server. localStorage stays as a fast local cache:
// reads stay synchronous, and every write to a synced key is pushed to the server shortly after.
import { api } from "./api";
import { KEYS, setWriteListener } from "./storage";

export const SYNCED_KEYS = [
  KEYS.progress, KEYS.used, KEYS.assessedWords, KEYS.assessedGrammar, KEYS.review,
  KEYS.known, KEYS.selected, KEYS.cardDir, KEYS.quizDir, KEYS.autoplay, KEYS.rate, KEYS.guideIntroduced, KEYS.ttsVoice
];
const synced = new Set(SYNCED_KEYS);
const pending = new Map();
let active = false;
let applying = false;

function readRaw(key) {
  try { const raw = localStorage.getItem(key); return raw == null ? undefined : JSON.parse(raw); } catch { return undefined; }
}

function flush(key, keepalive = false) {
  clearTimeout(pending.get(key));
  pending.delete(key);
  const value = readRaw(key);
  if (value === undefined || !active) return Promise.resolve();
  return api(`/state/${encodeURIComponent(key)}`, { method: "PUT", body: { value }, keepalive }).catch(error => {
    console.warn(`Couldn’t save ${key} to the server:`, error.message);
  });
}

/** Sends any changes still waiting on their debounce timer. */
export function flushPending() {
  return Promise.all([...pending.keys()].map(key => flush(key)));
}

setWriteListener(key => {
  if (!active || applying || !synced.has(key)) return;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => flush(key), 500));
});

if (typeof window !== "undefined") {
  const flushAll = () => [...pending.keys()].forEach(key => flush(key, true));
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
}

function notify() {
  SYNCED_KEYS.forEach(key => window.dispatchEvent(new CustomEvent("dalt:storage", { detail: key })));
}

/** After sign-in: replace this browser's cache with the account's saved data. */
export async function pullState() {
  const { state } = await api("/state");
  applying = true;
  try {
    for (const key of SYNCED_KEYS) {
      if (key in state) localStorage.setItem(key, JSON.stringify(state[key]));
      else localStorage.removeItem(key);
    }
  } catch { /* storage unavailable: the app still runs from memory */ }
  applying = false;
  active = true;
  notify();
}

/** After creating an account: upload whatever this browser already had (progress from before accounts existed). */
export async function pushLocalState() {
  active = true;
  await Promise.all(SYNCED_KEYS.map(key => {
    const value = readRaw(key);
    return value === undefined ? null : api(`/state/${encodeURIComponent(key)}`, { method: "PUT", body: { value } }).catch(() => null);
  }));
}

/** On sign-out: drop the cached copy so the next person on this computer starts clean. */
export function clearLocalState() {
  pending.forEach(timer => clearTimeout(timer));
  pending.clear();
  active = false;
  try { SYNCED_KEYS.forEach(key => localStorage.removeItem(key)); } catch { /* ignore */ }
  notify();
}
