import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The sign-in actions (docs/sign-in.md, sections 3 to 5) with Next's request context stood in for: what a browser would send and get back.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/staff", () => ({ signInOpen: async () => true }));
vi.mock("@/lib/push", () => ({ deviceLabel: (ua: string) => (/iPhone/.test(ua) ? "iPhone" : "Computer") }));
let sent: Record<string, string> = {};
let jar = new Map<string, string>();
let set: { name: string; value: string; [k: string]: unknown }[] = [];
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (n: string) => sent[n.toLowerCase()] ?? null }),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (c: (typeof set)[number]) => {
      set.push(c);
      jar.set(c.name, c.value);
    },
  }),
}));
let later: (() => Promise<unknown>)[] = [];
vi.mock("next/server", () => ({ after: (f: () => Promise<unknown>) => later.push(f) }));
let allowed = true;
vi.mock("@/lib/leads/bindings", () => ({ getBindings: () => ({ SIGN_IN_LIMITER: { limit: async () => ({ success: allowed }) } }) }));

const actions = await import("./actions");
const a = await import("@/lib/auth/attempts");
const mail = await import("@/lib/auth/mail");
const dir = await import("@/lib/tenancy/directory");

const ORIGIN = "https://www.dash.checkwork.ie";
const form = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.append(k, v), f), new FormData());
const flush = async () => {
  while (later.length) await later.shift()!();
};
// What an action throws to redirect or to 404: Next's digest.
const outcome = async (run: () => Promise<unknown>) => {
  try {
    return await run();
  } catch (e) {
    return (e as { digest?: string }).digest ?? String(e);
  }
};
const rows = () => dir.memoryDirectory().signInAttempts;
const mails = (to: string) => mail.outbox().filter((m) => m.to === to);
const codeOf = (to: string) => /Your code is (\d{3}) (\d{3})/.exec(mails(to).at(-1)!.text)!.slice(1).join("");
const tokenOf = (to: string) => /#t=([A-Za-z0-9_-]{43})/.exec(mails(to).at(-1)!.text)![1];
const attemptCookies = () => set.filter((c) => c.name === "__Host-cw_attempt");

beforeEach(() => {
  vi.stubEnv("SIGN_IN_SECRET", "test-secret-test-secret-test-secret");
  vi.stubEnv("E2E_FAKE_BACKENDS", "1");
  vi.stubEnv("APP_URL", ORIGIN);
  dir.resetMemoryDirectory();
  mail.outbox().length = 0;
  sent = { origin: ORIGIN, "cf-connecting-ip": "203.0.113.7", "user-agent": "Mozilla/5.0 (iPhone)" };
  jar = new Map();
  set = [];
  later = [];
  allowed = true;
});
afterEach(() => vi.unstubAllEnvs());

