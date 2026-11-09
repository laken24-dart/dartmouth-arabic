import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// A real hash to compare against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = await hashPassword(randomBytes(12).toString("hex"));

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, saltB64, hashB64] = String(stored || DUMMY_HASH).split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return timingSafeEqual(key, expected) && Boolean(stored);
}

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = value => createHash("sha256").update(value).digest("hex");

export function makeJoinCode(exists) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do code = Array.from(randomBytes(6), byte => chars[byte % chars.length]).join("");
  while (exists(code));
  return code;
}

/** Fixed-window limiter keyed by string (e.g. ip+email) — in memory, per process. */
export function createLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) { hits.set(key, { count: 1, resetAt: now + windowMs }); return true; }
      entry.count += 1;
      if (hits.size > 10000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return entry.count <= max;
    },
    reset(key) { hits.delete(key); }
  };
}
