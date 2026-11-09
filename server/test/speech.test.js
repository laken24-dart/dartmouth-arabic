import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { buildSsml, createSpeech, prosodyRate } from "../src/speech.js";

const opts = { voice: "ar-SA-HamedNeural", englishVoice: "en-US-JennyNeural", rate: 0.85 };
const parse = ssml => {
  const errors = [];
  const doc = new DOMParser({ onError: (level, message) => errors.push(message) }).parseFromString(ssml, "application/xml");
  assert.deepEqual(errors, [], `SSML must be well-formed XML:\n${ssml}`);
  return doc;
};
const voicesIn = doc => Array.from(doc.getElementsByTagName("voice")).map(node => [node.getAttribute("name"), node.textContent]);

test("Arabic is wrapped in an Arabic voice inside valid SSML", () => {
  const ssml = buildSsml("مكتبة", opts);
  const doc = parse(ssml);
  assert.equal(doc.documentElement.getAttribute("xml:lang"), "ar-SA");
  assert.equal(doc.documentElement.getAttribute("xmlns"), "http://www.w3.org/2001/10/synthesis");
  assert.deepEqual(voicesIn(doc), [["ar-SA-HamedNeural", "مكتبة"]]);
  assert.match(ssml, /<prosody rate="-15%">/);
});

test("mixed English and Arabic get separate voices; harakat and Arabic punctuation stay with the Arabic", () => {
  const doc = parse(buildSsml("ما is used before nouns: ما اسمُكَ؟ — while ماذا goes before verbs.", opts));
  assert.deepEqual(voicesIn(doc), [
    ["ar-SA-HamedNeural", "ما"],
    ["en-US-JennyNeural", "is used before nouns:"],
    ["ar-SA-HamedNeural", "ما اسمُكَ؟"],
    ["en-US-JennyNeural", "— while"],
    ["ar-SA-HamedNeural", "ماذا"],
    ["en-US-JennyNeural", "goes before verbs."]
  ]);
});

test("slashes become pauses, blanks become breaks, tatweel is dropped", () => {
  assert.deepEqual(voicesIn(parse(buildSsml("باب/أبواب", opts))), [["ar-SA-HamedNeural", "باب، أبواب"]]);
  const blank = buildSsml("عندي ___ واحد", opts);
  assert.match(blank, /<break time="450ms"\/>/);
  assert.doesNotMatch(blank, /_/);
  assert.deepEqual(voicesIn(parse(buildSsml("ـلـ", opts))), [["ar-SA-HamedNeural", "ل"]]);
});

test("XML special characters can't break or inject into the SSML", () => {
  const ssml = buildSsml(`Tom & "Jerry" <voice name="x">hi</voice> مرحباً`, opts);
  const doc = parse(ssml);
  assert.equal(doc.getElementsByTagName("voice").length, 2); // the injected tag stays text
  assert.match(ssml, /&amp;/);
  assert.match(ssml, /&lt;voice name=&quot;x&quot;&gt;/);
});

test("speech rate maps to SSML prosody", () => {
  assert.equal(prosodyRate(0.6), "-40%");
  assert.equal(prosodyRate(0.85), "-15%");
  assert.equal(prosodyRate(1), "+0%");
  assert.equal(prosodyRate("junk"), "-10%");
  assert.equal(prosodyRate(5), "+30%");
});

/* ---------- the endpoint ---------- */
function fakeAzure({ status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return new Response(status === 200 ? new Uint8Array([0xff, 0xfb, 0x90, 0x44, 1, 2, 3]) : "nope", { status });
  };
  return { calls, fetchImpl };
}

