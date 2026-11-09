import express from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLimiter, hashPassword, makeJoinCode, newToken, sha256, verifyPassword } from "./security.js";
import { DAAL_MODES, apiErrorMessage, cleanMessages } from "./daal.js";

const SESSION_COOKIE = "dalt_sid";
const SSO_COOKIE = "dalt_sso";
const SESSION_DAYS = 30;
// Per-learner documents the client may store. Anything else is rejected.
export const STATE_KEYS = new Set([
  "dalt-curriculum-progress-v1", "dalt-curriculum-used-items-v1", "dalt-curriculum-assessed-words-v1",
  "dalt-curriculum-assessed-grammar-v1", "dalt-spaced-review-v1", "ak-known", "ak-sel", "ak-dir", "ak-qdir",
  "ak-auto", "ak-rate", "dalt-deem-introduced-v1", "dalt-tts-voice"
]);
const MAX_STATE_BYTES = 512 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const cleanEmail = value => clean(value, 254).toLowerCase();
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(part => part.trim().split("=")).filter(([k, v]) => k && v).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}

/**
 * options: { db, allowedDomain ("dartmouth.edu" or ""), teacherAccessCode, staticDir, secureCookies,
 *            sso (from createSso, or null), passwordLogin (bool), teacherEmails (array of emails) }
 */
