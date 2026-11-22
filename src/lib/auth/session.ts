import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, desc, eq, lte, notInArray } from "drizzle-orm";
import { sessions, staff } from "@/lib/db/directory-schema";
import { directoryDb, hashSiteKey as sha256Hex, hasD1, memoryDirectory, quietDirectory as quiet } from "@/lib/tenancy/directory";
import { SESSION_COOKIE, SESSION_VALUE as VALUE } from "./gate";
import { SESSION_IDLE_MS } from "./purge";

// Our own sessions (docs/sign-in.md, section 4). The cookie holds 32 random bytes; the directory keeps only their SHA-256, so someone who
// reads the table cannot use a row as a cookie. A session is a person, not a dealer: which dealer stays the directory's, on every request.
// 12 hours with no request, 7 days at most (owner, 2026-11-22). The cookie's own expiry is the 7 days (a cookie cannot be set while a page
// renders); the idle limit is ours, with last_seen_at written at most once every 5 minutes.
export const SESSION_MAX_MS = 7 * 24 * 3_600_000;
const TOUCH_MS = 5 * 60_000;
export const SESSIONS_PER_PERSON = 20; // the oldest ends when a 21st starts

// __Host-: the browser keeps it only if Secure, Path=/ and no Domain, so no other checkwork.ie host can set or read it.
export const sessionCookie = (value: string) => ({ name: SESSION_COOKIE, value, httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_MS / 1000 });
// Deleting it takes the same attributes: a browser refuses a __Host- cookie without Secure and Path=/, deletion included.
export const endedSessionCookie = () => ({ ...sessionCookie(""), maxAge: 0 });

export type Session = { idHash: string; staffId: string; email: string; verifiedAt: number };
type Row = typeof sessions.$inferSelect;

// A new session at sign-in (step 4 and 5 call it): a new id every time, so one can never be fixed in advance. `replacing` is the cookie the
// device already had, which ends. Returns the cookie's value; only its hash is stored.
export async function startSession({ staffId, method, label }: Pick<Row, "staffId" | "method" | "label">, replacing?: string, now = Date.now()): Promise<string> {
  if (replacing) await endSession(replacing);
  const value = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const at = new Date(now);
  const row: Row = { idHash: await sha256Hex(value), staffId, method, label, createdAt: at, lastSeenAt: at, verifiedAt: at, expiresAt: new Date(now + SESSION_MAX_MS) };
  if (!hasD1()) {
    const m = memoryDirectory();
    m.sessions.push(row);
    const keep = new Set(m.sessions.filter((s) => s.staffId === staffId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, SESSIONS_PER_PERSON));
    m.sessions = m.sessions.filter((s) => s.staffId !== staffId || keep.has(s));
  } else {
    const d = directoryDb();
    const newest = d.select({ id: sessions.idHash }).from(sessions).where(eq(sessions.staffId, staffId)).orderBy(desc(sessions.createdAt)).limit(SESSIONS_PER_PERSON);
    await quiet(d.batch([d.insert(sessions).values(row), d.delete(sessions).where(and(eq(sessions.staffId, staffId), notInArray(sessions.idHash, newest)))]), "startSession");
  }
  return value;
}

// The live session a cookie names, or null: unknown, ended, idle 12 hours or past 7 days. A dead one is deleted on the way.
export async function readSession(value: string, now = Date.now()): Promise<Session | null> {
  if (!VALUE.test(value)) return null;
  const idHash = await sha256Hex(value);
  let found: { s: Row; email: string } | undefined;
  if (!hasD1()) {
    const m = memoryDirectory();
    const s = m.sessions.find((x) => x.idHash === idHash);
    const person = s && m.staff.find((p) => p.id === s.staffId);
    found = s && person && { s, email: person.email };
  } else {
    [found] = await quiet(directoryDb().select({ s: sessions, email: staff.email }).from(sessions).innerJoin(staff, eq(sessions.staffId, staff.id)).where(eq(sessions.idHash, idHash)).limit(1), "readSession");
  }
  if (!found) return null;
  const { s, email } = found;
  if (s.expiresAt.getTime() <= now || s.lastSeenAt.getTime() <= now - SESSION_IDLE_MS) {
    await dropSessions(eq(sessions.idHash, idHash), (x) => x.idHash === idHash);
    return null;
  }
  if (s.lastSeenAt.getTime() <= now - TOUCH_MS) {
    const seen = new Date(now);
    if (!hasD1()) s.lastSeenAt = seen;
    else await quiet(directoryDb().update(sessions).set({ lastSeenAt: seen }).where(and(eq(sessions.idHash, idHash), lte(sessions.lastSeenAt, new Date(now - TOUCH_MS)))), "touchSession");
  }
  return { idHash, staffId: s.staffId, email, verifiedAt: s.verifiedAt.getTime() };
}

// This request's live session (once a request), from the cookie.
export const currentSession = cache(async (): Promise<Session | null> => {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? readSession(value) : null;
});

// Sign out: this device's session.
export async function endSession(value: string): Promise<void> {
  if (!VALUE.test(value)) return;
  const idHash = await sha256Hex(value);
  await dropSessions(eq(sessions.idHash, idHash), (x) => x.idHash === idHash);
}

// Sign out everywhere: every session of the person, at every dealer (a session is a person, not a dealer).
export const endSessionsOf = (staffId: string) => dropSessions(eq(sessions.staffId, staffId), (x) => x.staffId === staffId);

async function dropSessions(where: ReturnType<typeof eq>, match: (s: Row) => boolean): Promise<void> {
  if (!hasD1()) {
    const m = memoryDirectory();
    m.sessions = m.sessions.filter((s) => !match(s));
    return;
  }
  await quiet(directoryDb().delete(sessions).where(where), "endSession");
}