const servers = [];
after(() => servers.forEach(server => server.close()));
async function start(speech) {
  const app = createApp({ db: openDatabase(":memory:"), teacherAccessCode: "T", speech });
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/auth/signup`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "dalt" }, body: JSON.stringify({ name: "S", email: `s${Math.random()}@dartmouth.edu`, password: "password123" }) });
  return { base, cookie: res.headers.get("set-cookie").split(";")[0] };
}
const say = ({ base, cookie }, body) => fetch(`${base}/api/speech`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "dalt", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

test("calls Azure with the key server-side, returns MP3, and caches to disk", async () => {
  const azure = fakeAzure();
  const cacheDir = mkdtempSync(join(tmpdir(), "tts-"));
  const ctx = await start(createSpeech({ key: "azure-secret", region: "eastus", cacheDir, fetchImpl: azure.fetchImpl }));

  const config = await (await fetch(`${ctx.base}/api/config`)).json();
  assert.equal(config.tts.enabled, true);
  assert.deepEqual(config.tts.voices.map(voice => voice.id), ["ar-SA-HamedNeural", "ar-SA-ZariyahNeural"]); // MSA only
  assert.ok(!JSON.stringify(config).includes("azure-secret")); // key never reaches the browser

  const first = await say(ctx, { text: "كتاب", voice: "ar-SA-ZariyahNeural", rate: 0.85 });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "audio/mpeg");
  assert.equal(first.headers.get("x-tts-cache"), "miss");
  assert.equal((await first.arrayBuffer()).byteLength, 7);
  const call = azure.calls[0];
  assert.equal(call.url, "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.equal(call.headers["Ocp-Apim-Subscription-Key"], "azure-secret");
  assert.equal(call.headers["Content-Type"], "application/ssml+xml");
  assert.equal(call.headers["X-Microsoft-OutputFormat"], "audio-24khz-48kbitrate-mono-mp3");
  assert.ok(call.headers["User-Agent"]);
  assert.deepEqual(voicesIn(parse(call.body)), [["ar-SA-ZariyahNeural", "كتاب"]]);

  const again = await say(ctx, { text: "كتاب", voice: "ar-SA-ZariyahNeural", rate: 0.85 });
  assert.equal(again.headers.get("x-tts-cache"), "hit");
  assert.equal(azure.calls.length, 1); // paid for once
  assert.equal(readdirSync(cacheDir).filter(name => name.endsWith(".mp3")).length, 1);

  // a fresh server with the same cache folder still doesn't call Azure
  const azure2 = fakeAzure();
  const ctx2 = await start(createSpeech({ key: "azure-secret", region: "eastus", cacheDir, fetchImpl: azure2.fetchImpl }));
  assert.equal((await say(ctx2, { text: "كتاب", voice: "ar-SA-ZariyahNeural", rate: 0.85 })).headers.get("x-tts-cache"), "hit");
  assert.equal(azure2.calls.length, 0);
});

test("dialect voices can't be used: a saved or requested dialect voice falls back to Modern Standard Arabic", async () => {
  const azure = fakeAzure();
  const ctx = await start(createSpeech({ key: "k", region: "eastus", fetchImpl: azure.fetchImpl }));
  for (const voice of ["ar-EG-SalmaNeural", "ar-EG-ShakirNeural", "ar-JO-SanaNeural", "ar-JO-TaimNeural"]) {
    await (await say(ctx, { text: `مرحباً ${voice}`, voice })).arrayBuffer();
  }
  assert.equal(azure.calls.length, 4);
  azure.calls.forEach(call => assert.match(call.body, /<voice name="ar-SA-HamedNeural">/));
  // even if an administrator sets a dialect voice as the default
  assert.equal(createSpeech({ key: "k", region: "eastus", defaultVoice: "ar-EG-SalmaNeural" }).defaultVoice, "ar-SA-HamedNeural");
});

test("unknown voices fall back to the default; validation and auth", async () => {
  const azure = fakeAzure();
  const ctx = await start(createSpeech({ key: "k", region: "eastus", fetchImpl: azure.fetchImpl }));
  await (await say(ctx, { text: "مرحباً", voice: "<evil/>" })).arrayBuffer();
  assert.match(azure.calls[0].body, /voice name="ar-SA-HamedNeural"/);
  assert.equal((await say(ctx, { text: "" })).status, 400);
  assert.equal((await say(ctx, { text: "ا".repeat(601) })).status, 413);
  assert.equal((await say({ base: ctx.base }, { text: "مرحباً" })).status, 401);
});

test("Azure errors become readable messages; disabled when unconfigured", async () => {
  const ctx = await start(createSpeech({ key: "bad", region: "eastus", fetchImpl: fakeAzure({ status: 401 }).fetchImpl }));
  const res = await say(ctx, { text: "مرحباً" });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /AZURE_SPEECH_KEY/);

  assert.equal(createSpeech({}), null);
  const off = await start(null);
  assert.equal((await (await fetch(`${off.base}/api/config`)).json()).tts.enabled, false);
  assert.equal((await say(off, { text: "مرحباً" })).status, 503);
});

test("only new (uncached) audio counts against a student's limit", async () => {
  const azure = fakeAzure();
  const ctx = await start(createSpeech({ key: "k", region: "eastus", fetchImpl: azure.fetchImpl, perTenMinutes: 2 }));
  for (let i = 0; i < 5; i++) assert.equal((await say(ctx, { text: "قلم" })).status, 200); // same word: 1 miss, 4 hits
  assert.equal((await say(ctx, { text: "باب" })).status, 200);
  assert.equal((await say(ctx, { text: "بيت" })).status, 429);
});
