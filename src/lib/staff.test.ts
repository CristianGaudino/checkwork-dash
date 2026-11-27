import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/lib/staff"); // the setup stubs it for the action tests; this file tests the real one
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // and the real dealer check behind requireStaff
vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
let sent: Record<string, string> = {};
let jar: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => ({ get: (n: string) => sent[n] ?? null }), cookies: async () => ({ get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) }) }));
// Whether a real directory is bound (the Worker): set per test.
let bound = false;
vi.mock("@/lib/leads/bindings", () => ({ getBindings: () => (bound ? { DIRECTORY: {} } : {}) }));
const verify = vi.fn();
vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), verifyAccessJwt: (...a: unknown[]) => verify(...a) }));
const { pageGate, requireStaff, signInOpen, staffIdentity, toSignIn } = await import("./staff");
const { endSession, startSession } = await import("@/lib/auth/session");
const { dealerAccess } = await import("@/lib/tenancy/membership");
const { currentDealer } = await import("@/lib/tenancy/current");
const { memoryDirectory, resetMemoryDirectory } = await import("@/lib/tenancy/directory");

afterEach(() => {
  vi.unstubAllEnvs();
  sent = {};
  jar = {};
  verify.mockReset();
  bound = false;
  resetMemoryDirectory();
});
const access = () => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
  vi.stubEnv("CF_ACCESS_AUD", "aud");
};

describe("who the dashboard is talking to", () => {
  it("is staff with the email Access signed for, never one a header says", async () => {
    access();
    verify.mockResolvedValueOnce({ email: "Owner@Dealer.example" });
    sent = { "cf-access-jwt-assertion": "a.b.c", "x-admin-email": "forged@evil.example" };
    expect(await staffIdentity()).toEqual({ ok: true, email: "owner@dealer.example" });
  });

  it("is nobody with no token, a forged token, or no Access set up, and an action then answers as if it were not there", async () => {
    sent = { "x-admin-email": "owner@dealer.example" };
    expect(await staffIdentity()).toEqual({ ok: false });
    access();
    expect(await staffIdentity()).toEqual({ ok: false });
    verify.mockResolvedValueOnce(null);
    sent = { "cf-access-jwt-assertion": "forged" };
    expect(await staffIdentity()).toEqual({ ok: false });
    await expect(requireStaff()).rejects.toThrow();
  });

  it("is open where the dashboard is open (development, the E2E build)", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "1");
    expect(await staffIdentity()).toEqual({ ok: true, email: "dev@checkwork.invalid" });
    await expect(requireStaff()).resolves.toBeUndefined(); // a member of the demo dealer, opened by default
  });

  it("is never open with a real directory bound, whatever the build says: Access decides", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "1");
    bound = true;
    expect(await staffIdentity()).toEqual({ ok: false });
    access();
    verify.mockResolvedValueOnce({ email: "owner@dealer.example" });
    sent = { "cf-access-jwt-assertion": "a.b.c" };
    expect(await staffIdentity()).toEqual({ ok: true, email: "owner@dealer.example" });
  });

  it("refuses an action from someone Access let in who works at no dealer", async () => {
    access();
    verify.mockResolvedValueOnce({ email: "stranger@dealer.example" });
    sent = { "cf-access-jwt-assertion": "a.b.c" };
    await expect(requireStaff()).rejects.toThrow();
  });
});

// ---- Our own sign-in's switch (docs/sign-in.md, sections 4 and 7) ----
const H = 3_600_000;
const person = (id: string, email: string) => memoryDirectory().staff.push({ id, email, codeFailures: 0, codeLockedUntil: null, createdAt: new Date() });
// The session cookie a browser would send, in each state: a good one (for whom), idle 12 hours, past its 7 days, or ended by sign out.
async function cookie(state: "none" | "good" | "idle" | "expired" | "ended", staffId = "aoife") {
  if (state === "none") return;
  const value = await startSession({ staffId, method: "email", label: "iPhone" }, undefined, state === "idle" ? Date.now() - 13 * H : state === "expired" ? Date.now() - 8 * 24 * H : Date.now());
  if (state === "expired") memoryDirectory().sessions.at(-1)!.lastSeenAt = new Date(); // busy all along, but past the 7 days
  if (state === "ended") await endSession(value);
  jar = { "__Host-cw_session": value };
}
const signedIn = async () => {
  const who = await staffIdentity();
  return who.ok ? who.email : null;
};
const withAccess = (email: string) => {
  access();
  verify.mockResolvedValue({ email });
  sent = { ...sent, "cf-access-jwt-assertion": "a.b.c" };
};
const DEAD = ["idle", "expired", "ended"] as const;
const sentTo = (p: Promise<unknown>) => p.then(() => "no redirect", (e: { digest?: string }) => e.digest ?? String(e));

