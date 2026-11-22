import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { signInAttempts, staff } from "@/lib/db/directory-schema";
import { directoryDb as db, hasD1, memoryDirectory as mem, quietDirectory as quiet } from "@/lib/tenancy/directory";

// The rows behind the emailed code and link (docs/sign-in.md, sections 3 and 5): the directory's sign_in_attempts and staff, in D1 or in
// memory (next dev, the E2E run, unit tests). Each write that must be exact is one statement (or, in memory, one step with no await in
// it), so two requests at once cannot both pass. Errors are rethrown without values (quiet).
export type Attempt = typeof signInAttempts.$inferSelect;
export type Person = typeof staff.$inferSelect;
type Kind = Attempt["kind"];

const at = (ms: number) => new Date(ms);
const DAY_MS = 86_400_000;

export async function addAttempt(row: Attempt): Promise<void> {
  if (!hasD1()) mem().signInAttempts.push(row);
  else await quiet(db().insert(signInAttempts).values(row), "addAttempt");
}

// A new email to an address ends its earlier code and link: they expire now (never "used", so their wrong tries still count).
export async function endLive(email: string, kinds: Kind[], now: number): Promise<void> {
  if (!hasD1()) {
    for (const a of mem().signInAttempts) if (a.email === email && kinds.includes(a.kind) && !a.usedAt && a.expiresAt.getTime() > now) a.expiresAt = at(now);
    return;
  }
  await quiet(db().update(signInAttempts).set({ expiresAt: at(now) }).where(and(eq(signInAttempts.email, email), inArray(signInAttempts.kind, kinds), isNull(signInAttempts.usedAt), gt(signInAttempts.expiresAt, at(now)))), "endLive");
}

// The emails we sent this address: every one writes exactly one link or confirm-code row.
export async function sentCounts(email: string, now: number, windowMs: number): Promise<{ recent: number; day: number }> {
  const sent = (since: number) => (a: Attempt) => a.email === email && (a.kind === "link" || a.kind === "confirm-code") && a.createdAt.getTime() > since;
  if (!hasD1()) {
    const rows = mem().signInAttempts;
    return { recent: rows.filter(sent(now - windowMs)).length, day: rows.filter(sent(now - DAY_MS)).length };
  }
  const count = async (since: number) => {
    const [r] = await quiet(db().select({ n: sql<number>`count(*)` }).from(signInAttempts).where(and(eq(signInAttempts.email, email), inArray(signInAttempts.kind, ["link", "confirm-code"]), gt(signInAttempts.createdAt, at(since)))), "sentCounts");
    return Number(r?.n ?? 0);
  };
  return { recent: await count(now - windowMs), day: await count(now - DAY_MS) };
}

// Spends a try before anything is compared, and only on a live code of this browser: one statement, so two posts at once cannot both spend the
// last try. No row back means the code is dead.
export async function spendTry(browserHash: string, now: number, maxTries: number): Promise<Pick<Attempt, "id" | "email" | "codeHmac"> | undefined> {
  if (!hasD1()) {
    const a = mem().signInAttempts.find((x) => x.browserHash === browserHash && x.kind === "code" && !x.usedAt && x.expiresAt.getTime() > now && x.tries < maxTries);
    if (!a) return undefined;
    a.tries += 1;
    return { id: a.id, email: a.email, codeHmac: a.codeHmac };
  }
  const [r] = await quiet(
    db().update(signInAttempts).set({ tries: sql`${signInAttempts.tries} + 1` })
      .where(and(eq(signInAttempts.browserHash, browserHash), eq(signInAttempts.kind, "code"), isNull(signInAttempts.usedAt), gt(signInAttempts.expiresAt, at(now)), sql`${signInAttempts.tries} < ${maxTries}`))
      .returning({ id: signInAttempts.id, email: signInAttempts.email, codeHmac: signInAttempts.codeHmac }),
    "spendTry",
  );
  return r;
}

