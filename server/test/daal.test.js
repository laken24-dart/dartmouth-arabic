import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { createDaal } from "../src/daal.js";

/** Stand-in for the Anthropic client: records each request and streams a scripted reply. */
function fakeClient(script = () => ({ text: ["أهلاً! ", "Ahlan — hello."], stop: "end_turn" })) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params, options) {
          calls.push({ params, options });
          const { text, stop, fallbackAfter } = script(params);
          const events = [];
          text.forEach((chunk, index) => {
            if (fallbackAfter === index) events.push({ type: "content_block_start", index: 1, content_block: { type: "fallback" } });
            events.push({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: chunk } });
          });
          return {
            async *[Symbol.asyncIterator]() { for (const event of events) yield event; },
            finalMessage: async () => ({ stop_reason: stop, usage: { input_tokens: 10, cache_read_input_tokens: 9000, output_tokens: 5 } })
          };
        }
      }
    }
  };
}

let base;
let servers = [];
async function start(daal) {
  const app = createApp({ db: openDatabase(":memory:"), teacherAccessCode: "T", daal });
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
after(() => servers.forEach(server => server.close()));

async function signedIn(url) {
  const res = await fetch(`${url}/api/auth/signup`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "dalt" }, body: JSON.stringify({ name: "Layla", email: `l${Math.random()}@dartmouth.edu`, password: "password123" }) });
  return res.headers.get("set-cookie").split(";")[0];
}