describe("SIGN_IN: who is signed in, in each mode", () => {
  beforeEach(() => {
    person("aoife", "aoife@example.com");
    person("conor", "conor@example.com");
  });

  it("access, and an unset or unknown value: Access alone decides, and our cookie changes nothing, good, dead or someone else's", async () => {
    for (const mode of [undefined, "", "access", "OWN", "Both", "bogus"]) {
      if (mode !== undefined) vi.stubEnv("SIGN_IN", mode);
      for (const state of ["none", "good", ...DEAD] as const) {
        jar = {};
        sent = {};
        verify.mockReset();
        access();
        await cookie(state, "conor");
        expect(await signedIn(), `${mode} ${state} no token`).toBeNull(); // a session of ours never lets anyone in here
        withAccess("Owner@Dealer.example");
        expect(await signedIn(), `${mode} ${state} token`).toBe("owner@dealer.example"); // nor changes who Access said
      }
    }
  });

  it("both: always the Access email; a live session must be that person, a dead one counts as none", async () => {
    vi.stubEnv("SIGN_IN", "both");
    withAccess("Aoife@Example.com");
    for (const state of ["none", "good", ...DEAD] as const) {
      jar = {};
      await cookie(state);
      expect(await signedIn(), state).toBe("aoife@example.com");
    }
    await cookie("good", "conor"); // a session for someone other than the one Access signed for
    expect(await signedIn()).toBeNull();
    await expect(requireStaff()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("both: no valid Access token is nobody, even with a good session (Bypass turned on before the var moves to own)", async () => {
    vi.stubEnv("SIGN_IN", "both");
    access();
    await cookie("good");
    expect(await signedIn()).toBeNull();
    verify.mockResolvedValue(null);
    sent = { "cf-access-jwt-assertion": "forged" };
    expect(await signedIn()).toBeNull();
  });

  it("own: only a live session, whatever Access says", async () => {
    vi.stubEnv("SIGN_IN", "own");
    withAccess("aoife@example.com");
    for (const state of ["none", ...DEAD] as const) {
      jar = {};
      await cookie(state);
      expect(await signedIn(), state).toBeNull(); // an Access token alone lets no one in
    }
    await cookie("good");
    expect(await signedIn()).toBe("aoife@example.com");
    sent = {};
    expect(await signedIn()).toBe("aoife@example.com"); // and none is needed
    jar = { "__Host-cw_session": "forged-value" };
    expect(await signedIn()).toBeNull();
  });

  it("the open shortcut stays refused with a directory bound in every mode, and E2E_SIGN_IN only closes it", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "1");
    for (const mode of ["", "both", "own"]) {
      vi.stubEnv("SIGN_IN", mode);
      bound = true;
      expect(await signedIn(), mode).toBeNull();
      bound = false;
      expect(await signedIn(), mode).toBe("dev@checkwork.invalid");
      vi.stubEnv("E2E_SIGN_IN", "1");
      expect(await signedIn(), mode).toBeNull();
      vi.stubEnv("E2E_SIGN_IN", "");
    }
  });
});

describe("SIGN_IN: the sign-in pages, and a signed-out page", () => {
  beforeEach(() => void person("aoife", "aoife@example.com"));

  it("the sign-in pages and /sign-out are not there under Access alone, sit behind Access in both, and are open in own", async () => {
    for (const mode of ["", "access", "bogus"]) {
      vi.stubEnv("SIGN_IN", mode);
      withAccess("aoife@example.com");
      expect(await signInOpen(), mode).toBe(false);
    }
    vi.stubEnv("SIGN_IN", "both");
    sent = {};
    expect(await signInOpen()).toBe(false);
    withAccess("aoife@example.com");
    expect(await signInOpen()).toBe(true);
    vi.stubEnv("SIGN_IN", "own");
    sent = {};
    expect(await signInOpen()).toBe(true);
  });

  it("under Access alone nothing redirects to sign in, whatever the headers say", async () => {
    for (const mode of ["", "access", "bogus"]) {
      vi.stubEnv("SIGN_IN", mode);
      sent = { "x-cw-path": "/leads" };
      expect(await sentTo(toSignIn())).toBe("no redirect");
      expect(await sentTo(dealerAccess())).toBe("no redirect");
      expect(await dealerAccess()).toEqual({ state: "signed-out" });
    }
  });

  it("own: a dead cookie (and both: someone else's session) sends a page load to sign in from dealerAccess, which every page and store asks, and 404s an action", async () => {
    person("conor", "conor@example.com");
    const cases = [...DEAD.map((state) => ["own", state, "aoife"] as const), ["both", "good", "conor"] as const];
    for (const [mode, state, whose] of cases) {
      vi.stubEnv("SIGN_IN", mode);
      jar = {};
      sent = {};
      if (mode === "both") withAccess("aoife@example.com");
      await cookie(state, whose);
      expect((await staffIdentity()).ok, `${mode} ${state}`).toBe(false);
      sent = { ...sent, "x-cw-path": "/leads?status=new" }; // a page load or a client-side navigation: the proxy set the path
      expect(await sentTo(dealerAccess()), `${mode} ${state}`).toMatch(/^NEXT_REDIRECT;replace;\/sign-in\?next=%2Fleads%3Fstatus%3Dnew;307;/);
      expect(await sentTo(currentDealer()), `${mode} ${state}`).toMatch(/^NEXT_REDIRECT;replace;\/sign-in\?/); // a store asking first
      sent = { ...sent, "x-cw-path": "" }; // a POST (a server action, a plain form): the proxy leaves the path empty
      await expect(dealerAccess()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/); // not there, never a redirect
      await expect(currentDealer()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/); // whichever store asks first
      await expect(requireStaff()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
      const { "x-cw-path": _, ...outside } = sent; // a page the proxy gives no path (the sign-in pages): no path, so no loop
      sent = outside;
      expect(await dealerAccess()).toEqual({ state: "signed-out" });
    }
  });

  it("the root layout draws a page the proxy gives no path bare, in every mode, so its own notFound() answers 404", async () => {
    for (const mode of ["", "both", "own"]) {
      vi.stubEnv("SIGN_IN", mode);
      sent = {};
      expect(await pageGate()).toBe("bare");
      sent = { "x-cw-path": "/" };
      expect(await pageGate()).toBe("frame");
      sent = { "x-cw-path": "" };
      expect(await pageGate()).toBe("frame");
    }
  });

  it("builds next only through the one rule", async () => {
    vi.stubEnv("SIGN_IN", "own");
    sent = { "x-cw-path": "//evil.example" };
    expect(await sentTo(toSignIn())).toMatch(/^NEXT_REDIRECT;replace;\/sign-in\?next=%2F;/);
  });
});
