import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { clearLocalState, flushPending, pullState, pushLocalState } from "./sync";

// Server-backed accounts. The session itself is an HttpOnly cookie; this module only mirrors who is signed in.
let session = undefined; // undefined = still checking, null = signed out
const listeners = new Set();
const emit = () => listeners.forEach(listener => listener());
function setSession(user) { session = user ? { name: user.name, email: user.email, role: user.role, id: user.id } : null; emit(); }

export async function bootstrapSession() {
  try {
    const { user } = await api("/me");
    await pullState();
    setSession(user);
  } catch {
    setSession(null);
  }
}

export async function checkEmail(email) {
  return api("/auth/check", { method: "POST", body: { email } });
}

export async function login({ email, password, role }) {
  const { user } = await api("/auth/login", { method: "POST", body: { email, password, role } });
  await pullState();
  setSession(user);
  return user;
}

/** New learner account. Progress already saved in this browser is carried into the new account. */
export async function signup({ name, email, password }) {
  const { user } = await api("/auth/signup", { method: "POST", body: { name, email, password } });
  await pushLocalState();
  setSession(user);
  return user;
}

export async function teacherSignup({ name, email, password, accessCode }) {
  const { user } = await api("/auth/teacher-signup", { method: "POST", body: { name, email, password, accessCode } });
  clearLocalState();
  setSession(user);
  return user;
}

export async function logout() {
  await flushPending();
  try { await api("/auth/logout", { method: "POST" }); } catch { /* still clear locally */ }
  clearLocalState();
  setSession(null);
}

export function useSession() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => session);
}

export const isSignedIn = () => Boolean(session);

/* ---------- Dartmouth single sign-on ---------- */
let configPromise = null;
export const fetchConfig = () => (configPromise ||= api("/config").catch(() => ({ sso: { enabled: false }, passwordLogin: true, offline: true })));

/** { sso: { enabled, label }, passwordLogin, allowedDomain } — null while loading. */
export function useAuthConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => { let live = true; fetchConfig().then(value => live && setConfig(value)); return () => { live = false; }; }, []);
  return config;
}

/** Full-page navigation to Dartmouth's login; it returns to the server, which sets the session. */
export function startSso(intent = "student") {
  window.location.assign(`/api/auth/sso/login?intent=${intent}`);
}

/** A signed-in (SSO) user unlocks instructor tools with the department's access code. */
export async function claimTeacher(accessCode) {
  const { user } = await api("/auth/claim-teacher", { method: "POST", body: { accessCode } });
  setSession(user);
  return user;
}
