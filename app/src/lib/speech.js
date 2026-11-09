// Pronunciation. Uses Microsoft Azure AI Speech (through our server, which wraps the text in SSML with an Arabic
// neural voice) when it's configured, and falls back to the browser's built-in voices otherwise or on any error.
import { useEffect, useState } from "react";
import { KEYS, read, write } from "./storage";
import { fetchConfig } from "./auth";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let browserVoices = [];
const voiceListeners = new Set();

function loadBrowserVoices() {
  if (!synth) return;
  browserVoices = synth.getVoices().filter(voice => /^ar/i.test(voice.lang));
  browserVoices.sort((a, b) => Number(/online|natural|google|microsoft/i.test(b.name)) - Number(/online|natural|google|microsoft/i.test(a.name)));
  voiceListeners.forEach(listener => listener(browserVoices));
}
if (synth) {
  loadBrowserVoices();
  synth.onvoiceschanged = loadBrowserVoices;
  setTimeout(loadBrowserVoices, 1500);
}

const speakable = text => text
  .replace(/\s*\/\s*/g, "، ").replace(/[…]|\.\.\./g, " ").replace(/ـ/g, "")
  .replace(/[()]/g, "، ").replace(/(،\s*)+/g, "، ").replace(/^،\s*|،\s*$/g, "")
  .replace(/___/g, "…");

export const speechSupported = Boolean(synth) || typeof Audio !== "undefined";

// Lets Daal's mouth move while any Arabic is being spoken.
const speakingListeners = new Set();
let speakingNow = false;
function setSpeaking(value) { if (speakingNow !== value) { speakingNow = value; speakingListeners.forEach(listener => listener(value)); } }
export function onSpeakingChange(listener) { speakingListeners.add(listener); return () => speakingListeners.delete(listener); }
export const isSpeaking = () => speakingNow;

/* ---------- Azure (server) ---------- */
let azure = null; // { voices, defaultVoice } once the server says Azure is on
fetchConfig().then(config => { if (config?.tts?.enabled) azure = config.tts; });

const clips = new Map(); // "voice|rate|text" -> object URL of the MP3, so replays are instant
let current = null;      // the <audio> playing now
let turn = 0;            // newer calls cancel older ones

export const azureVoiceId = () => {
  const chosen = read(KEYS.ttsVoice, null);
  return azure?.voices?.some(voice => voice.id === chosen) ? chosen : azure?.defaultVoice;
};
const rateValue = () => parseFloat(read(KEYS.rate, "0.85")) || 0.85;

function stopAll() {
  if (current) { current.onended = current.onerror = current.onpause = null; current.pause(); current = null; }
  synth?.cancel();
  setSpeaking(false);
}

async function clipFor(text) {
  const voice = azureVoiceId();
  const rate = rateValue();
  const key = `${voice}|${rate}|${text}`;
  if (clips.has(key)) return clips.get(key);
  const response = await fetch("/api/speech", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-requested-with": "dalt" },
    body: JSON.stringify({ text, voice, rate })
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `speech ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  clips.set(key, url);
  if (clips.size > 300) { const [oldKey, oldUrl] = clips.entries().next().value; URL.revokeObjectURL(oldUrl); clips.delete(oldKey); }
  return url;
}

function playAzure(text, myTurn, onEnd) {
  return clipFor(text).then(url => {
    if (myTurn !== turn) return;
    const audio = new Audio(url);
    current = audio;
    const finish = () => { if (current === audio) current = null; setSpeaking(false); onEnd?.(); };
    audio.onplay = () => setSpeaking(true);
    audio.onended = finish;
    audio.onerror = finish;
    return audio.play();
  });
}

/* ---------- browser fallback ---------- */
function playBrowser(text, onEnd) {
  if (!synth) { onEnd?.(); return; }
  const utterance = new SpeechSynthesisUtterance(speakable(text));
  utterance.lang = "ar-SA";
  utterance.rate = rateValue();
  const chosen = browserVoices.find(voice => voice.name === read(KEYS.voice, "")) || browserVoices[0];
  if (chosen) { utterance.voice = chosen; utterance.lang = chosen.lang; }
  utterance.onstart = () => setSpeaking(true);
  utterance.onend = utterance.onerror = () => { setSpeaking(false); onEnd?.(); };
  synth.speak(utterance);
}

/** Speaks Arabic text (Azure neural voice when available). onEnd fires when it finishes. */
export function speak(text, { onEnd } = {}) {
  if (!text || !String(text).trim()) { onEnd?.(); return; }
  stopAll();
  const myTurn = ++turn;
  if (!azure) { playBrowser(text, onEnd); return; }
  playAzure(String(text).slice(0, 600), myTurn, onEnd).catch(error => {
    if (myTurn !== turn) return;
    console.warn("Azure pronunciation unavailable, using the browser voice:", error.message);
    playBrowser(text, onEnd);
  });
}

/* ---------- settings ---------- */
export function useArabicVoices() {
  const [list, setList] = useState(browserVoices);
  useEffect(() => { voiceListeners.add(setList); return () => voiceListeners.delete(setList); }, []);
  return list;
}

/** { provider: "azure" | "browser", voices: [{ id, label }] } */
export function useTtsInfo() {
  const [info, setInfo] = useState(() => (azure ? { provider: "azure", voices: azure.voices } : null));
  useEffect(() => {
    let live = true;
    fetchConfig().then(config => { if (live) setInfo(config?.tts?.enabled ? { provider: "azure", voices: config.tts.voices } : { provider: "browser", voices: [] }); });
    return () => { live = false; };
  }, []);
  return info;
}

export const setVoice = name => write(KEYS.voice, name);
export const setAzureVoice = id => { write(KEYS.ttsVoice, id); };
export const setRate = rate => write(KEYS.rate, rate);
