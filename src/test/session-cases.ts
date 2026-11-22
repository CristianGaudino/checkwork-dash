import { beforeEach, describe, expect, it } from "vitest";
import type * as SessionModule from "@/lib/auth/session";

// Our sessions' lifecycle (docs/sign-in.md, section 4), run against the directory in memory (src/lib/auth/session.test.ts) and on the
// SQLite stand-in for D1 with the real migrations (session.int.test.ts), so both stores behave the same.
type Stored = { idHash: string; staffId: string; lastSeenAt: Date };
export function sessionCases(store: { reset: () => Promise<void>; addPerson: (id: string, email: string) => Promise<void>; stored: () => Promise<Stored[]> }, s: typeof SessionModule) {
  const NOW = Date.parse("2026-11-22T09:00:00Z");
  const H = 3_600_000;
  const start = (staffId = "p1", at = NOW) => s.startSession({ staffId, method: "email", label: "iPhone" }, undefined, at);
  const sha = async (v: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))).toString("hex");

  describe("a session", () => {
    beforeEach(async () => {
      await store.reset();
      await store.addPerson("p1", "aoife@example.com");
      await store.addPerson("p2", "conor@example.com");
    });

    it("is 32 random bytes in the cookie and only their SHA-256 in the table", async () => {
      const a = await start();
      const b = await start();
      expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(a).not.toBe(b);
      const rows = await store.stored();
      expect(rows.map((r) => r.idHash).sort()).toEqual([await sha(a), await sha(b)].sort());
      expect(JSON.stringify(rows)).not.toContain(a);
      expect(await s.readSession(a, NOW)).toEqual({ idHash: await sha(a), staffId: "p1", email: "aoife@example.com", verifiedAt: NOW });
    });

    it("ends after 12 hours with no request, and is deleted then", async () => {
      const v = await start();
      expect(await s.readSession(v, NOW + 12 * H - 1)).not.toBeNull(); // a request just in time keeps it going
      expect(await s.readSession(v, NOW + 24 * H - 2)).not.toBeNull();
      expect(await s.readSession(v, NOW + 36 * H)).toBeNull(); // idle again for 12 hours
      expect(await store.stored()).toEqual([]);
      expect(await s.readSession(v, NOW + 24 * H)).toBeNull(); // and stays ended
    });

    it("writes its last request at most once every 5 minutes", async () => {
      const v = await start();
      await s.readSession(v, NOW + 4 * 60_000);
      expect((await store.stored())[0].lastSeenAt.getTime()).toBe(NOW);
      await s.readSession(v, NOW + 5 * 60_000);
      expect((await store.stored())[0].lastSeenAt.getTime()).toBe(NOW + 5 * 60_000);
    });

    it("ends 7 days after sign-in, however busy", async () => {
      const v = await start();
      for (let t = NOW; t < NOW + 7 * 24 * H; t += 11 * H) expect(await s.readSession(v, t), String(t)).not.toBeNull();
      expect(await s.readSession(v, NOW + 7 * 24 * H)).toBeNull();
      expect(await store.stored()).toEqual([]);
    });

    it("ends at sign out (this device) and at sign out everywhere (every device of the person, no one else's)", async () => {
      const [a, b, c] = [await start(), await start(), await start("p2")];
      await s.endSession(a);
      expect(await s.readSession(a, NOW)).toBeNull();
      expect(await s.readSession(b, NOW)).not.toBeNull();
      const d = await start();
      await s.endSessionsOf("p1");
      expect(await s.readSession(b, NOW)).toBeNull();
      expect(await s.readSession(d, NOW)).toBeNull();
      expect(await s.readSession(c, NOW)).not.toBeNull();
    });

    it("ends the device's old one at a new sign-in, and the oldest when a 21st starts", async () => {
      const first = await start("p1", NOW);
      const replaced = await s.startSession({ staffId: "p1", method: "passkey", label: "Mac" }, first, NOW + 1);
      expect(await s.readSession(first, NOW + 2)).toBeNull();
      const all = [replaced];
      for (let i = 2; i <= s.SESSIONS_PER_PERSON; i++) all.push(await start("p1", NOW + i));
      const other = await start("p2", NOW);
      expect((await store.stored()).filter((r) => r.staffId === "p1")).toHaveLength(20);
      await start("p1", NOW + 100);
      expect((await store.stored()).filter((r) => r.staffId === "p1")).toHaveLength(20);
      expect(await s.readSession(all[0], NOW + 101)).toBeNull(); // the oldest
      expect(await s.readSession(all[1], NOW + 101)).not.toBeNull();
      expect(await s.readSession(other, NOW + 101)).not.toBeNull();
    });

    it("is nobody for a cookie that is not one of ours", async () => {
      await start();
      for (const v of ["", "x", "a".repeat(43), "a".repeat(44), "../../etc", "a".repeat(42) + "="]) expect(await s.readSession(v, NOW), v).toBeNull();
    });
  });
}
