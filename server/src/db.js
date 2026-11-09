import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

    -- Per-learner JSON documents (curriculum progress, review queue, starred words, preferences…)
    CREATE TABLE IF NOT EXISTS user_state (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id          TEXT PRIMARY KEY,
      owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      course      TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      code        TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS memberships (
      class_id  TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (class_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_plans (
      id         TEXT PRIMARY KEY,
      class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      unit_key   TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      title      TEXT NOT NULL,
      source     TEXT NOT NULL DEFAULT '',
      steps      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (class_id, unit_key, day_number)
    );

    CREATE TABLE IF NOT EXISTS homework (
      id           TEXT PRIMARY KEY,
      class_id     TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      unit_key     TEXT NOT NULL,
      day_number   INTEGER NOT NULL,
      title        TEXT NOT NULL,
      instructions TEXT NOT NULL,
      due_date     TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (class_id, unit_key, day_number)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      homework_id  TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      response     TEXT NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (homework_id, user_id)
    );
  `);
  // Migration: link accounts to a Dartmouth SSO identity.
  const columns = db.prepare("PRAGMA table_info(users)").all().map(column => column.name);
  if (!columns.includes("sso_id")) db.exec("ALTER TABLE users ADD COLUMN sso_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_sso_id ON users(sso_id) WHERE sso_id IS NOT NULL");
  return db;
}
