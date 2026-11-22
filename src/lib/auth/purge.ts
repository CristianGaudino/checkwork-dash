import { inArray, lt, notInArray, or, type SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { members, passkeys, sessions, signInAttempts, staff } from "../db/directory-schema";

// Retention for our own sign-in (docs/sign-in.md, section 6), the nightly job's one directory step (worker.mjs, purge-sign-in). Counts
// only, never a row. Relative imports only: wrangler bundles this outside Next's "@/" alias.
const HOUR_MS = 3_600_000;
export const ATTEMPT_KEEP_MS = HOUR_MS; // the hourly email count needs an hour; the lock lives on staff
export const SESSION_IDLE_MS = 12 * HOUR_MS;
// Bounded work a night: at most `chunks` deletes of `chunk` rows per table; whatever is left goes the next night.
export const PURGE_LIMITS = { chunk: 5000, chunks: 20 };

// D1 reports changed rows in meta.changes, libSQL (the tests' stand-in) in rowsAffected.
const changes = (r: unknown) => (r as { meta?: { changes?: number } }).meta?.changes ?? (r as { rowsAffected?: number }).rowsAffected ?? 0;

export async function purgeSignIn(db: DrizzleD1Database, now = Date.now(), { chunk, chunks } = PURGE_LIMITS) {
  const inChunks = async (table: typeof signInAttempts | typeof sessions, id: SQLiteColumn, due: SQL | undefined) => {
    let total = 0;
    for (let i = 0; i < chunks; i++) {
      const n = changes(await db.delete(table).where(inArray(id, db.select({ id }).from(table).where(due).limit(chunk))));
      total += n;
      if (n < chunk) break;
    }
    return total;
  };
  const attempts = await inChunks(signInAttempts, signInAttempts.id, lt(signInAttempts.createdAt, new Date(now - ATTEMPT_KEEP_MS)));
  const ended = await inChunks(sessions, sessions.idHash, or(lt(sessions.expiresAt, new Date(now)), lt(sessions.lastSeenAt, new Date(now - SESSION_IDLE_MS))));
  // A person at no dealer, paused ones included (a paused dealer's people keep their membership): their passkeys, sessions and pending
  // attempts (each points at the staff row), then the row, in one transaction, so someone added again meanwhile keeps all of it.
  const gone = db.select({ id: staff.id }).from(staff).where(notInArray(staff.email, db.select({ email: members.email }).from(members)));
  const [keys, theirs, , people] = await db.batch([
    db.delete(passkeys).where(inArray(passkeys.staffId, gone)),
    db.delete(sessions).where(inArray(sessions.staffId, gone)),
    db.delete(signInAttempts).where(inArray(signInAttempts.staffId, gone)),
    db.delete(staff).where(inArray(staff.id, gone)),
  ]);
  return { attempts, sessions: ended + changes(theirs), passkeys: changes(keys), staff: changes(people) };
}