describe("Email me a code", () => {
  it("answers, sets the cookie and does the same work in front of the answer for known, unknown, locked and limited emails", async () => {
    const now = Date.now();
    await a.ensureStaff("conor@example.com", now);
    dir.memoryDirectory().staff.find((p) => p.email === "conor@example.com")!.codeLockedUntil = new Date(now + 3_600_000);
    for (let i = 0; i < 3; i++) await a.addAttempt({ id: `l${i}`, kind: "link", email: "ciara@example.com", staffId: null, challenge: null, codeHmac: null, tokenHmac: `h${i}`, browserHash: null, tries: 0, createdAt: new Date(now - 1000), expiresAt: new Date(now + 1000), usedAt: null });
    const results: { to: unknown; cookie: unknown }[] = [];
    for (const email of ["aoife@example.com", "nobody@example.com", "conor@example.com", "ciara@example.com"]) {
      set = [];
      const before = rows().length;
      const to = await outcome(() => actions.requestCode(undefined, form({ email: ` ${email.toUpperCase()} `, next: "/leads?status=new" })));
      const [c] = attemptCookies();
      expect(c.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const attrs = { ...c, value: undefined };
      expect(rows().length, `${email} wrote nothing before the answer`).toBe(before);
      results.push({ to, cookie: attrs });
      expect(mail.outbox().filter((m) => m.to === email)).toHaveLength(0); // no email yet either
      await flush();
    }
    expect(new Set(results.map((r) => JSON.stringify(r.to))).size).toBe(1);
    expect(results[0].to).toBe("NEXT_REDIRECT;replace;/sign-in/code?next=%2Fleads%3Fstatus%3Dnew;307;");
    expect(new Set(results.map((r) => JSON.stringify(r.cookie))).size).toBe(1);
    expect(results[0].cookie).toMatchObject({ name: "__Host-cw_attempt", httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 900 });
    // after the answer: a code email for the known one, a link-only email for the locked one, nothing for the unknown and the limited
    expect(mails("aoife@example.com")).toHaveLength(1);
    expect(mails("conor@example.com")[0].text).toContain("Codes are paused");
    expect(mails("nobody@example.com")).toHaveLength(0);
    expect(mails("ciara@example.com")).toHaveLength(0);
    expect(rows().filter((r) => r.kind === "code")).toHaveLength(4); // a code row for every request
  });

  it("is refused over the per-IP limit with a plain message, no cookie and no work", async () => {
    allowed = false;
    expect(await actions.requestCode(undefined, form({ email: "aoife@example.com" }))).toEqual({ error: "Too many tries. Wait a minute and try again." });
    expect(set).toEqual([]);
    expect(later).toEqual([]);
  });

  it("asks for a real address, and changes nothing otherwise", async () => {
    expect(await actions.requestCode(undefined, form({ email: "not an email" }))).toEqual({ error: "Enter your email address." });
    expect(set).toEqual([]);
  });

  it("sends a hostile next to the overview", async () => {
    expect(await outcome(() => actions.requestCode(undefined, form({ email: "aoife@example.com", next: "//evil.example/x" })))).toBe("NEXT_REDIRECT;replace;/sign-in/code;307;");
  });
});

describe("every sign-in action refuses a missing or foreign Origin, and does nothing", () => {
  for (const origin of [undefined, "null", "https://evil.example", "https://dev.dash.checkwork.ie"]) {
    it(`origin ${origin}`, async () => {
      if (origin) sent.origin = origin;
      else delete sent.origin;
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const token = "a".repeat(43);
      for (const run of [() => actions.requestCode(undefined, form({ email: "aoife@example.com" })), () => actions.submitCode(undefined, form({ code: "123456" })), () => actions.peekSignInLink(token), () => actions.signInWithLink(token, "/")])
        expect(await outcome(run)).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
      expect(set).toEqual([]);
      expect(later).toEqual([]);
      expect(rows()).toEqual([]);
      expect(log.mock.calls.map((c) => c[0])).toEqual(Array(4).fill(expect.stringContaining('"outcome":"bad-origin"')));
      log.mockRestore();
    });
  }
});

describe("the code and the link", () => {
  it("signs in with a code, sets the session cookie, ends the attempt cookie, emails a notice and goes to next", async () => {
    await outcome(() => actions.requestCode(undefined, form({ email: "aoife@example.com" })));
    await flush();
    const to = await outcome(() => actions.submitCode(undefined, form({ code: codeOf("aoife@example.com").replace(/(\d{3})(\d{3})/, "$1 $2"), next: "/leads?status=new" })));
    expect(to).toBe("NEXT_REDIRECT;replace;/leads?status=new;307;");
    expect(set.find((c) => c.name === "__Host-cw_session")).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 });
    expect(attemptCookies().at(-1)).toMatchObject({ value: "", maxAge: 0 });
    await flush();
    expect(mails("aoife@example.com").at(-1)!.text).toContain("A device signed in to Checkwork with an email code (iPhone,");
  });

  it("answers a wrong, malformed or missing code the same way and counts only after the answer", async () => {
    const wrong = { error: "That code did not work. Check it, or ask for a new one." };
    await outcome(() => actions.requestCode(undefined, form({ email: "aoife@example.com" })));
    await flush();
    const failures = () => dir.memoryDirectory().staff.find((p) => p.email === "aoife@example.com")!.codeFailures;
    expect(await actions.submitCode(undefined, form({ code: "000000" === codeOf("aoife@example.com") ? "111111" : "000000" }))).toEqual(wrong);
    expect(failures()).toBe(0); // not yet
    await flush();
    expect(failures()).toBe(1);
    expect(await actions.submitCode(undefined, form({ code: "12ab" }))).toEqual(wrong);
    jar.delete("__Host-cw_attempt");
    expect(await actions.submitCode(undefined, form({ code: "123456" }))).toEqual(wrong);
    expect(set.find((c) => c.name === "__Host-cw_session")).toBeUndefined();
  });

  it("peeks at a link without using it, and signs in with the button", async () => {
    await outcome(() => actions.requestCode(undefined, form({ email: "ciara@example.com", next: "/settings" })));
    await flush();
    const token = tokenOf("ciara@example.com");
    expect(mails("ciara@example.com")[0].text).toContain(`${ORIGIN}/sign-in/link?next=%2Fsettings#t=${token}`);
    expect(await actions.peekSignInLink(token)).toEqual({ email: "ci…a@example.com" });
    expect(await actions.peekSignInLink(token)).toEqual({ email: "ci…a@example.com" });
    expect(rows().find((r) => r.kind === "link")!.usedAt).toBeNull();
    expect(await actions.peekSignInLink("b".repeat(43))).toEqual({ expired: true });
    expect(await outcome(() => actions.signInWithLink(token, "/settings"))).toBe("NEXT_REDIRECT;replace;/settings;307;");
    expect(await actions.signInWithLink(token, "/")).toEqual({ expired: true }); // once
  });
});