export function createApp({ db, allowedDomain = "dartmouth.edu", teacherAccessCode, staticDir, secureCookies = false, sso = null, passwordLogin = true, teacherEmails = [], daal = null, speech = null }) {
  const teacherAllowlist = new Set(teacherEmails.map(email => email.trim().toLowerCase()).filter(Boolean));
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback, linklocal, uniquelocal");
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/auth/sso/callback", express.urlencoded({ extended: false, limit: "2mb" }));

  const loginLimiter = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
  const signupLimiter = createLimiter({ max: 20, windowMs: 60 * 60 * 1000 });
  const checkLimiter = createLimiter({ max: 60, windowMs: 15 * 60 * 1000 });

  const q = {
    userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
    userById: db.prepare("SELECT id, email, name, role FROM users WHERE id = ?"),
    insertUser: db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)"),
    insertSsoUser: db.prepare("INSERT INTO users (email, name, role, password_hash, sso_id) VALUES (?, ?, ?, '', ?)"),
    userBySso: db.prepare("SELECT * FROM users WHERE sso_id = ?"),
    linkSso: db.prepare("UPDATE users SET sso_id = ?, name = CASE WHEN name = '' THEN ? ELSE name END WHERE id = ?"),
    setRole: db.prepare("UPDATE users SET role = ? WHERE id = ?"),
    insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"),
    sessionUser: db.prepare("SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    purgeSessions: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),
    allState: db.prepare("SELECT key, value FROM user_state WHERE user_id = ?"),
    putState: db.prepare("INSERT INTO user_state (user_id, key, value, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"),
    getState: db.prepare("SELECT value FROM user_state WHERE user_id = ? AND key = ?"),
    classByCode: db.prepare("SELECT * FROM classes WHERE code = ? COLLATE NOCASE"),
    classById: db.prepare("SELECT * FROM classes WHERE id = ?"),
    codeExists: db.prepare("SELECT 1 FROM classes WHERE code = ?"),
    insertClass: db.prepare("INSERT INTO classes (id, owner_id, name, course, description, code) VALUES (?, ?, ?, ?, ?, ?)"),
    deleteClass: db.prepare("DELETE FROM classes WHERE id = ? AND owner_id = ?"),
    ownedClasses: db.prepare("SELECT * FROM classes WHERE owner_id = ? ORDER BY created_at"),
    joinClass: db.prepare("INSERT OR IGNORE INTO memberships (class_id, user_id) VALUES (?, ?)"),
    myClasses: db.prepare("SELECT c.id, c.name, c.course, c.code FROM memberships m JOIN classes c ON c.id = m.class_id WHERE m.user_id = ? ORDER BY m.joined_at"),
    roster: db.prepare("SELECT u.id, u.name, u.email, m.joined_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.class_id = ? ORDER BY u.name"),
    upsertLesson: db.prepare(`INSERT INTO lesson_plans (id, class_id, unit_key, day_number, title, source, steps) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (class_id, unit_key, day_number) DO UPDATE SET title = excluded.title, source = excluded.source, steps = excluded.steps, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`),
    upsertHomework: db.prepare(`INSERT INTO homework (id, class_id, unit_key, day_number, title, instructions, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (class_id, unit_key, day_number) DO UPDATE SET title = excluded.title, instructions = excluded.instructions, due_date = excluded.due_date, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`),
    lessonsForClass: db.prepare("SELECT * FROM lesson_plans WHERE class_id = ? ORDER BY unit_key, day_number"),
    homeworkForClass: db.prepare("SELECT * FROM homework WHERE class_id = ? ORDER BY unit_key, day_number"),
    deleteLesson: db.prepare("DELETE FROM lesson_plans WHERE id = ? AND class_id IN (SELECT id FROM classes WHERE owner_id = ?)"),
    deleteHomework: db.prepare("DELETE FROM homework WHERE id = ? AND class_id IN (SELECT id FROM classes WHERE owner_id = ?)"),
    submissionsFor: db.prepare("SELECT s.response, s.submitted_at, u.name, u.email FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.homework_id = ? ORDER BY s.submitted_at"),
    classworkLesson: db.prepare("SELECT l.* FROM lesson_plans l JOIN memberships m ON m.class_id = l.class_id WHERE m.user_id = ? AND l.unit_key = ? AND l.day_number = ? ORDER BY l.updated_at DESC LIMIT 1"),
    classworkHomework: db.prepare("SELECT h.* FROM homework h JOIN memberships m ON m.class_id = h.class_id WHERE m.user_id = ? AND h.unit_key = ? AND h.day_number = ? ORDER BY h.updated_at DESC LIMIT 1"),
    homeworkForMember: db.prepare("SELECT h.* FROM homework h JOIN memberships m ON m.class_id = h.class_id WHERE h.id = ? AND m.user_id = ?"),
    mySubmission: db.prepare("SELECT response, submitted_at FROM submissions WHERE homework_id = ? AND user_id = ?"),
    upsertSubmission: db.prepare(`INSERT INTO submissions (homework_id, user_id, response) VALUES (?, ?, ?)
      ON CONFLICT (homework_id, user_id) DO UPDATE SET response = excluded.response, submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
  };

  const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role });

  function startSession(res, userId) {
    const token = newToken();
    const now = Date.now();
    q.insertSession.run(sha256(token), userId, now + SESSION_DAYS * 86400000, now);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/", maxAge: SESSION_DAYS * 86400000 });
  }

  function domainOk(email) {
    return !allowedDomain || email.endsWith(`@${allowedDomain.toLowerCase()}`);
  }

  function validateNewAccount({ name, email, password }) {
    if (!name) fail(400, "Please enter your name.");
    if (!isEmail(email)) fail(400, "Enter a valid email address.");
    if (!domainOk(email)) fail(400, `Use your @${allowedDomain} email address.`);
    if (password.length < 8) fail(400, "Passwords need at least 8 characters.");
    if (password.length > 200) fail(400, "That password is too long.");
    if (q.userByEmail.get(email)) fail(409, "An account with this email already exists. Sign in instead.");
  }

  /* ---------- middleware ---------- */
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    // CSRF guard: cross-site pages can't send this header without a CORS preflight, which we never approve.
    // The SSO callback is a cross-site POST from Dartmouth's login page; it is protected by the signed SAML response,
    // its one-time InResponseTo id, and the dalt_sso browser-binding cookie instead.
    const isSsoCallback = req.path === "/auth/sso/callback";
    if (!isSsoCallback && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("x-requested-with") !== "dalt") return next(new HttpError(403, "Missing request header."));
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const row = q.sessionUser.get(sha256(token));
      if (row && row.expires_at > Date.now()) req.user = publicUser(row);
      else if (row) q.deleteSession.run(sha256(token));
    }
    req.sessionToken = token;
    next();
  });

  const requireUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, "Please sign in.")));
  const requireTeacher = (req, res, next) => (req.user?.role === "teacher" ? next() : next(new HttpError(req.user ? 403 : 401, "Instructor access only.")));
  const route = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

  /* ---------- auth ---------- */
  app.get("/api/health", (req, res) => res.json({ ok: true }));

  app.get("/api/config", (req, res) => res.json({ allowedDomain, passwordLogin, sso: sso ? { enabled: true, label: sso.label } : { enabled: false }, daal: { enabled: Boolean(daal) }, tts: speech ? { enabled: true, provider: "azure", voices: speech.voices, defaultVoice: speech.defaultVoice } : { enabled: false } }));

  const requirePasswordLogin = (req, res, next) => (passwordLogin ? next() : next(new HttpError(403, "Use “Sign in with Dartmouth” to sign in.")));
  app.use(["/api/auth/check", "/api/auth/signup", "/api/auth/teacher-signup", "/api/auth/login"], requirePasswordLogin);

  /* ---------- Dartmouth SSO (SAML) ---------- */
  const relays = new Map(); // relay token -> { intent, expires }
  const ssoLimiter = createLimiter({ max: 60, windowMs: 15 * 60 * 1000 });
  const ssoRedirect = (res, intent, error) => {
    const base = intent === "teacher" ? "/#/teach/login" : "/#/welcome";
    res.redirect(303, `${base}?sso_error=${encodeURIComponent(error)}`);
  };

  app.get("/api/auth/sso/metadata", (req, res) => {
    if (!sso) return res.status(404).json({ error: "Single sign-on isn’t configured." });
    res.type("application/xml").send(sso.metadata());
  });

  app.get("/api/auth/sso/login", route(async (req, res) => {
    if (!sso) fail(404, "Single sign-on isn’t configured.");
    if (!ssoLimiter.hit(req.ip)) fail(429, "Too many sign-in attempts. Try again in a few minutes.");
    const intent = req.query.intent === "teacher" ? "teacher" : "student";
    const relay = newToken();
    const now = Date.now();
    for (const [key, value] of relays) if (value.expires < now) relays.delete(key);
    relays.set(relay, { intent, expires: now + 10 * 60 * 1000 });
    // SameSite=None so the cookie survives the cross-site POST back from Dartmouth (browsers allow Secure on localhost).
    res.cookie(SSO_COOKIE, relay, { httpOnly: true, sameSite: "none", secure: true, path: "/api/auth/sso", maxAge: 10 * 60 * 1000 });
    res.redirect(302, await sso.loginUrl(relay));
  }));

  app.post("/api/auth/sso/callback", async (req, res) => {
    const relayToken = String(req.body?.RelayState || "");
    const relay = relays.get(relayToken);
    relays.delete(relayToken);
    const intent = relay?.intent || "student";
    res.clearCookie(SSO_COOKIE, { path: "/api/auth/sso", sameSite: "none", secure: true });
    try {
      if (!sso) throw new Error("Single sign-on isn’t configured.");
      if (!relay || relay.expires < Date.now()) throw new Error("That sign-in link expired. Please try again.");
      if (parseCookies(req.headers.cookie)[SSO_COOKIE] !== relayToken) throw new Error("Please start the sign-in from this browser.");
      const { email, name, ssoId } = await sso.readResponse(req.body);
      if (!domainOk(email)) throw new Error(`Use your @${allowedDomain} account.`);
      let user = q.userBySso.get(ssoId) || q.userByEmail.get(email);
      if (user && !user.sso_id) q.linkSso.run(ssoId, name, user.id);
      if (!user) {
        const role = teacherAllowlist.has(email) ? "teacher" : "student";
        const { lastInsertRowid } = q.insertSsoUser.run(email, clean(name, 80) || email, role, ssoId);
        user = q.userByEmail.get(email) || q.userById.get(lastInsertRowid);
      }
      if (teacherAllowlist.has(email) && user.role !== "teacher") { q.setRole.run("teacher", user.id); user = { ...user, role: "teacher" }; }
      q.purgeSessions.run(Date.now());
      startSession(res, user.id);
      if (intent === "teacher") return res.redirect(303, user.role === "teacher" ? "/#/teach" : "/#/teach/login?claim=1");
      return res.redirect(303, "/#/");
    } catch (error) {
      console.warn("SSO sign-in failed:", error.message);
      const safe = /expired|this browser|@|email|configured/i.test(error.message) ? error.message : "Dartmouth sign-in couldn’t be verified. Please try again.";
      return ssoRedirect(res, intent, safe);
    }
  });

  /** A signed-in (e.g. SSO) user unlocks instructor tools with the access code. */
  const claimLimiter = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
  app.post("/api/auth/claim-teacher", (req, res, next) => (req.user ? next() : next(new HttpError(401, "Please sign in."))), route((req, res) => {
    if (!claimLimiter.hit(`${req.ip}|${req.user.id}`)) fail(429, "Too many attempts. Wait 15 minutes and try again.");
    if (!teacherAccessCode || clean(req.body?.accessCode, 100) !== teacherAccessCode) fail(403, "That instructor access code isn’t right. Ask the department for the current code.");
    q.setRole.run("teacher", req.user.id);
    res.json({ user: { ...req.user, role: "teacher" } });
  }));

  app.post("/api/auth/check", route((req, res) => {
    if (!checkLimiter.hit(req.ip)) fail(429, "Too many requests. Try again in a few minutes.");
    const email = cleanEmail(req.body?.email);
    if (!isEmail(email)) fail(400, "Enter a valid email address.");
    if (!domainOk(email)) fail(400, `Use your @${allowedDomain} email address.`);
    const user = q.userByEmail.get(email);
    res.json({ exists: Boolean(user) });
  }));

  app.post("/api/auth/signup", route(async (req, res) => {
    if (!signupLimiter.hit(req.ip)) fail(429, "Too many sign-ups from this network. Try again later.");
    const name = clean(req.body?.name, 80);
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    validateNewAccount({ name, email, password });
    const { lastInsertRowid } = q.insertUser.run(email, name, "student", await hashPassword(password));
    startSession(res, Number(lastInsertRowid));
    res.status(201).json({ user: publicUser(q.userById.get(lastInsertRowid)) });
  }));

  app.post("/api/auth/teacher-signup", route(async (req, res) => {
    if (!signupLimiter.hit(req.ip)) fail(429, "Too many sign-ups from this network. Try again later.");
    const name = clean(req.body?.name, 80);
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    if (!teacherAccessCode || clean(req.body?.accessCode, 100) !== teacherAccessCode) fail(403, "That instructor access code isn’t right. Ask the department for the current code.");
    validateNewAccount({ name, email, password });
    const { lastInsertRowid } = q.insertUser.run(email, name, "teacher", await hashPassword(password));
    startSession(res, Number(lastInsertRowid));
    res.status(201).json({ user: publicUser(q.userById.get(lastInsertRowid)) });
  }));

  app.post("/api/auth/login", route(async (req, res) => {
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const limitKey = `${req.ip}|${email}`;
    if (!loginLimiter.hit(limitKey)) fail(429, "Too many sign-in attempts. Wait 15 minutes and try again.");
    const user = q.userByEmail.get(email);
    const ok = await verifyPassword(password, user?.password_hash);
    if (!user || !ok) fail(401, "Email or password is incorrect.");
    if (req.body?.role === "teacher" && user.role !== "teacher") fail(403, "This account doesn’t have instructor access.");
    loginLimiter.reset(limitKey);
    q.purgeSessions.run(Date.now());
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  }));

  app.post("/api/auth/logout", route((req, res) => {
    if (req.sessionToken) q.deleteSession.run(sha256(req.sessionToken));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  }));

  app.get("/api/me", requireUser, (req, res) => res.json({ user: req.user, classes: q.myClasses.all(req.user.id) }));

  /* ---------- learner state ---------- */
  app.get("/api/state", requireUser, (req, res) => {
    const state = {};
    for (const row of q.allState.all(req.user.id)) {
      try { state[row.key] = JSON.parse(row.value); } catch { /* skip corrupt row */ }
    }
    res.json({ state });
  });

  app.put("/api/state/:key", requireUser, route((req, res) => {
    const key = req.params.key;
    if (!STATE_KEYS.has(key)) fail(400, "Unknown setting.");
    if (!req.body || !("value" in req.body)) fail(400, "Missing value.");
    const json = JSON.stringify(req.body.value);
    if (Buffer.byteLength(json) > MAX_STATE_BYTES) fail(413, "That’s too much data to save.");
    q.putState.run(req.user.id, key, json);
    res.json({ ok: true });
  }));

  /* ---------- learner classes & classwork ---------- */
  app.post("/api/classes/join", requireUser, route((req, res) => {
    const classroom = q.classByCode.get(clean(req.body?.code, 20).toUpperCase());
    if (!classroom) fail(404, "No class uses that code. Check it with your instructor.");
    q.joinClass.run(classroom.id, req.user.id);
    res.json({ class: { id: classroom.id, name: classroom.name, course: classroom.course, code: classroom.code } });
  }));

  const lessonOut = row => row && { id: row.id, classId: row.class_id, unitKey: row.unit_key, dayNumber: row.day_number, title: row.title, steps: JSON.parse(row.steps), updatedAt: row.updated_at };
  const homeworkOut = row => row && { id: row.id, classId: row.class_id, unitKey: row.unit_key, dayNumber: row.day_number, title: row.title, instructions: row.instructions, dueDate: row.due_date, updatedAt: row.updated_at };

  app.get("/api/classwork", requireUser, (req, res) => {
    const unitKey = clean(req.query.unit, 20);
    const day = Number(req.query.day);
    const lesson = lessonOut(q.classworkLesson.get(req.user.id, unitKey, day));
    const homeworkRow = q.classworkHomework.get(req.user.id, unitKey, day);
    const homework = homeworkOut(homeworkRow);
    if (homework) homework.mySubmission = q.mySubmission.get(homework.id, req.user.id) || null;
    res.json({ lesson: lesson || null, homework: homework || null });
  });

  app.post("/api/homework/:id/submit", requireUser, route((req, res) => {
    const homework = q.homeworkForMember.get(req.params.id, req.user.id);
    if (!homework) fail(404, "This assignment isn’t available to you.");
    const response = clean(req.body?.response, 20000);
    if (!response) fail(400, "Write a response before submitting.");
    q.upsertSubmission.run(homework.id, req.user.id, response);
    res.json({ ok: true });
  }));

  /* ---------- teacher ---------- */
  function progressSummary(userId) {
    const row = q.getState.get(userId, "dalt-curriculum-progress-v1");
    let progress = null;
    try { progress = row ? JSON.parse(row.value) : null; } catch { progress = null; }
    const scores = Array.isArray(progress?.assessmentScores) ? progress.assessmentScores : [];
    return {
      completedDays: Array.isArray(progress?.days) ? new Set(progress.days).size : 0,
      passedUnits: Array.isArray(progress?.passedUnits) ? progress.passedUnits.length : 0,
      studyDays: Array.isArray(progress?.studyDates) ? progress.studyDates.length : 0,
      latestScore: scores.length ? scores[scores.length - 1] : null
    };
  }

  function ownedClass(req) {
    const classroom = q.classById.get(clean(req.body?.classId ?? req.params.id, 60));
    if (!classroom || classroom.owner_id !== req.user.id) fail(404, "Class not found.");
    return classroom;
  }

  app.get("/api/teacher/classes", requireTeacher, (req, res) => {
    const classes = q.ownedClasses.all(req.user.id).map(classroom => ({
      id: classroom.id,
      name: classroom.name,
      course: classroom.course,
      description: classroom.description,
      code: classroom.code,
      createdAt: classroom.created_at,
      students: q.roster.all(classroom.id).map(student => ({ name: student.name, email: student.email, joinedAt: student.joined_at, progress: progressSummary(student.id) })),
      lessons: q.lessonsForClass.all(classroom.id).map(lessonOut),
      homework: q.homeworkForClass.all(classroom.id).map(row => ({ ...homeworkOut(row), submissions: q.submissionsFor.all(row.id).map(sub => ({ name: sub.name, email: sub.email, response: sub.response, submittedAt: sub.submitted_at })) }))
    }));
    res.json({ classes });
  });

  app.post("/api/teacher/classes", requireTeacher, route((req, res) => {
    const name = clean(req.body?.name, 120);
    if (!name) fail(400, "Give the class a name.");
    const id = randomUUID();
    const code = makeJoinCode(candidate => Boolean(q.codeExists.get(candidate)));
    q.insertClass.run(id, req.user.id, name, clean(req.body?.course, 120) || "Alif Baa + Al-Kitaab Part 1", clean(req.body?.description, 500), code);
    res.status(201).json({ class: { id, name, code } });
  }));

  app.delete("/api/teacher/classes/:id", requireTeacher, route((req, res) => {
    const classroom = ownedClass(req);
    q.deleteClass.run(classroom.id, req.user.id);
    res.json({ ok: true });
  }));

  app.post("/api/teacher/lessons", requireTeacher, route((req, res) => {
    const classroom = ownedClass(req);
    const title = clean(req.body?.title, 200);
    const dayNumber = Number.parseInt(req.body?.dayNumber, 10);
    const steps = (Array.isArray(req.body?.steps) ? req.body.steps : [])
      .map(step => ({ title: clean(step?.title, 200), body: clean(step?.body, 10000) }))
      .filter(step => step.title || step.body)
      .slice(0, 50);
    if (!title) fail(400, "Give the lesson a title.");
    if (!(dayNumber >= 1 && dayNumber <= 500)) fail(400, "Choose a valid roadmap day.");
    if (!steps.length) fail(400, "Add at least one step.");
    q.upsertLesson.run(randomUUID(), classroom.id, clean(req.body?.unitKey, 20), dayNumber, title, clean(req.body?.source, 50000), JSON.stringify(steps));
    res.status(201).json({ ok: true });
  }));

  app.post("/api/teacher/homework", requireTeacher, route((req, res) => {
    const classroom = ownedClass(req);
    const title = clean(req.body?.title, 200);
    const instructions = clean(req.body?.instructions, 20000);
    const dayNumber = Number.parseInt(req.body?.dayNumber, 10);
    if (!title || !instructions) fail(400, "Add a title and instructions.");
    if (!(dayNumber >= 1 && dayNumber <= 500)) fail(400, "Choose a valid roadmap day.");
    q.upsertHomework.run(randomUUID(), classroom.id, clean(req.body?.unitKey, 20), dayNumber, title, instructions, clean(req.body?.dueDate, 20));
    res.status(201).json({ ok: true });
  }));

  app.delete("/api/teacher/lessons/:id", requireTeacher, (req, res) => { q.deleteLesson.run(req.params.id, req.user.id); res.json({ ok: true }); });
  app.delete("/api/teacher/homework/:id", requireTeacher, (req, res) => { q.deleteHomework.run(req.params.id, req.user.id); res.json({ ok: true }); });

  /* ---------- pronunciation (Azure AI Speech) ---------- */
  app.post("/api/speech", requireUser, route(async (req, res) => {
    if (!speech) fail(503, "Azure pronunciation isn’t switched on. An administrator needs to add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.");
    const text = String(req.body?.text ?? "").trim();
    if (!text) fail(400, "Nothing to pronounce.");
    if (text.length > 600) fail(413, "That’s too long to read aloud in one go.");
    try {
      const { audio, cached } = await speech.synthesize({ text, voice: req.body?.voice, rate: req.body?.rate, userId: req.user.id });
      res.set({ "content-type": "audio/mpeg", "cache-control": "private, max-age=86400", "x-tts-cache": cached ? "hit" : "miss" });
      res.send(audio);
    } catch (error) {
      if (error.status) fail(error.status, error.message);
      console.error("Azure Speech error:", error.message);
      fail(502, "The pronunciation service didn’t respond. Try again.");
    }
  }));

  /* ---------- Daal, the AI tutor ---------- */
  app.post("/api/daal/chat", requireUser, async (req, res, next) => {
    try {
      if (!daal) fail(503, "Daal’s AI tutor isn’t switched on yet. An administrator needs to add ANTHROPIC_API_KEY to the server.");
      const mode = DAAL_MODES.includes(req.body?.mode) ? req.body.mode : "ask";
      const messages = mode === "explain" ? [] : cleanMessages(req.body?.messages);
      if (mode !== "explain" && !messages) fail(400, "Send a message for Daal.");
      if (mode === "explain" && !req.body?.question) fail(400, "Missing the question to explain.");
      const blocked = daal.allow(req.user.id);
      if (blocked) fail(429, blocked);
    } catch (error) { return next(error); }

    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", connection: "keep-alive" });
    const send = payload => res.write(`data: ${JSON.stringify(payload)}\n\n`);
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    try {
      await daal.reply({
        user: req.user,
        mode: DAAL_MODES.includes(req.body.mode) ? req.body.mode : "ask",
        messages: cleanMessages(req.body.messages) || [],
        context: req.body.context || {},
        question: req.body.question,
        signal: controller.signal,
        onEvent: send
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("Daal error:", error?.status || "", error?.message);
        send({ type: "error", error: apiErrorMessage(error) });
      }
    }
    res.end();
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  /* ---------- the built React app ---------- */
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: "index.html", maxAge: "1h", setHeaders: (res, path) => { if (path.endsWith("index.html")) res.set("Cache-Control", "no-cache"); } }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(join(staticDir, "index.html")));
  }

  app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error?.type === "entity.too.large") return res.status(413).json({ error: "Request too large." });
    if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    console.error(error);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  return app;
}