const chat = (url, cookie, body) => fetch(`${url}/api/daal/chat`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "dalt", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const events = async res => (await res.text()).split("\n\n").filter(Boolean).map(chunk => JSON.parse(chunk.replace(/^data: /, "")));

let client;
before(async () => {
  client = fakeClient();
  base = await start(createDaal({ client, perTenMinutes: 5 }));
});

test("config reports Daal on/off", async () => {
  assert.equal((await (await fetch(`${base}/api/config`)).json()).daal.enabled, true);
  const off = await start(null);
  assert.equal((await (await fetch(`${off}/api/config`)).json()).daal.enabled, false);
  const res = await chat(off, await signedIn(off), { mode: "ask", messages: [{ role: "user", content: "hi" }] });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
});

test("requires sign-in and a valid conversation", async () => {
  assert.equal((await chat(base, "", { mode: "ask", messages: [{ role: "user", content: "hi" }] })).status, 401);
  const cookie = await signedIn(base);
  assert.equal((await chat(base, cookie, { mode: "ask", messages: [] })).status, 400);
  assert.equal((await chat(base, cookie, { mode: "ask", messages: [{ role: "assistant", content: "only me" }] })).status, 400);
});

test("streams Daal's reply and sends the right request to Claude", async () => {
  const cookie = await signedIn(base);
  const res = await chat(base, cookie, {
    mode: "converse",
    messages: [{ role: "assistant", content: "ignored leading assistant turn" }, { role: "user", content: "مرحباً" }],
    context: { unitKey: "3", unitTitle: "Lesson 3", scenario: "Ordering coffee at Collis", recentMisses: ["أخ"] }
  });
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const stream = await events(res);
  assert.equal(stream.filter(e => e.type === "text").map(e => e.text).join(""), "أهلاً! Ahlan — hello.");
  assert.equal(stream.at(-1).type, "done");
  assert.equal(stream.at(-1).usage.cacheRead, 9000);

  const { params, options } = client.calls.at(-1);
  assert.equal(params.model, "claude-opus-5-5");
  assert.equal(params.fallbacks, "default");
  assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(params.output_config.effort, "low");
  assert.equal(params.thinking, undefined); // Opus 5.5 always thinks adaptively; never send disabled/budget_tokens
  assert.deepEqual(params.system[0].cache_control, { type: "ephemeral" });
  assert.ok(params.system[0].text.includes("## 19 | Lesson 19")); // full course vocabulary is in the cached prefix
  assert.ok(params.system[0].text.includes("Academic integrity"));
  assert.match(params.system[1].text, /conversation practice/);
  assert.match(params.system[1].text, /Lesson 3/);
  assert.match(params.system[1].text, /Collis/);
  assert.deepEqual(params.messages, [{ role: "user", content: "مرحباً" }]);
  assert.ok(options.signal instanceof AbortSignal);
});

test("the cached system prefix is identical across students and modes", async () => {
  const first = client.calls.at(-1).params.system[0].text;
  await events(await chat(base, await signedIn(base), { mode: "quiz", messages: [{ role: "user", content: "quiz me" }], context: { unitKey: "ab", unitTitle: "Alif Baa" } }));
  assert.equal(client.calls.at(-1).params.system[0].text, first);
});

test("explain mode builds the question for Claude", async () => {
  await events(await chat(base, await signedIn(base), {
    mode: "explain",
    question: { kind: "sentence", prompt: "عندي ___ واحد وأخت واحدة.", translation: "I have one brother and one sister.", options: ["أخ", "باب", "بيت", "واجبات"], chosen: "باب", correct: "أخ" }
  }));
  const { params } = client.calls.at(-1);
  assert.equal(params.messages.length, 1);
  assert.match(params.messages[0].content, /I chose: باب/);
  assert.match(params.messages[0].content, /Correct answer: أخ/);
  assert.match(params.system[1].text, /explain a missed question/);
});

test("a mid-reply fallback resets the text; a refusal becomes a friendly message", async () => {
  const fallback = fakeClient(() => ({ text: ["partial from first model", "Full answer."], stop: "end_turn", fallbackAfter: 1 }));
  const url = await start(createDaal({ client: fallback }));
  const stream = await events(await chat(url, await signedIn(url), { mode: "ask", messages: [{ role: "user", content: "hi" }] }));
  assert.deepEqual(stream.map(e => e.type), ["text", "reset", "text", "done"]);

  const refusing = fakeClient(() => ({ text: [], stop: "refusal" }));
  const url2 = await start(createDaal({ client: refusing }));
  const refused = await events(await chat(url2, await signedIn(url2), { mode: "ask", messages: [{ role: "user", content: "hi" }] }));
  assert.match(refused.find(e => e.type === "text").text, /back to Arabic/);
});

test("API errors become a readable message instead of a crash", async () => {
  const broken = { beta: { messages: { stream() { return { async *[Symbol.asyncIterator]() { throw new Error("boom"); }, finalMessage: async () => ({}) }; } } } };
  const url = await start(createDaal({ client: broken }));
  const stream = await events(await chat(url, await signedIn(url), { mode: "ask", messages: [{ role: "user", content: "hi" }] }));
  assert.equal(stream[0].type, "error");
  assert.match(stream[0].error, /problem answering/);
});

test("per-student rate limit", async () => {
  const cookie = await signedIn(base);
  let last;
  for (let i = 0; i < 6; i++) { last = await chat(base, cookie, { mode: "ask", messages: [{ role: "user", content: "hi" }] }); if (last.status === 200) await last.text(); }
  assert.equal(last.status, 429);
  assert.match((await last.json()).error, /break/);
});

test("the real Anthropic SDK builds a valid streaming request (network intercepted)", async () => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const captured = {};
  const sse = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0, cache_read_input_tokens: 9100 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "كتاب means book." } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 6 } }],
    ["message_stop", { type: "message_stop" }]
  ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  const sdk = new Anthropic({
    apiKey: "sk-test",
    fetch: async (url, init) => {
      captured.url = String(url);
      captured.headers = Object.fromEntries(new Headers(init.headers).entries());
      captured.body = JSON.parse(init.body);
      return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
  });
  const url = await start(createDaal({ client: sdk }));
  const stream = await events(await chat(url, await signedIn(url), { mode: "ask", messages: [{ role: "user", content: "What does كتاب mean?" }], context: { unitKey: "ab", unitTitle: "Alif Baa" } }));
  assert.equal(stream.filter(e => e.type === "text").map(e => e.text).join(""), "كتاب means book.");
  assert.equal(stream.at(-1).usage.cacheRead, 9100);
  assert.match(captured.url, /\/v1\/messages/);
  assert.equal(captured.headers.authorization, "Bearer sk-test"); // SDK 1.x sends the key as a bearer token
  assert.equal(captured.headers["anthropic-version"], "2026-10-21");
  assert.match(captured.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.equal(captured.body.stream, true);
  assert.equal(captured.body.model, "claude-opus-5-5");
  assert.equal(captured.body.fallbacks, "default");
  assert.deepEqual(captured.body.output_config, { effort: "low" });
  assert.equal(captured.body.max_tokens, 4000);
  assert.equal(captured.body.betas, undefined); // the SDK moves betas into the header
  assert.deepEqual(captured.body.system[0].cache_control, { type: "ephemeral" });
});
