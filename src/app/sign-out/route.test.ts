import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// /sign-out (docs/sign-in.md, section 4): Origin checked, Clear-Site-Data sent, the cookie deleted, and only where our sign-in is on.
vi.mock("server-only", () => ({}));
let open = true;
vi.mock("@/lib/staff", () => ({ signInOpen: async () => open }));
let jar: Record<string, string> = {};
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) }) }));
const { POST } = await import("./route");
const { readSession, startSession } = await import("@/lib/auth/session");
const { memoryDirectory, putMember, resetMemoryDirectory } = await import("@/lib/tenancy/directory");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { pushStore } = await import("@/lib/push");
const { listActivity } = await import("@/lib/admin/activity");

const APP = "http://localhost:3002";
const signOut = (origin: string | undefined, everywhere = false) => {
  const body = new FormData();
  if (everywhere) body.set("everywhere", "1");
  return POST(new Request(`${APP}/sign-out`, { method: "POST", body, headers: origin === undefined ? {} : { origin } }));
};
const start = (staffId: string) => startSession({ staffId, method: "email", label: "iPhone" });
let log: MockInstance;

beforeEach(async () => {
  vi.stubEnv("APP_URL", APP);
  for (const d of ["checkwork-motors", "test-motors"]) await runAsDealer(d, () => pushStore.reset());
  for (const [id, email] of [["aoife", "aoife@example.com"], ["conor", "conor@example.com"]]) memoryDirectory().staff.push({ id, email, codeFailures: 0, codeLockedUntil: null, createdAt: new Date() });
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMemoryDirectory();
  jar = {};
  open = true;
  log.mockRestore();
});

describe("/sign-out", () => {
  it("refuses a missing, null or foreign Origin and ends nothing", async () => {
    const v = await start("aoife");
    jar = { "__Host-cw_session": v };
    for (const o of [undefined, "null", "https://evil.example", "https://demo.checkwork.ie", "http://localhost:3000"]) {
      const res = await signOut(o);
      expect(res.status, String(o)).toBe(403);
      expect(res.headers.get("set-cookie"), String(o)).toBeNull();
    }
    expect(await readSession(v)).not.toBeNull();
    expect(log).toHaveBeenCalledWith(JSON.stringify({ signIn: "sign-out", outcome: "bad-origin" }));
  });

  it("ends this device's session, deletes the cookie and sends Clear-Site-Data, then sign in", async () => {
    const [mine, other] = [await start("aoife"), await start("aoife")];
    jar = { "__Host-cw_session": mine };
    const res = await signOut(APP);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/sign-in");
    expect(res.headers.get("clear-site-data")).toBe('"cache"');
    const cookie = (res.headers.get("set-cookie") ?? "").split("; ");
    expect(cookie[0]).toBe("__Host-cw_session=");
    expect(cookie).toEqual(expect.arrayContaining(["Path=/", "Max-Age=0", "Secure", "HttpOnly", "SameSite=lax"]));
    expect(await readSession(mine)).toBeNull();
    expect(await readSession(other)).not.toBeNull();
    expect(log.mock.calls).toEqual([[JSON.stringify({ signIn: "sign-out", outcome: "ok" })]]); // never a cookie or an email
  });

  it("everywhere ends every session of the person and no one else's", async () => {
    const [mine, phone, conor] = [await start("aoife"), await start("aoife"), await start("conor")];
    jar = { "__Host-cw_session": mine };
    expect((await signOut(APP, true)).status).toBe(303);
    expect(await readSession(mine)).toBeNull();
    expect(await readSession(phone)).toBeNull();
    expect(await readSession(conor)).not.toBeNull();
  });

  it("everywhere turns off their notifications on every device, at every dealer they are at, and says so in each history", async () => {
    await putMember("test-motors", "aoife@example.com", "Sales");
    const device = (id: string, email: string) => ({ id, email, endpoint: `https://push.example/${id}`, keys: { p256dh: "x", auth: "y" }, label: "iPhone", addedAt: 0 });
    for (const d of ["checkwork-motors", "test-motors"]) await runAsDealer(d, () => pushStore.put(device(`aoife-${d}`, "aoife@example.com")));
    await runAsDealer("checkwork-motors", () => pushStore.put(device("conor", "conor@example.com")));
    jar = { "__Host-cw_session": await start("aoife") };
    await signOut(APP, true);
    for (const d of ["checkwork-motors", "test-motors"]) {
      expect((await runAsDealer(d, () => pushStore.list())).map((p) => p.email), d).not.toContain("aoife@example.com");
      expect((await runAsDealer(d, () => listActivity({ area: "settings" }, 1, 1))).rows[0], d).toMatchObject({ summary: "Signed out everywhere" });
    }
    expect((await runAsDealer("checkwork-motors", () => pushStore.list())).map((p) => p.id)).toEqual(["conor"]);
    expect(log.mock.calls).toEqual([[JSON.stringify({ signIn: "sign-out", outcome: "ok" })]]);
  });

  it("a plain sign out leaves their notifications on (this device's go with Settings, Your sign-in)", async () => {
    await runAsDealer("checkwork-motors", () => pushStore.put({ id: "a", email: "aoife@example.com", endpoint: "https://push.example/a", keys: { p256dh: "x", auth: "y" }, label: "iPhone", addedAt: 0 }));
    jar = { "__Host-cw_session": await start("aoife") };
    await signOut(APP);
    expect(await runAsDealer("checkwork-motors", () => pushStore.list())).toHaveLength(1);
  });

  it("with no session or a dead one, still clears the cookie", async () => {
    jar = { "__Host-cw_session": "x".repeat(43) };
    const res = await signOut(APP, true);
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toMatch(/^__Host-cw_session=;/);
  });

  it("is not there while SIGN_IN is access (or both without Access)", async () => {
    open = false;
    const res = await signOut(APP);
    expect(res.status).toBe(404);
    expect(res.headers.get("clear-site-data")).toBeNull();
  });
});
