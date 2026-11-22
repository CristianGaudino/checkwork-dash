import { inArray, lt, notInArray, or } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { members, passkeys, sessions, signInAttempts, staff } from "../db/directory-schema";
import type * as schema from "../db/directory-schema";

// Retention for our own sign-in (docs/sign-in.md, section 6), the nightly job's one directory step (worker.mjs, purge-sign-in). Counts
// only, never a row. Relative imports only: wrangler bundles this outside Next's "@/" alias.
const HOUR_MS = 3_600_000;
export const ATTEMPT_KEEP_MS = 24 * HOUR_MS; // the daily counts need a day; the lock lives on staff
export const SESSION_IDLE_MS = 12 * HOUR_MS;
export const SESSION_MAX_MS = 7 * 24 * HOUR_MS; // what expires_at is set to at sign-in

export async function purgeSignIn(db: BaseSQLiteDatabase<"async", unknown, typeof schema>, now = Date.now()) {
  const attempts = await db.delete(signInAttempts).where(lt(signInAttempts.createdAt, new Date(now - ATTEMPT_KEEP_MS))).returning({ id: signInAttempts.id });
  const ended = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, new Date(now)), lt(sessions.lastSeenAt, new Date(now - SESSION_IDLE_MS))))
    .returning({ id: sessions.idHash });
  // A person at no dealer, paused ones included (a paused dealer's people keep their membership): their passkeys, sessions and pending
  // attempts first (each points at the staff row), then the row. Someone added again in between keeps the row and signs in by email.
  const gone = db.select({ id: staff.id }).from(staff).where(notInArray(staff.email, db.select({ email: members.email }).from(members)));
  const keys = await db.delete(passkeys).where(inArray(passkeys.staffId, gone)).returning({ id: passkeys.id });
  const theirs = await db.delete(sessions).where(inArray(sessions.staffId, gone)).returning({ id: sessions.idHash });
  await db.delete(signInAttempts).where(inArray(signInAttempts.staffId, gone));
  const people = await db.delete(staff).where(notInArray(staff.email, db.select({ email: members.email }).from(members))).returning({ id: staff.id });
  return { attempts: attempts.length, sessions: ended.length + theirs.length, passkeys: keys.length, staff: people.length };
}
