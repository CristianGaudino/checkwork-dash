import { beforeEach, describe, expect, it, vi } from "vitest";

// The counter rule as the directory will run it (docs/sign-in.md, section 2, sign-in step 5): checked and written in one statement, on the
// real migrations (the SQLite stand-in for D1, src/test/sqlite-d1.ts).
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
const { drizzle, truncateIn } = await import("@/test/sqlite-d1");
const { passkeys, staff } = await import("@/lib/db/directory-schema");
const { and, eq } = await import("drizzle-orm");
const { counterWhere } = await import("./webauthn");

const db = drizzle("DIRECTORY");
const advance = (next: number) =>
  db.update(passkeys).set({ signCount: next, lastUsedAt: new Date() }).where(and(eq(passkeys.id, "k1"), counterWhere(next))).returning({ id: passkeys.id });
const count = async () => (await db.select({ n: passkeys.signCount }).from(passkeys))[0].n;

describe("counterWhere", () => {
  beforeEach(async () => {
    await truncateIn("DIRECTORY", "passkeys", "staff");
    await db.insert(staff).values({ id: "s1", email: "aoife@example.com", createdAt: new Date() });
  });
  const stored = (signCount: number) =>
    db.insert(passkeys).values({ id: "k1", staffId: "s1", publicKey: Buffer.from([1]), alg: -7, signCount, backupEligible: true, backedUp: true, label: "iPhone", createdAt: new Date() });

  it("writes only a count above the stored one, or 0 over 0", async () => {
    await stored(0);
    expect(await advance(0)).toHaveLength(1); // a synced passkey, every time
    expect(await advance(0)).toHaveLength(1);
    expect(await advance(5)).toHaveLength(1);
    expect(await advance(5)).toHaveLength(0);
    expect(await advance(4)).toHaveLength(0);
    expect(await advance(0)).toHaveLength(0);
    expect(await count()).toBe(5);
  });

  it("lets only one of two sign-ins with the same count through", async () => {
    await stored(6);
    const [a, b] = await Promise.all([advance(7), advance(7)]);
    expect([a.length, b.length].sort()).toEqual([0, 1]);
    expect(await count()).toBe(7);
  });
});
