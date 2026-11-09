// Nightly database backups. Writes a consistent copy with SQLite's VACUUM INTO (safe while the site is running)
// and keeps the most recent `keep` copies. On Render these live on the persistent disk next to the database.
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export function backupNow(db, dir, keep = 7, now = new Date()) {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join(dir, `dalt-${stamp}.db`);
  if (existsSync(file)) unlinkSync(file);
  db.prepare("VACUUM INTO ?").run(file);
  const backups = readdirSync(dir).filter(name => /^dalt-.*\.db$/.test(name)).sort();
  backups.slice(0, Math.max(0, backups.length - keep)).forEach(name => unlinkSync(join(dir, name)));
  return file;
}

/** First backup a minute after start-up, then every 24 hours. */
export function scheduleBackups(db, dir, keep = 7) {
  const run = () => {
    try { console.log(`Database backup written: ${backupNow(db, dir, keep)}`); }
    catch (error) { console.error("Database backup failed:", error.message); }
  };
  const first = setTimeout(run, 60 * 1000);
  const daily = setInterval(run, 24 * 60 * 60 * 1000);
  first.unref();
  daily.unref();
}
