import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The team's side of our sign-in (docs/sign-in.md, section 1, build step 6) on the SQLite stand-in for D1 with the real migrations
// (src/test/sqlite-d1.ts): a removal's end of the person's sign-in, the invitation's place in the email caps, and sign out everywhere across
// the dealers' own stores.
vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env }) };
});
const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("./mail", () => ({ sendSignInMail: async (m: (typeof sent)[number]) => void sent.push(m) }));
const { drizzle, truncateIn } = await import("@/test/sqlite-d1");
const { members, passkeys, signInAttempts, staff } = await import("@/lib/db/directory-schema");
const { eq } = await import("drizzle-orm");
const { endRemoved, readSession, startSession } = await import("./session");
const { sendInvitation } = await import("./invite");
const { sendSignIn } = await import("./email-signin");
const { signOutEverywhere } = await import("./everywhere");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { pushStore } = await import("@/lib/push");
const { listActivity } = await import("@/lib/admin/activity");

const db = drizzle("DIRECTORY");
const count = async (t: typeof staff | typeof passkeys | typeof signInAttempts) => (await db.select({ id: t.id }).from(t)).length;
const DEALER = { name: "Test Motors", demo: false };

beforeEach(async () => {
  await truncateIn("DIRECTORY", "sign_in_attempts", "sessions", "passkeys", "staff");
  await db.delete(members).where(eq(members.email, "sam@example.com"));
  sent.length = 0;
  vi.stubEnv("SIGN_IN", "own");
  vi.stubEnv("SIGN_IN_SECRET", "a-test-secret-of-enough-length-0123");
  vi.stubEnv("APP_URL", "https://dev.dash.checkwork.ie");
});
afterEach(() => vi.unstubAllEnvs());

// sam@ has a staff row, a passkey, a pending passkey challenge and a session.
async function signedIn() {
  await db.insert(staff).values({ id: "sam", email: "sam@example.com", createdAt: new Date() });
  await db.insert(passkeys).values({ id: "k1", staffId: "sam", publicKey: Buffer.from([1]), alg: -7, backupEligible: true, backedUp: true, label: "iPhone", createdAt: new Date() });
  await db.insert(signInAttempts).values({ id: "a1", kind: "passkey-register", staffId: "sam", challenge: "c", createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
  return startSession({ staffId: "sam", method: "email", label: "iPhone" });
}

describe("endRemoved on D1", () => {
  it("at no dealer: every session, passkey, pending attempt and the staff row go, in one step", async () => {
    const v = await signedIn();
    await endRemoved("Sam@Example.com");
    expect(await readSession(v)).toBeNull();
    expect([await count(staff), await count(passkeys), await count(signInAttempts)]).toEqual([0, 0, 0]);
  });

  it("still at another dealer: the sessions end, the passkeys and staff row stay", async () => {
    await db.insert(members).values({ dealerId: "test-motors", email: "sam@example.com", role: "Sales" });
    const v = await signedIn();
    await endRemoved("sam@example.com");
    expect(await readSession(v)).toBeNull();
    expect([await count(staff), await count(passkeys), await count(signInAttempts)]).toEqual([1, 1, 1]);
  });

  it("someone with no sign-in yet is fine", async () => {
    await endRemoved("nobody@example.com");
    expect(await count(staff)).toBe(0);
  });
});

describe("the invitation on D1", () => {
  it("is one email with no token, and counts in the address's caps: 3 in 15 minutes", async () => {
    await db.insert(members).values({ dealerId: "test-motors", email: "sam@example.com", role: "Sales" });
    const now = Date.now();
    expect(await sendInvitation({ email: "sam@example.com", by: "Ciara Walsh", dealer: DEALER }, now)).toBe("sent");
    expect(sent).toEqual([{ to: "sam@example.com", subject: "You have been added to Test Motors", text: "Ciara Walsh added you to the Test Motors team on Checkwork.\n\nSign in at https://dev.dash.checkwork.ie with this email address." }]);
    const [row] = await db.select().from(signInAttempts).where(eq(signInAttempts.kind, "invite"));
    expect(row).toMatchObject({ email: "sam@example.com", codeHmac: null, tokenHmac: null, browserHash: null });
    // Two sign-in emails reach the cap of 3; the next invitation sends nothing, and so does the next sign-in request.
    expect(await sendSignIn({ email: "sam@example.com", browserHash: "b1", next: "/" }, now + 1)).toBe("sent");
    expect(await sendSignIn({ email: "sam@example.com", browserHash: "b2", next: "/" }, now + 2)).toBe("sent");
    expect(await sendInvitation({ email: "sam@example.com", by: "Ciara Walsh", dealer: DEALER }, now + 3)).toBe("limited");
    expect(await sendSignIn({ email: "sam@example.com", browserHash: "b3", next: "/" }, now + 4)).toBe("limited");
    expect(sent).toHaveLength(3);
    expect(await db.select().from(signInAttempts).where(eq(signInAttempts.kind, "invite"))).toHaveLength(1);
  });
});

describe("signOutEverywhere on D1", () => {
  it("ends every session, then at each dealer turns off their devices and writes one line in that dealer's own history", async () => {
    await db.insert(members).values({ dealerId: "test-motors", email: "sam@example.com", role: "Sales" });
    await db.insert(members).values({ dealerId: "checkwork-motors", email: "sam@example.com", role: "Sales" });
    const v = await signedIn();
    for (const d of ["checkwork-motors", "test-motors"])
      await runAsDealer(d, () => pushStore.put({ id: `p-${d}`, email: "sam@example.com", endpoint: "https://push.example/1", keys: { p256dh: "x", auth: "y" }, label: "iPhone", addedAt: 0 }));
    await signOutEverywhere("sam@example.com", (name, dealerId) => ({ summary: `Signed ${name} out on all devices`, actor: dealerId === "test-motors" ? "Ciara Walsh" : "Another dealer" }));
    expect(await readSession(v)).toBeNull();
    expect(await count(passkeys)).toBe(1); // passkeys stay
    for (const [d, actor] of [["checkwork-motors", "Another dealer"], ["test-motors", "Ciara Walsh"]]) {
      expect(await runAsDealer(d, () => pushStore.list()), d).toEqual([]);
      const [line] = (await runAsDealer(d, () => listActivity({ area: "settings" }, 1, 1))).rows;
      expect(line, d).toMatchObject({ actor, summary: "Signed sam@example.com out on all devices" });
    }
    await db.delete(members).where(eq(members.email, "sam@example.com"));
  });
});
