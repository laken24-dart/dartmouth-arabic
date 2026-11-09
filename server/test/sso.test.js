import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { createSso } from "../src/sso.js";
import { buildSignedResponse, mockIdpKeys } from "../dev/mock-idp.js";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let db;
let keys;

before(async () => {
  keys = mockIdpKeys(mkdtempSync(join(tmpdir(), "dalt-idp-")));
  db = openDatabase(":memory:");
  const sso = createSso({ SAML_ENTRY_POINT: "http://localhost:8790/sso", SAML_IDP_CERT: keys.cert, PUBLIC_URL: BASE });
  const app = createApp({ db, allowedDomain: "dartmouth.edu", teacherAccessCode: "TEACH-123", sso, passwordLogin: false, teacherEmails: ["prof.allowed@dartmouth.edu"] });
  await new Promise(resolve => { server = app.listen(PORT, "127.0.0.1", resolve); });
});
after(() => server.close());

/** Starts SSO like a browser would; returns what Dartmouth would receive plus the browser's cookie. */
async function startLogin(intent = "student") {
  const res = await fetch(`${BASE}/api/auth/sso/login?intent=${intent}`, { redirect: "manual" });
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get("location"));
  const xml = inflateRawSync(Buffer.from(location.searchParams.get("SAMLRequest"), "base64")).toString();
  return {
    requestId: xml.match(/\sID="([^"]+)"/)[1],
    acs: xml.match(/AssertionConsumerServiceURL="([^"]+)"/)[1],
    audience: xml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)</)[1],
    relay: location.searchParams.get("RelayState"),
    ssoCookie: res.headers.get("set-cookie").split(";")[0]
  };
}

async function finishLogin(login, person, { cookie = login.ssoCookie, samlResponse } = {}) {
  const body = new URLSearchParams({
    SAMLResponse: samlResponse ?? buildSignedResponse({ ...keys, inResponseTo: login.requestId, acs: login.acs, audience: login.audience, ...person }),
    RelayState: login.relay
  });
  const res = await fetch(login.acs, { method: "POST", redirect: "manual", body, headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) } });
  const session = (res.headers.get("set-cookie") || "").split(",").map(part => part.trim()).find(part => part.startsWith("dalt_sid="));
  return { status: res.status, location: res.headers.get("location"), sessionCookie: session?.split(";")[0] };
}

const me = async cookie => (await fetch(`${BASE}/api/me`, { headers: { cookie } })).json();
const layla = { email: "layla.haddad@dartmouth.edu", name: "Layla Haddad", netId: "f00abcd" };

test("config advertises SSO and password login off", async () => {
  const config = await (await fetch(`${BASE}/api/config`)).json();
  assert.deepEqual(config.sso, { enabled: true, label: "Dartmouth" });
  assert.equal(config.passwordLogin, false);
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "dalt" }, body: "{}" });
  assert.equal(res.status, 403);
});

test("metadata tells Dartmouth where to send sign-ins", async () => {
  const xml = await (await fetch(`${BASE}/api/auth/sso/metadata`)).text();
  assert.match(xml, /EntityDescriptor/);
  assert.ok(xml.includes(`${BASE}/api/auth/sso/callback`));
});

test("a valid Dartmouth sign-in creates the account and a session", async () => {
  const login = await startLogin();
  assert.match(login.ssoCookie, /^dalt_sso=/);
  const result = await finishLogin(login, layla);
  assert.equal(result.status, 303);
  assert.equal(result.location, "/#/");
  const data = await me(result.sessionCookie);
  assert.equal(data.user.email, "layla.haddad@dartmouth.edu");
  assert.equal(data.user.name, "Layla Haddad");
  assert.equal(data.user.role, "student");
  // signing in again reuses the same account
  const again = await finishLogin(await startLogin(), layla);
  assert.equal((await me(again.sessionCookie)).user.id, data.user.id);
});

test("a replayed response is rejected", async () => {
  const login = await startLogin();
  const samlResponse = buildSignedResponse({ ...keys, inResponseTo: login.requestId, acs: login.acs, audience: login.audience, ...layla });
  assert.equal((await finishLogin(login, layla, { samlResponse })).location, "/#/");
  const replay = await finishLogin(login, layla, { samlResponse });
  assert.match(replay.location, /sso_error/);
  assert.equal(replay.sessionCookie, undefined);
});

test("an edited (tampered) assertion is rejected", async () => {
  const login = await startLogin();
  const signed = Buffer.from(buildSignedResponse({ ...keys, inResponseTo: login.requestId, acs: login.acs, audience: login.audience, ...layla }), "base64").toString();
  const forged = Buffer.from(signed.replace("layla.haddad@dartmouth.edu", "president@dartmouth.edu")).toString("base64");
  const result = await finishLogin(login, layla, { samlResponse: forged });
  assert.match(result.location, /sso_error/);
  assert.equal(result.sessionCookie, undefined);
});

test("a response signed by someone other than Dartmouth is rejected", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dalt-evil-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k"), "-out", join(dir, "c"), "-days", "1", "-subj", "/CN=evil"], { stdio: "ignore" });
  const evil = { key: readFileSync(join(dir, "k"), "utf8"), cert: readFileSync(join(dir, "c"), "utf8") };
  const login = await startLogin();
  const samlResponse = buildSignedResponse({ ...evil, inResponseTo: login.requestId, acs: login.acs, audience: login.audience, ...layla });
  const result = await finishLogin(login, layla, { samlResponse });
  assert.match(result.location, /sso_error/);
  assert.equal(result.sessionCookie, undefined);
});

test("a sign-in finished in a different browser is rejected", async () => {
  const result = await finishLogin(await startLogin(), layla, { cookie: "" });
  assert.match(decodeURIComponent(result.location), /this browser/);
  assert.equal(result.sessionCookie, undefined);
});

test("non-Dartmouth emails are rejected", async () => {
  const result = await finishLogin(await startLogin(), { email: "someone@gmail.com", name: "Someone", netId: "x1" });
  assert.match(decodeURIComponent(result.location), /@dartmouth\.edu/);
});

test("instructors: allowlisted emails become teachers; others unlock with the access code", async () => {
  const allowed = await finishLogin(await startLogin("teacher"), { email: "prof.allowed@dartmouth.edu", name: "Prof Allowed", netId: "d11111" });
  assert.equal(allowed.location, "/#/teach");
  assert.equal((await me(allowed.sessionCookie)).user.role, "teacher");

  const other = await finishLogin(await startLogin("teacher"), { email: "new.prof@dartmouth.edu", name: "New Prof", netId: "d22222" });
  assert.equal(other.location, "/#/teach/login?claim=1");
  const claim = body => fetch(`${BASE}/api/auth/claim-teacher`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "dalt", cookie: other.sessionCookie }, body: JSON.stringify(body) });
  assert.equal((await claim({ accessCode: "wrong" })).status, 403);
  assert.equal((await claim({ accessCode: "TEACH-123" })).status, 200);
  assert.equal((await me(other.sessionCookie)).user.role, "teacher");
});

test("an existing email+password account is linked, not duplicated", async () => {
  db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, 'student', 'scrypt$x')").run("old.account@dartmouth.edu", "Old Account");
  const before = db.prepare("SELECT id FROM users WHERE email = ?").get("old.account@dartmouth.edu").id;
  const result = await finishLogin(await startLogin(), { email: "old.account@dartmouth.edu", name: "Old Account", netId: "f00old" });
  assert.equal((await me(result.sessionCookie)).user.id, before);
  assert.ok(db.prepare("SELECT sso_id FROM users WHERE id = ?").get(before).sso_id);
});