// Single use: true for the one caller that marks it.
export async function markUsed(id: string, now: number): Promise<boolean> {
  if (!hasD1()) {
    const a = mem().signInAttempts.find((x) => x.id === id && !x.usedAt);
    if (a) a.usedAt = at(now);
    return Boolean(a);
  }
  return (await quiet(db().update(signInAttempts).set({ usedAt: at(now) }).where(and(eq(signInAttempts.id, id), isNull(signInAttempts.usedAt))).returning({ id: signInAttempts.id }), "markUsed")).length > 0;
}

// The wrong codes tried for this address in the last 24 hours, whichever code they were made on: the tries on its code rows, less one for
// each that was used (that try was the right one).
export async function wrongTries(email: string, now: number): Promise<number> {
  if (!hasD1()) return mem().signInAttempts.filter((a) => a.email === email && a.kind === "code" && a.createdAt.getTime() > now - DAY_MS).reduce((n, a) => n + a.tries - (a.usedAt ? 1 : 0), 0);
  const [r] = await quiet(db().select({ n: sql<number>`coalesce(sum(${signInAttempts.tries} - (${signInAttempts.usedAt} is not null)), 0)` }).from(signInAttempts).where(and(eq(signInAttempts.email, email), eq(signInAttempts.kind, "code"), gt(signInAttempts.createdAt, at(now - DAY_MS)))), "wrongTries");
  return Number(r?.n ?? 0);
}

export async function linkByHmac(tokenHmac: string, now: number): Promise<Attempt | undefined> {
  if (!hasD1()) return mem().signInAttempts.find((a) => a.kind === "link" && a.tokenHmac === tokenHmac && !a.usedAt && a.expiresAt.getTime() > now);
  const [r] = await quiet(db().select().from(signInAttempts).where(and(eq(signInAttempts.kind, "link"), eq(signInAttempts.tokenHmac, tokenHmac), isNull(signInAttempts.usedAt), gt(signInAttempts.expiresAt, at(now)))).limit(1), "linkByHmac");
  return r;
}

export async function staffByEmail(email: string): Promise<Person | undefined> {
  if (!hasD1()) return mem().staff.find((p) => p.email === email);
  const [r] = await quiet(db().select().from(staff).where(eq(staff.email, email)).limit(1), "staffByEmail");
  return r;
}

// One row per person, made the first time they ask for a code. The id is their WebAuthn user handle.
export async function ensureStaff(email: string, now: number): Promise<Person> {
  const row: Person = { id: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"), email, codeFailures: 0, codeLockedUntil: null, createdAt: at(now) };
  if (!hasD1()) {
    const m = mem();
    return m.staff.find((p) => p.email === email) ?? (m.staff.push(row), row);
  }
  await quiet(db().insert(staff).values(row).onConflictDoNothing(), "ensureStaff");
  return (await staffByEmail(email)) as Person;
}

// Wrong codes in a row: counted after the answer, back to 0 at any sign-in.
export async function addFailure(id: string): Promise<void> {
  if (!hasD1()) {
    const p = mem().staff.find((x) => x.id === id);
    if (p) p.codeFailures += 1;
    return;
  }
  await quiet(db().update(staff).set({ codeFailures: sql`${staff.codeFailures} + 1` }).where(eq(staff.id, id)), "addFailure");
}
export async function clearFailures(id: string): Promise<void> {
  if (!hasD1()) {
    const p = mem().staff.find((x) => x.id === id);
    if (p) p.codeFailures = 0;
    return;
  }
  await quiet(db().update(staff).set({ codeFailures: 0 }).where(eq(staff.id, id)), "clearFailures");
}

// Locks codes until `until`. True only for the call that locked it, so the warning email goes once.
export async function lockCodes(id: string, until: number, now: number): Promise<boolean> {
  if (!hasD1()) {
    const p = mem().staff.find((x) => x.id === id);
    if (!p || (p.codeLockedUntil && p.codeLockedUntil.getTime() > now)) return false;
    p.codeLockedUntil = at(until);
    return true;
  }
  const rows = await quiet(db().update(staff).set({ codeLockedUntil: at(until) }).where(and(eq(staff.id, id), sql`(${staff.codeLockedUntil} is null or ${staff.codeLockedUntil} <= ${now})`)).returning({ id: staff.id }), "lockCodes");
  return rows.length > 0;
}
