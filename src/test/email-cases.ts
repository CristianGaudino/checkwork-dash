import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Attempts from "@/lib/auth/attempts";
import type * as Signin from "@/lib/auth/email-signin";
import type * as Mail from "@/lib/auth/mail";
import type * as SessionModule from "@/lib/auth/session";
import type * as Directory from "@/lib/tenancy/directory";

// The emailed code and link (docs/sign-in.md, sections 3 and 5), run against the directory in memory (email-signin.test.ts) and on the SQLite
// stand-in for D1 with the real migrations (email-signin.int.test.ts), so both stores behave the same.
export type Store = {
  reset: () => Promise<void>;
  attempts: () => Promise<Attempts.Attempt[]>;
  patchAttempt: (id: string, patch: Partial<Attempts.Attempt>) => Promise<void>;
  patchStaff: (email: string, patch: Partial<Attempts.Person>) => Promise<void>;
};
type Lib = { s: typeof Signin; a: typeof Attempts; m: typeof Mail; sessions: typeof SessionModule; dir: typeof Directory };

export function emailCases(store: Store, { s, a, m, sessions, dir }: Lib) {
  const NOW = Date.parse("2026-11-22T09:00:00Z");
  const MIN = 60_000;
  const AOIFE = "aoife@example.com";
  const CONOR = "conor@example.com";
  const mails = (to: string) => m.outbox().filter((x) => x.to === to);
  const codeOf = (x: Mail.Mail) => /Your code is (\d{3}) (\d{3})/.exec(x.text)!.slice(1).join("");
  const tokenOf = (x: Mail.Mail) => /#t=([A-Za-z0-9_-]{43})/.exec(x.text)![1];
  const hash = (b: string) => `browser-${b}`;
  const ask = (email: string, b = "b1", at = NOW) => s.sendSignIn({ email, browserHash: hash(b), next: "/" }, at);
  const lastMail = (to: string) => mails(to).at(-1)!;
  const wrongOf = (code: string) => (code === "111111" ? "222222" : "111111");
  // A wrong code, then what the action does after the answer.
  const wrong = async (email: string, b = "b1", at = NOW) => {
    const r = await s.checkCode(hash(b), wrongOf(codeOf(lastMail(email))), at);
    if (!r.ok && r.countFor) await s.countWrong(r.countFor, at);
    return r;
  };
  const person = (email: string) => a.staffByEmail(email);

  describe("the emailed code and link", () => {
    beforeEach(async () => {
      vi.stubEnv("SIGN_IN_SECRET", "test-secret-test-secret-test-secret");
      vi.stubEnv("E2E_FAKE_BACKENDS", "1");
      await store.reset();
      m.outbox().length = 0;
    });

    it("stores only HMACs: never the code or the token, one link row per email sent", async () => {
      expect(await ask(AOIFE)).toBe("sent");
      const x = lastMail(AOIFE);
      const rows = await store.attempts();
      const strings = rows.flatMap((r) => Object.values(r)).filter((v) => typeof v === "string");
      expect(strings).not.toContain(codeOf(x));
      expect(strings.join("|")).not.toContain(tokenOf(x));
      expect(rows.find((r) => r.kind === "code")!.codeHmac).toMatch(/^[0-9a-f]{64}$/);
      expect(rows.filter((r) => r.kind === "link")).toHaveLength(1);
      expect(x.text).toContain("Only type the code at");
    });

    it("signs in with the right code once, in the browser that asked, and starts a session", async () => {
      await ask(AOIFE);
      const code = codeOf(lastMail(AOIFE));
      expect((await s.checkCode(hash("other"), code, NOW)).ok).toBe(false); // another browser
      const r = await s.checkCode(hash("b1"), code, NOW);
      expect(r).toMatchObject({ ok: true, email: AOIFE });
      expect((await s.checkCode(hash("b1"), code, NOW)).ok).toBe(false); // used
      if (!r.ok) throw new Error();
      const cookie = await s.completeSignIn(r.staffId, "iPhone", undefined, NOW);
      expect((await sessions.readSession(cookie, NOW))?.email).toBe(AOIFE);
    });

    it("lets only one of two posts at once sign in, and spends the try before comparing", async () => {
      await ask(AOIFE);
      const code = codeOf(lastMail(AOIFE));
      const both = await Promise.all([s.checkCode(hash("b1"), code, NOW), s.checkCode(hash("b1"), code, NOW)]);
      expect(both.filter((r) => r.ok)).toHaveLength(1);
      // with one try left, two posts at once: only one is compared at all
      await ask(CONOR, "b2");
      for (let i = 0; i < 4; i++) await wrong(CONOR, "b2");
      await Promise.all([s.checkCode(hash("b2"), wrongOf(codeOf(lastMail(CONOR))), NOW), s.checkCode(hash("b2"), wrongOf(codeOf(lastMail(CONOR))), NOW)]);
      expect((await store.attempts()).find((r) => r.browserHash === hash("b2") && r.kind === "code")!.tries).toBe(5);
    });

    it("kills a code after 5 tries, even the right one", async () => {
      await ask(AOIFE);
      for (let i = 0; i < 5; i++) expect((await wrong(AOIFE)).ok).toBe(false);
      expect((await s.checkCode(hash("b1"), codeOf(lastMail(AOIFE)), NOW)).ok).toBe(false);
    });

    it("gives an unknown email's page the same 5 tries, and nothing is sent", async () => {
      expect(await ask("stranger@example.com")).toBe("unknown");
      expect(m.outbox()).toHaveLength(0);
      for (let i = 0; i < 5; i++) expect(await s.checkCode(hash("b1"), "123456", NOW)).toEqual({ ok: false }); // spends a try each time
      const row = (await store.attempts()).find((r) => r.kind === "code")!;
      expect(row).toMatchObject({ tries: 5, email: null, codeHmac: null });
      expect(await s.checkCode(hash("b1"), "123456", NOW)).toEqual({ ok: false });
      expect((await store.attempts()).filter((r) => r.email)).toEqual([]); // nothing about the stranger is kept
    });

    it("refuses one row's code HMAC on another row", async () => {
      await ask(AOIFE, "b1");
      await ask(CONOR, "b2");
      const rows = (await store.attempts()).filter((r) => r.kind === "code");
      const [ra, rc] = [rows.find((r) => r.email === AOIFE)!, rows.find((r) => r.email === CONOR)!];
      await store.patchAttempt(rc.id, { codeHmac: ra.codeHmac });
      expect((await s.checkCode(hash("b2"), codeOf(lastMail(AOIFE)), NOW)).ok).toBe(false);
      expect((await s.checkCode(hash("b1"), codeOf(lastMail(AOIFE)), NOW)).ok).toBe(true);
    });

    it("expires the code and the link after 15 minutes", async () => {
      await ask(AOIFE);
      const x = lastMail(AOIFE);
      expect(await s.peekLink(tokenOf(x), NOW + 15 * MIN - 1)).not.toBeNull();
      expect(await s.peekLink(tokenOf(x), NOW + 15 * MIN)).toBeNull();
      expect((await s.checkCode(hash("b1"), codeOf(x), NOW + 15 * MIN)).ok).toBe(false);
    });

    it("sends 3 emails in 15 minutes and 6 in an hour to an address, then nothing, and sends again once they pass", async () => {
      for (let i = 0; i < 3; i++) expect(await ask(AOIFE, "b1", NOW + i)).toBe("sent");
      expect(await ask(AOIFE, "b1", NOW + 3)).toBe("limited");
      expect(mails(AOIFE)).toHaveLength(3);
      for (let i = 0; i < 3; i++) expect(await ask(AOIFE, "b1", NOW + 16 * MIN + i)).toBe("sent");
      expect(await ask(AOIFE, "b1", NOW + 32 * MIN)).toBe("limited"); // 6 in the hour
      expect(mails(AOIFE)).toHaveLength(6);
      expect(await ask(AOIFE, "b1", NOW + 60 * MIN + 3)).toBe("sent"); // an hour on, the first three no longer count
    });

    it("holds the caps under parallel requests: 10 at once send exactly 3 emails and leave one live code and link", async () => {
      const outcomes = await Promise.all(Array.from({ length: 10 }, (_, i) => ask(AOIFE, `p${i}`)));
      expect(outcomes.filter((o) => o === "sent")).toHaveLength(3);
      expect(outcomes.filter((o) => o === "limited")).toHaveLength(7);
      expect(mails(AOIFE)).toHaveLength(3);
      const live = (await store.attempts()).filter((r) => r.email === AOIFE && !r.usedAt && r.expiresAt.getTime() > NOW);
      expect(live.filter((r) => r.kind === "code")).toHaveLength(1);
      expect(live.filter((r) => r.kind === "link")).toHaveLength(1);
      expect((await store.attempts()).filter((r) => r.kind === "link")).toHaveLength(3);
    });

    it("ends the earlier code and link at a new email, but an over-limit request ends nothing", async () => {
      await ask(AOIFE, "b1", NOW);
      const first = lastMail(AOIFE);
      await ask(AOIFE, "b2", NOW + 1);
      expect(await s.peekLink(tokenOf(first), NOW + 2)).toBeNull();
      expect((await s.checkCode(hash("b1"), codeOf(first), NOW + 2)).ok).toBe(false);
      await ask(AOIFE, "b3", NOW + 2);
      const third = lastMail(AOIFE);
      expect(await ask(AOIFE, "b4", NOW + 3)).toBe("limited");
      expect(await s.peekLink(tokenOf(third), NOW + 4)).not.toBeNull(); // the last one sent still works
      expect((await s.checkCode(hash("b3"), codeOf(third), NOW + 4)).ok).toBe(true);
    });

    it("keeps the earlier code usable when the new email fails to send", async () => {
      await ask(AOIFE, "b1", NOW);
      const first = lastMail(AOIFE);
      vi.stubEnv("E2E_FAKE_BACKENDS", ""); // no way to send: the send throws
      await expect(ask(AOIFE, "b2", NOW + 1)).rejects.toThrow();
      vi.stubEnv("E2E_FAKE_BACKENDS", "1");
      expect((await s.checkCode(hash("b1"), codeOf(first), NOW + 2)).ok).toBe(true);
    });

    it("locks an address at 15 wrong codes across three codes, and it still gets a working link, counted in the caps", async () => {
      for (let i = 0; i < 3; i++) {
        await ask(AOIFE, `b${i}`, NOW + i * 16 * MIN);
        for (let j = 0; j < 5; j++) await wrong(AOIFE, `b${i}`, NOW + i * 16 * MIN + j);
      }
      expect((await person(AOIFE))!.codeLockedUntil!.getTime()).toBeGreaterThan(NOW + 24 * 60 * MIN);
      expect(mails(AOIFE).at(-1)!.text).toContain("Someone tried to sign in to Checkwork as you"); // one warning, at the lock
      const t = NOW + 3 * 16 * MIN;
      expect(await ask(AOIFE, "b9", t)).toBe("link-only");
      const x = lastMail(AOIFE);
      expect(x.text).toContain("Codes are paused for your address");
      expect(x.text).not.toContain("Your code is");
      expect(await s.checkCode(hash("b9"), "123456", t)).toEqual({ ok: false }); // that browser's code row has no code
      expect(await s.spendLink(tokenOf(x), t)).toMatchObject({ email: AOIFE });
      // counted in the caps: 3 in 15 minutes, nothing past them
      expect(await ask(AOIFE, "b9", t + 1)).toBe("link-only");
      expect(await ask(AOIFE, "b9", t + 2)).toBe("link-only");
      expect(await ask(AOIFE, "b9", t + 3)).toBe("limited"); // 3 in 15 minutes, and nothing past them
      expect(mails(AOIFE).filter((y) => y.subject === "Your Checkwork sign-in code")).toHaveLength(3 + 3);
    });

    it("sends the lock warning once", async () => {
      for (let i = 0; i < 3; i++) {
        await ask(AOIFE, `b${i}`, NOW + i * 16 * MIN);
        for (let j = 0; j < 5; j++) await wrong(AOIFE, `b${i}`, NOW + i * 16 * MIN + j);
      }
      await s.countWrong(AOIFE, NOW + 60 * MIN);
      expect(mails(AOIFE).filter((y) => y.subject.startsWith("Someone tried"))).toHaveLength(1);
    });

    it("refuses a matching code after the 15th wrong try, even before the lock is written", async () => {
      const old = (id: string, tries: number): Attempts.Attempt => ({ id, kind: "code", email: AOIFE, staffId: null, challenge: null, codeHmac: null, tokenHmac: null, browserHash: null, tries, createdAt: new Date(NOW - 60 * MIN), expiresAt: new Date(NOW - 30 * MIN), usedAt: null });
      for (const [prior, ok] of [[14, true], [15, false]] as const) {
        await store.reset();
        await ask(AOIFE, "b1", NOW);
        const live = (await store.attempts()).find((r) => r.kind === "code")!;
        await store.patchAttempt(live.id, { tries: 3 }); // 3 wrong already on the live code
        await a.addAttempt(old("old-a", 5));
        await a.addAttempt(old("old-b", 5));
        await a.addAttempt(old("old-c", prior - 13)); // the wrong tries in the last 24 hours: prior
        expect((await person(AOIFE))!.codeLockedUntil).toBeNull(); // the lock is not written: the count is still in flight
        expect((await s.checkCode(hash("b1"), codeOf(lastMail(AOIFE)), NOW)).ok, `prior ${prior}`).toBe(ok);
      }
    });

    it("turns codes off after 100 wrong in a row, until a sign-in resets the run", async () => {
      await ask(AOIFE, "b1", NOW);
      const live = codeOf(lastMail(AOIFE));
      await store.patchStaff(AOIFE, { codeFailures: 99 });
      await wrong(AOIFE, "b1", NOW);
      expect((await person(AOIFE))!.codeFailures).toBe(100);
      expect((await s.checkCode(hash("b1"), live, NOW)).ok).toBe(false); // off, whatever the code
      expect(await ask(AOIFE, "b2", NOW + 16 * MIN)).toBe("link-only");
      const who = await s.spendLink(tokenOf(lastMail(AOIFE)), NOW + 16 * MIN);
      await s.completeSignIn(who!.staffId, "Mac", undefined, NOW + 16 * MIN);
      expect((await person(AOIFE))!.codeFailures).toBe(0);
      expect(await ask(AOIFE, "b3", NOW + 32 * MIN)).toBe("sent");
    });

    it("does not let the link spend the code, or the code the link", async () => {
      await ask(AOIFE);
      const x = lastMail(AOIFE);
      expect(await s.spendLink(tokenOf(x), NOW)).toMatchObject({ email: AOIFE });
      expect(await s.spendLink(tokenOf(x), NOW)).toBeNull(); // once
      expect((await s.checkCode(hash("b1"), codeOf(x), NOW)).ok).toBe(true);
      await ask(CONOR, "b2");
      const y = lastMail(CONOR);
      expect((await s.checkCode(hash("b2"), codeOf(y), NOW)).ok).toBe(true);
      expect(await s.spendLink(tokenOf(y), NOW)).toMatchObject({ email: CONOR });
    });

    it("peeks at a link without using it, and names the person masked", async () => {
      await ask(AOIFE);
      const t = tokenOf(lastMail(AOIFE));
      expect(await s.peekLink(t, NOW)).toBe("ao…e@example.com");
      expect(await s.peekLink(t, NOW)).toBe("ao…e@example.com");
      expect(await s.spendLink(t, NOW)).not.toBeNull();
      expect(await s.peekLink(t, NOW)).toBeNull();
      expect(await s.peekLink("x".repeat(43), NOW)).toBeNull();
      expect(await s.peekLink("short", NOW)).toBeNull();
      expect(s.maskEmail("ciara@gmail.com")).toBe("ci…a@gmail.com");
      expect(s.maskEmail("bo@x.ie")).toBe("b…@x.ie");
    });

    it("refuses a code and a link for someone no longer on a team", async () => {
      await ask(AOIFE);
      const x = lastMail(AOIFE);
      await dir.removeMember("checkwork-motors", AOIFE);
      expect(await s.peekLink(tokenOf(x), NOW)).toBeNull();
      expect(await s.spendLink(tokenOf(x), NOW)).toBeNull();
      expect((await s.checkCode(hash("b1"), codeOf(x), NOW)).ok).toBe(false);
      expect(await ask(AOIFE, "b2", NOW + 1)).toBe("unknown");
      await dir.putMember("checkwork-motors", AOIFE, "Owner");
    });

    it("fails closed with no SIGN_IN_SECRET", async () => {
      vi.stubEnv("SIGN_IN_SECRET", "");
      await expect(ask(AOIFE)).rejects.toThrow("SIGN_IN_SECRET");
    });
  });
}