describe("the log", () => {
  it("holds no email, code, token, address or cookie, only a step and an outcome", async () => {
    const lines: string[] = [];
    for (const m of ["log", "warn", "error", "info"] as const) vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
    const secrets: string[] = ["aoife@example.com", "ciara@example.com", "nobody@example.com", "203.0.113.7", "iPhone"];
    // a lock (15 wrong across three codes, the warning email), a code sign-in, a link sign-in, an unknown address, a bad origin
    for (let i = 0; i < 3; i++) {
      await outcome(() => actions.requestCode(undefined, form({ email: "aoife@example.com" })));
      await flush();
      secrets.push(codeOf("aoife@example.com"), tokenOf("aoife@example.com"), jar.get("__Host-cw_attempt")!);
      for (let j = 0; j < 5; j++) {
        await actions.submitCode(undefined, form({ code: "000000" === codeOf("aoife@example.com") ? "111111" : "000000" }));
        await flush();
      }
      // a new request is only allowed 3 in 15 minutes, which is exactly this loop
    }
    expect(mails("aoife@example.com").some((m) => m.subject.startsWith("Someone tried"))).toBe(true);
    await outcome(() => actions.requestCode(undefined, form({ email: "ciara@example.com" })));
    await flush();
    secrets.push(codeOf("ciara@example.com"), tokenOf("ciara@example.com"), jar.get("__Host-cw_attempt")!);
    await outcome(() => actions.submitCode(undefined, form({ code: codeOf("ciara@example.com") })));
    await outcome(() => actions.signInWithLink(tokenOf("ciara@example.com"), "/"));
    await outcome(() => actions.requestCode(undefined, form({ email: "nobody@example.com" })));
    await flush();
    sent.origin = "https://evil.example";
    await outcome(() => actions.requestCode(undefined, form({ email: "aoife@example.com" })));
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, string>;
      expect(Object.keys(parsed).sort(), line).toEqual(["outcome", "signIn"]);
      for (const secret of secrets) expect(line, secret).not.toContain(secret);
    }
    expect(lines.some((l) => l.includes('"locked"'))).toBe(true);
    vi.restoreAllMocks();
  });
});
