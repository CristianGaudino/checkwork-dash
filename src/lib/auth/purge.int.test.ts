import { beforeEach, describe, expect, it, vi } from "vitest";

// Our sign-in's four directory tables, made by the real migrations on the SQLite stand-in for D1 (src/test/sqlite-d1.ts), and the nightly
// purge that keeps them short (docs/sign-in.md, section 6).
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
const { drizzle, truncateIn } = await import("@/test/sqlite-d1");
const { dealers, members, passkeys, sessions, signInAttempts, staff } = await import("@/lib/db/directory-schema");
const { eq } = await import("drizzle-orm");
const { purgeSignIn, ATTEMPT_KEEP_MS, SESSION_IDLE_MS } = await import("./purge");

const db = drizzle("DIRECTORY");
const NOW = Date.parse("2026-11-22T03:17:00Z");
const at = (msAgo: number) => new Date(NOW - msAgo);
const ids = async (t: typeof staff | typeof passkeys | typeof signInAttempts) => (await db.select({ id: t.id }).from(t)).map((r) => r.id).sort();
const sessionIds = async () => (await db.select({ id: sessions.idHash }).from(sessions)).map((r) => r.id).sort();

const person = (id: string, email: string) => ({ id, email, createdAt: at(0) });
const passkey = (id: string, staffId: string) => ({ id, staffId, publicKey: Buffer.from([1, 2, 3]), alg: -7, backupEligible: true, backedUp: true, label: "iPhone", createdAt: at(0) });
const session = (idHash: string, staffId: string, lastSeen: number, expiresIn: number) => ({ idHash, staffId, method: "email" as const, label: "iPhone", createdAt: at(lastSeen), lastSeenAt: at(lastSeen), verifiedAt: at(lastSeen), expiresAt: at(-expiresIn) });
const attempt = (id: string, age: number, staffId: string | null = null) => ({ id, kind: "code" as const, staffId, createdAt: at(age), expiresAt: at(age - 15 * 60_000) });

describe("the sign-in tables", () => {
  beforeEach(() => truncateIn("DIRECTORY", "sign_in_attempts", "sessions", "passkeys", "staff"));

  it("keep one person per email, one row per link token, and point at a real person", async () => {
    await db.insert(staff).values(person("s1", "aoife@example.com"));
    await expect(db.insert(staff).values(person("s2", "aoife@example.com"))).rejects.toThrow();
    await db.insert(signInAttempts).values([{ ...attempt("a1", 0), kind: "link", tokenHmac: "h" }, attempt("a2", 0), attempt("a3", 0)]); // many code rows hold no token
    await expect(db.insert(signInAttempts).values({ ...attempt("a4", 0), kind: "link", tokenHmac: "h" })).rejects.toThrow();
    await expect(db.insert(passkeys).values(passkey("k0", "nobody"))).rejects.toThrow();
    const [row] = await db.insert(passkeys).values(passkey("k1", "s1")).returning();
    expect(row).toMatchObject({ signCount: 0, transports: "[]", lastUsedAt: null });
    expect([...row.publicKey]).toEqual([1, 2, 3]);
  });
});

describe("purgeSignIn", () => {
  beforeEach(() => truncateIn("DIRECTORY", "sign_in_attempts", "sessions", "passkeys", "staff"));

  it("deletes only what is due: day-old attempts, sessions past either lifetime, and people at no dealer with all of theirs", async () => {
    // aoife is at Checkwork Motors (the stand-in's members); gone@ is at no dealer.
    await db.insert(staff).values([person("aoife", "aoife@example.com"), person("gone", "gone@example.com")]);
    await db.insert(passkeys).values([passkey("k-aoife", "aoife"), passkey("k-gone", "gone")]);
    await db.insert(sessions).values([
      session("live", "aoife", SESSION_IDLE_MS - 60_000, 60_000),
      session("idle", "aoife", SESSION_IDLE_MS + 60_000, 60_000),
      session("expired", "aoife", 0, -60_000),
      session("gone-live", "gone", 0, 60_000),
    ]);
    await db.insert(signInAttempts).values([attempt("fresh", ATTEMPT_KEEP_MS - 60_000), attempt("old", ATTEMPT_KEEP_MS + 60_000), attempt("gone-fresh", 0, "gone"), attempt("aoife-fresh", 0, "aoife")]);

    expect(await purgeSignIn(db as never, NOW)).toEqual({ attempts: 1, sessions: 3, passkeys: 1, staff: 1 });
    expect(await ids(staff)).toEqual(["aoife"]);
    expect(await ids(passkeys)).toEqual(["k-aoife"]);
    expect(await sessionIds()).toEqual(["live"]);
    expect(await ids(signInAttempts)).toEqual(["aoife-fresh", "fresh"]);
    expect(await purgeSignIn(db as never, NOW)).toEqual({ attempts: 0, sessions: 0, passkeys: 0, staff: 0 }); // done once
  });

  it("keeps someone whose only dealer is paused: they are still on its team", async () => {
    await db.insert(members).values({ dealerId: "test-motors", email: "solo@example.com", role: "Sales" });
    await db.update(dealers).set({ status: "paused" }).where(eq(dealers.id, "test-motors"));
    await db.insert(staff).values(person("solo", "solo@example.com"));
    await db.insert(passkeys).values(passkey("k-solo", "solo"));
    expect(await purgeSignIn(db as never, NOW)).toEqual({ attempts: 0, sessions: 0, passkeys: 0, staff: 0 });
  });
});
