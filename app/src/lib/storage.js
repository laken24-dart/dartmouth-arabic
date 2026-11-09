import { useCallback, useEffect, useState } from "react";

// Same keys as the classic site, so accounts and progress carry over.
export const KEYS = {
  accounts: "dalt-local-accounts",
  profile: "dalt-local-profile",
  session: "dalt-local-session",
  progress: "dalt-curriculum-progress-v1",
  used: "dalt-curriculum-used-items-v1",
  assessedWords: "dalt-curriculum-assessed-words-v1",
  assessedGrammar: "dalt-curriculum-assessed-grammar-v1",
  review: "dalt-spaced-review-v1",
  memberships: "dalt-class-memberships-v1",
  classes: "dalt-teacher-classes-v1",
  teacherContent: "dalt-teacher-content-v1",
  studentProgress: "dalt-student-progress-v1",
  known: "ak-known",
  selected: "ak-sel",
  cardDir: "ak-dir",
  quizDir: "ak-qdir",
  voice: "ak-voice",
  rate: "ak-rate",
  autoplay: "ak-auto",
  guideIntroduced: "dalt-deem-introduced-v1",
  ttsVoice: "dalt-tts-voice"
};

let writeListener = null;
/** Lets the sync layer hear about every local write (avoids a circular import). */
export const setWriteListener = listener => { writeListener = listener; };

export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("dalt:storage", { detail: key }));
    writeListener?.(key);
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
    window.dispatchEvent(new CustomEvent("dalt:storage", { detail: key }));
  } catch { /* storage unavailable */ }
}

/** React state mirrored to localStorage and kept in sync across components. */
export function useStored(key, fallback, validate = value => value) {
  const load = useCallback(() => {
    const value = read(key, fallback);
    try { return validate(value) ?? fallback; } catch { return fallback; }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = useState(load);
  useEffect(() => {
    const sync = event => { if (!event.detail || event.detail === key) setValue(load()); };
    const syncNative = event => { if (event.key === key) setValue(load()); };
    window.addEventListener("dalt:storage", sync);
    window.addEventListener("storage", syncNative);
    return () => { window.removeEventListener("dalt:storage", sync); window.removeEventListener("storage", syncNative); };
  }, [key, load]);
  const update = useCallback(next => {
    setValue(previous => {
      const resolved = typeof next === "function" ? next(previous) : next;
      try { localStorage.setItem(key, JSON.stringify(resolved)); writeListener?.(key); } catch { /* keep in memory */ }
      queueMicrotask(() => window.dispatchEvent(new CustomEvent("dalt:storage", { detail: key })));
      return resolved;
    });
  }, [key]);
  return [value, update];
}

export const asArray = value => (Array.isArray(value) ? value : []);
export const asObject = value => (value && typeof value === "object" && !Array.isArray(value) ? value : null);
