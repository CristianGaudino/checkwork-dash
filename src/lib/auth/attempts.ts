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

// The gate on emails is the write: a link row (every email sent writes exactly one) goes in only while the address has fewer than `perWindow`
// in the last `windowMs` and fewer than `perLong` in the last `longMs`, counted and inserted in one statement (in memory, in one step with no await),
// so parallel requests cannot all pass. True means this request may send.
export async function reserveLink(row: Attempt, now: number, windowMs: number, perWindow: number, longMs: number, perLong: number): Promise<boolean> {
  const sent = (since: number) => (x: Attempt) => x.email === row.email && (x.kind === "link" || x.kind === "confirm-code") && x.createdAt.getTime() > since;
  if (!hasD1()) {
    const rows = mem().signInAttempts;
    if (rows.filter(sent(now - windowMs)).length >= perWindow || rows.filter(sent(now - longMs)).length >= perLong) return false;
    rows.push(row);
    return true;
  }
  const t = signInAttempts;
  const count = (since: number) => sql`(select count(*) from ${t} where ${t.email} = ${row.email} and ${t.kind} in ('link', 'confirm-code') and ${t.createdAt} > ${since})`;
  const rows = await quiet(
    db().all<{ id: string }>(sql`insert into ${t} (id, kind, email, tries, created_at, expires_at, token_hmac) select ${row.id}, ${row.kind}, ${row.email}, 0, ${row.createdAt.getTime()}, ${row.expiresAt.getTime()}, ${row.tokenHmac} where ${count(now - windowMs)} < ${perWindow} and ${count(now - longMs)} < ${perLong} returning id`),
    "reserveLink",
  );
  return rows.length > 0;
}

// Parallel requests for one address can each pass the gate (up to the cap), so after its rows are written each ends every live code and link of
// the address except those of the newest request (its link row, newest by time then id, and the code row sharing its id). Whichever runs last
// sees them all, so one stays live. A request's code row has the id `X` and its link row `X-link`.
export async function endAllButNewest(email: string, now: number): Promise<void> {
  const group = (id: string) => id.slice(0, 36);
  if (!hasD1()) {
    const rows = mem().signInAttempts;
    const newest = rows.filter((x) => x.email === email && x.kind === "link" && !x.usedAt).sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (y.id > x.id ? 1 : -1))[0];
    for (const x of rows) if (newest && x.email === email && (x.kind === "code" || x.kind === "link") && !x.usedAt && x.expiresAt.getTime() > now && group(x.id) !== group(newest.id)) x.expiresAt = at(now);
    return;
  }
  const t = signInAttempts;
  await quiet(
    db().run(sql`update ${t} set expires_at = ${now} where ${t.email} = ${email} and ${t.kind} in ('code', 'link') and ${t.usedAt} is null and ${t.expiresAt} > ${now}
      and substr(${t.id}, 1, 36) <> (select substr(n.id, 1, 36) from ${t} n where n.email = ${email} and n.kind = 'link' and n.used_at is null order by n.created_at desc, n.id desc limit 1)`),
    "endAllButNewest",
  );
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

// The wrong codes tried for this address in the last `windowMs`, whichever code they were made on: the tries on its code rows, less one for
// each that was used (that try was the right one).
export async function wrongTries(email: string, now: number, windowMs: number): Promise<number> {
  if (!hasD1()) return mem().signInAttempts.filter((a) => a.email === email && a.kind === "code" && a.createdAt.getTime() > now - windowMs).reduce((n, a) => n + a.tries - (a.usedAt ? 1 : 0), 0);
  const [r] = await quiet(db().select({ n: sql<number>`coalesce(sum(${signInAttempts.tries} - (${signInAttempts.usedAt} is not null)), 0)` }).from(signInAttempts).where(and(eq(signInAttempts.email, email), eq(signInAttempts.kind, "code"), gt(signInAttempts.createdAt, at(now - windowMs)))), "wrongTries");
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

// A changed sign-in address (#142): the person's row keeps its id, so their passkeys and sessions (keyed by id) come with it.
export async function moveStaffEmail(from: string, to: string): Promise<void> {
  if (!hasD1()) {
    const p = mem().staff.find((x) => x.email === from);
    if (p) p.email = to;
    return;
  }
  await quiet(db().update(staff).set({ email: to }).where(eq(staff.email, from)), "moveStaffEmail");
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
