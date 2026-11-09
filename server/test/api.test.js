import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";

let server;
let base;

before(async () => {
  const app = createApp({ db: openDatabase(":memory:"), allowedDomain: "dartmouth.edu", teacherAccessCode: "TEACH-123" });
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** Tiny client that keeps its own cookie, like a browser. */
function client() {
  let cookie = "";
  return async (method, path, body, { csrf = true } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(csrf ? { "x-requested-with": "dalt" } : {}), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data, setCookie };
  };
}

test("student signup, session cookie, me, logout", async () => {
  const api = client();
  const signup = await api("POST", "/api/auth/signup", { name: "Layla", email: "Layla@Dartmouth.edu", password: "password123" });
  assert.equal(signup.status, 201);
  assert.equal(signup.data.user.email, "layla@dartmouth.edu");
  assert.equal(signup.data.user.role, "student");
  assert.match(signup.setCookie, /HttpOnly/i);
  assert.match(signup.setCookie, /SameSite=Lax/i);
  assert.equal((await api("GET", "/api/me")).data.user.name, "Layla");
  assert.equal((await api("POST", "/api/auth/logout")).status, 200);
  assert.equal((await api("GET", "/api/me")).status, 401);
});

test("signup validation: domain, duplicate, short password", async () => {
  const api = client();
  assert.equal((await api("POST", "/api/auth/signup", { name: "X", email: "x@gmail.com", password: "password123" })).status, 400);
  assert.equal((await api("POST", "/api/auth/signup", { name: "X", email: "short@dartmouth.edu", password: "123" })).status, 400);
  await api("POST", "/api/auth/signup", { name: "Dup", email: "dup@dartmouth.edu", password: "password123" });
  assert.equal((await client()("POST", "/api/auth/signup", { name: "Dup", email: "DUP@dartmouth.edu", password: "password123" })).status, 409);
});

test("login checks password and does not leak which part was wrong", async () => {
  await client()("POST", "/api/auth/signup", { name: "Omar", email: "omar@dartmouth.edu", password: "password123" });
  const api = client();
  const wrong = await api("POST", "/api/auth/login", { email: "omar@dartmouth.edu", password: "nope-nope" });
  const missing = await api("POST", "/api/auth/login", { email: "ghost@dartmouth.edu", password: "nope-nope" });
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.equal(wrong.data.error, missing.data.error);
  assert.equal((await api("POST", "/api/auth/login", { email: "OMAR@dartmouth.edu", password: "password123" })).status, 200);
  assert.equal((await api("POST", "/api/auth/login", { email: "omar@dartmouth.edu", password: "password123", role: "teacher" })).status, 403);
});

test("mutations without the CSRF header are rejected", async () => {
  const res = await client()("POST", "/api/auth/signup", { name: "C", email: "c@dartmouth.edu", password: "password123" }, { csrf: false });
  assert.equal(res.status, 403);
});

test("login is rate limited", async () => {
  await client()("POST", "/api/auth/signup", { name: "Rate", email: "rate@dartmouth.edu", password: "password123" });
  const api = client();
  let last;
  for (let i = 0; i < 11; i++) last = await api("POST", "/api/auth/login", { email: "rate@dartmouth.edu", password: "wrong-password" });
  assert.equal(last.status, 429);
});

test("learner state is private per user and whitelisted", async () => {
  const a = client();
  const b = client();
  await a("POST", "/api/auth/signup", { name: "A", email: "a@dartmouth.edu", password: "password123" });
  await b("POST", "/api/auth/signup", { name: "B", email: "b@dartmouth.edu", password: "password123" });
  const progress = { days: ["ab:day:1", "ab:day:2"], passedUnits: [], studyDates: ["2026-11-07"], assessmentScores: [] };
  assert.equal((await a("PUT", "/api/state/dalt-curriculum-progress-v1", { value: progress })).status, 200);
  assert.equal((await a("PUT", "/api/state/evil-key", { value: 1 })).status, 400);
  assert.deepEqual((await a("GET", "/api/state")).data.state["dalt-curriculum-progress-v1"], progress);
  assert.deepEqual((await b("GET", "/api/state")).data.state, {});
  assert.equal((await client()("GET", "/api/state")).status, 401);
});

test("teacher signup needs the access code; classes, join, classwork, submissions, roster", async () => {
  const teacher = client();
  assert.equal((await teacher("POST", "/api/auth/teacher-signup", { name: "Prof", email: "prof@dartmouth.edu", password: "password123", accessCode: "WRONG" })).status, 403);
  const made = await teacher("POST", "/api/auth/teacher-signup", { name: "Prof", email: "prof@dartmouth.edu", password: "password123", accessCode: "TEACH-123" });
  assert.equal(made.data.user.role, "teacher");

  const student = client();
  await student("POST", "/api/auth/signup", { name: "Sami", email: "sami@dartmouth.edu", password: "password123" });
  assert.equal((await student("GET", "/api/teacher/classes")).status, 403);
  assert.equal((await student("POST", "/api/teacher/classes", { name: "Hack" })).status, 403);

  const created = await teacher("POST", "/api/teacher/classes", { name: "ARAB 1", course: "Alif Baa" });
  const { id: classId, code } = created.data.class;
  assert.match(code, /^[A-Z2-9]{6}$/);

  await teacher("POST", "/api/teacher/lessons", { classId, unitKey: "ab", dayNumber: 1, title: "Greetings", steps: [{ title: "Warm-up", body: "Say hello" }] });
  await teacher("POST", "/api/teacher/homework", { classId, unitKey: "ab", dayNumber: 2, title: "Dorm", instructions: "Describe your dorm." });

  // not a member yet → no classwork
  assert.equal((await student("GET", "/api/classwork?unit=ab&day=2")).data.homework, null);
  assert.equal((await student("POST", "/api/classes/join", { code: "NOPE00" })).status, 404);
  assert.equal((await student("POST", "/api/classes/join", { code: code.toLowerCase() })).data.class.name, "ARAB 1");

  const day1 = await student("GET", "/api/classwork?unit=ab&day=1");
  assert.equal(day1.data.lesson.title, "Greetings");
  const day2 = await student("GET", "/api/classwork?unit=ab&day=2");
  assert.equal(day2.data.homework.mySubmission, null);
  assert.equal((await student("POST", `/api/homework/${day2.data.homework.id}/submit`, { response: "غرفتي صغيرة" })).status, 200);
  assert.equal((await student("GET", "/api/classwork?unit=ab&day=2")).data.homework.mySubmission.response, "غرفتي صغيرة");

  await student("PUT", "/api/state/dalt-curriculum-progress-v1", { value: { days: ["ab:day:1", "ab:day:2"], passedUnits: ["ab"], studyDates: [], assessmentScores: [{ unitTitle: "Alif Baa", score: 87 }] } });
  const roster = (await teacher("GET", "/api/teacher/classes")).data.classes[0];
  assert.equal(roster.students[0].name, "Sami");
  assert.equal(roster.students[0].progress.completedDays, 2);
  assert.equal(roster.students[0].progress.passedUnits, 1);
  assert.equal(roster.students[0].progress.latestScore.score, 87);
  assert.equal(roster.homework[0].submissions[0].response, "غرفتي صغيرة");

  // another teacher can't touch this class
  const other = client();
  await other("POST", "/api/auth/teacher-signup", { name: "Other", email: "other@dartmouth.edu", password: "password123", accessCode: "TEACH-123" });
  assert.equal((await other("POST", "/api/teacher/homework", { classId, unitKey: "ab", dayNumber: 3, title: "x", instructions: "y" })).status, 404);
  assert.equal((await other("GET", "/api/teacher/classes")).data.classes.length, 0);
});

test("password hashes are not stored in plain text", async () => {
  const db = openDatabase(":memory:");
  const app = createApp({ db, teacherAccessCode: "x" });
  const srv = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  await fetch(`http://127.0.0.1:${srv.address().port}/api/auth/signup`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "dalt" }, body: JSON.stringify({ name: "H", email: "h@dartmouth.edu", password: "password123" }) });
  const row = db.prepare("SELECT password_hash FROM users").get();
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes("password123"));
  const session = db.prepare("SELECT token_hash FROM sessions").get();
  assert.match(session.token_hash, /^[0-9a-f]{64}$/);
  srv.close();
});

test("nightly backup writes a readable copy and keeps only the newest N", async () => {
  const { mkdtempSync, readdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { backupNow } = await import("../src/backup.js");
  const dir = mkdtempSync(join(tmpdir(), "dalt-db-"));
  const db = openDatabase(join(dir, "live.db"));
  db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES ('b@dartmouth.edu', 'B', 'student', 'x')").run();
  const backups = join(dir, "backups");
  let last;
  for (let day = 1; day <= 9; day++) last = backupNow(db, backups, 7, new Date(Date.UTC(2026, 10, day, 3)));
  const files = readdirSync(backups);
  assert.equal(files.length, 7);
  assert.ok(!files.some(name => name.includes("2026-11-01") || name.includes("2026-11-02")));
  const copy = openDatabase(last);
  assert.equal(copy.prepare("SELECT email FROM users").get().email, "b@dartmouth.edu");
});
