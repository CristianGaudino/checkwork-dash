import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Settings, Team and our sign-in (docs/sign-in.md, section 1, build step 6), at a dealer that is not a demo (Test Motors, where the open
// app's person is the owner): the invitation, removal ending the person's sessions, and "Sign out on all devices".
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
// Who is signed in and where (vitest.setup.ts puts everyone at the demo): the open app's person at `dealer`, with the role the directory gives
// them there, as the real dealerAccess() would.
let dealer = "test-motors";
vi.mock("@/lib/tenancy/membership", async (orig) => {
  const dir = await import("@/lib/tenancy/directory");
  return {
    ...(await orig<typeof import("@/lib/tenancy/membership")>()),
    dealerAccess: async () => {
      const role = (await dir.membersOf(dealer)).find((m) => m.email === dir.DEV_EMAIL)?.role;
      return { state: "ok", dealer: await dir.dealerById(dealer), role, email: dir.DEV_EMAIL, choices: [] };
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
const mails: { to: string; subject: string; text: string }[] = [];
let mailDown = false;
vi.mock("@/lib/auth/mail", () => ({ sendSignInMail: async (m: (typeof mails)[number]) => (mailDown ? Promise.reject(new Error(m.to)) : void mails.push(m)) }));
// Push removal with a switch to make it fail at one dealer, as a dealer's store being down would.
let pushDownAt: string | null = null;
vi.mock("@/lib/push", async (orig) => {
  const real = await orig<typeof import("@/lib/push")>();
  const { currentDealer } = await import("@/lib/tenancy/current");
  return { ...real, removePushOf: async (e: string) => ((await currentDealer()).id === pushDownAt ? Promise.reject(new Error(e)) : real.removePushOf(e)) };
});
const { addTeamAction, removeTeamAction, signOutPersonAction } = await import("./actions");
const { getSettings, settingsStore } = await import("@/lib/admin/collections");
const { listActivity } = await import("@/lib/admin/activity");
const { DEMO_ROLE_REFUSED } = await import("@/lib/permissions");
const { DEV_EMAIL, memoryDirectory, membersOf, putMember, resetMemoryDirectory } = await import("@/lib/tenancy/directory");
const { readSession, startSession } = await import("@/lib/auth/session");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { pushStore } = await import("@/lib/push");

const form = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.append(k, v), f), new FormData());
const add = (name: string, email: string, role = "Sales") => addTeamAction(undefined, form({ name, email, role }));
const idOf = async (email: string) => (await getSettings()).team.find((t) => t.email === email)!.id;
const signIn = (id: string, email: string) => {
  memoryDirectory().staff.push({ id, email, codeFailures: 0, codeLockedUntil: null, createdAt: new Date() });
  return startSession({ staffId: id, method: "email", label: "iPhone" });
};
const asRole = (role: "Owner" | "Manager" | "Sales") => putMember("test-motors", DEV_EMAIL, role);
let log: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  resetMemoryDirectory();
  dealer = "test-motors";
  mails.length = 0;
  mailDown = false;
  pushDownAt = null;
  vi.stubEnv("SIGN_IN", "own");
  vi.stubEnv("APP_URL", "https://dev.dash.checkwork.ie");
  for (const d of ["test-motors", "checkwork-motors"]) await runAsDealer(d, () => settingsStore.reset());
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  log.mockRestore();
});

describe("the invitation", () => {
  it("is sent when an owner or manager adds someone: the dealer and who added them, a plain link, no token", async () => {
    expect((await add("Sam Reilly", "Sam@Example.com"))?.saved).toBe(true);
    expect(mails).toEqual([{ to: "sam@example.com", subject: "You have been added to Test Motors", text: `${DEV_EMAIL} added you to the Test Motors team on Checkwork.\n\nSign in at https://dev.dash.checkwork.ie with this email address.` }]);
    await asRole("Manager");
    expect((await add("Orla Byrne", "orla@example.com"))?.saved).toBe(true);
    expect(mails.map((m) => m.to)).toEqual(["sam@example.com", "orla@example.com"]);
    expect(log.mock.calls.map((c: unknown[]) => c[0])).toEqual([JSON.stringify({ signIn: "invite", outcome: "ok" }), JSON.stringify({ signIn: "invite", outcome: "ok" })]); // no address
  });

  it("is never sent by someone who may not change the team, nor for an owner a manager may not add", async () => {
    await asRole("Sales");
    expect((await add("Sam Reilly", "sam@example.com"))?.errors?.role).toMatch(/owner or manager/);
    await asRole("Manager");
    expect((await add("Big Boss", "boss@example.com", "Owner"))?.errors?.role).toMatch(/Only an owner/);
    expect(mails).toEqual([]);
  });

  it("is not sent while SIGN_IN is access, nor from a demo dealer, and the person is added either way", async () => {
    vi.stubEnv("SIGN_IN", "");
    expect((await add("Sam Reilly", "sam@example.com"))?.saved).toBe(true);
    dealer = "checkwork-motors";
    expect((await add("Orla Byrne", "orla@example.com"))?.saved).toBe(true);
    expect(mails).toEqual([]);
    expect((await membersOf("checkwork-motors")).map((m) => m.email)).toContain("orla@example.com");
  });

  it("over the address's email caps sends nothing, and a failed send never undoes the add", async () => {
    await add("Other", "other@example.com"); // the team is never empty, so sam can go
    for (let i = 0; i < 3; i++) {
      await add(`Sam ${i}`, "sam@example.com");
      await removeTeamAction(await idOf("sam@example.com"));
    }
    expect(mails.filter((m) => m.to === "sam@example.com")).toHaveLength(3); // the cap: 3 in 15 minutes, which removing them does not reset
    expect((await add("Sam again", "sam@example.com"))?.saved).toBe(true);
    expect(mails.filter((m) => m.to === "sam@example.com")).toHaveLength(3);
    mailDown = true;
    expect((await add("Orla Byrne", "orla@example.com"))?.saved).toBe(true);
    expect((await membersOf("test-motors")).map((m) => m.email)).toContain("orla@example.com");
    expect(log.mock.calls.flat()).toContain(JSON.stringify({ signIn: "invite", outcome: "send-failed" }));
    expect(log.mock.calls.flat().join()).not.toContain("orla@");
  });
});

describe("removal from the team", () => {
  it("ends the person's sessions, and their sign-in when they are at no dealer now", async () => {
    await add("Sam Reilly", "sam@example.com");
    await add("Orla Byrne", "orla@example.com");
    const v = await signIn("sam", "sam@example.com");
    await removeTeamAction(await idOf("sam@example.com"));
    expect(await readSession(v)).toBeNull();
    expect(memoryDirectory().staff.map((p) => p.id)).not.toContain("sam");
  });
});

describe("Sign out on all devices", () => {
  beforeEach(async () => {
    await add("Sam Reilly", "sam@example.com", "Manager");
    await add("Aoife Boss", "boss@example.com", "Owner");
    await putMember("checkwork-motors", "sam@example.com", "Sales"); // Sam is at the demo too
  });

  it("an owner ends every session of the person, at every dealer, turns off their devices and writes it in each history", async () => {
    const [a, b] = [await signIn("sam", "sam@example.com"), await startSession({ staffId: "sam", method: "passkey", label: "Mac" })];
    const boss = await signIn("boss", "boss@example.com");
    for (const d of ["test-motors", "checkwork-motors"]) await runAsDealer(d, () => pushStore.put({ id: `p-${d}`, email: "sam@example.com", endpoint: "https://push.example/1", keys: { p256dh: "x", auth: "y" }, label: "iPhone", addedAt: 0 }));
    expect(await signOutPersonAction(await idOf("sam@example.com"))).toBeUndefined();
    expect([await readSession(a), await readSession(b)]).toEqual([null, null]);
    expect(await readSession(boss)).not.toBeNull(); // only theirs
    expect((await membersOf("test-motors")).map((m) => m.email)).toContain("sam@example.com"); // still on the team
    for (const d of ["test-motors", "checkwork-motors"]) expect(await runAsDealer(d, () => pushStore.list())).toEqual([]);
    expect((await runAsDealer("test-motors", () => listActivity({ area: "settings" }, 1, 1))).rows[0]).toMatchObject({ actor: DEV_EMAIL, summary: "Signed Sam Reilly out on all devices" });
    // At the other dealer, the name it knows them by, and not who did it here.
    expect((await runAsDealer("checkwork-motors", () => listActivity({ area: "settings" }, 1, 1))).rows[0]).toMatchObject({ actor: "Another dealer", summary: expect.stringMatching(/^Signed .+ out on all devices$/) });
  });

  it("ends the sessions first: a dealer whose store fails stops neither that nor the next dealer's line", async () => {
    const v = await signIn("sam", "sam@example.com");
    pushDownAt = "test-motors"; // the first of Sam's dealers
    expect(await signOutPersonAction(await idOf("sam@example.com"))).toBeUndefined();
    expect(await readSession(v)).toBeNull();
    expect((await runAsDealer("checkwork-motors", () => listActivity({ area: "settings" }, 1, 1))).rows[0]).toMatchObject({ actor: "Another dealer", summary: expect.stringMatching(/out on all devices$/) });
    expect(log.mock.calls.flat()).toContain(JSON.stringify({ signIn: "sign-out", outcome: "failed" }));
    expect(log.mock.calls.flat().join()).not.toContain("sam@");
  });

  it("turns off their devices at a paused dealer too: every device is every device", async () => {
    memoryDirectory().dealers.find((d) => d.id === "checkwork-motors")!.status = "paused";
    await runAsDealer("checkwork-motors", () => pushStore.put({ id: "p", email: "sam@example.com", endpoint: "https://push.example/1", keys: { p256dh: "x", auth: "y" }, label: "iPhone", addedAt: 0 }));
    await signOutPersonAction(await idOf("sam@example.com"));
    expect(await runAsDealer("checkwork-motors", () => pushStore.list())).toEqual([]);
  });

  it("at a demo dealer, the demo bar's Owner cannot do it for a directory role of Sales", async () => {
    dealer = "checkwork-motors";
    await putMember("checkwork-motors", DEV_EMAIL, "Sales"); // the demo bar's role is Owner (no cookie)
    const conor = await signIn("conor", "conor@example.com");
    expect(await signOutPersonAction(await idOf("conor@example.com"))).toEqual({ error: DEMO_ROLE_REFUSED });
    expect(await readSession(conor)).not.toBeNull();
  });

  it("a manager signs out anyone but an owner", async () => {
    await asRole("Manager");
    const boss = await signIn("boss", "boss@example.com");
    expect(await signOutPersonAction(await idOf("boss@example.com"))).toEqual({ error: "Only an owner can change an owner" });
    expect(await readSession(boss)).not.toBeNull();
    const sam = await signIn("sam", "sam@example.com");
    expect(await signOutPersonAction(await idOf("sam@example.com"))).toBeUndefined();
    expect(await readSession(sam)).toBeNull();
  });

  it("is refused to Sales and Finance, and is not there at all while SIGN_IN is access", async () => {
    const sam = await signIn("sam", "sam@example.com");
    await asRole("Sales");
    expect((await signOutPersonAction(await idOf("sam@example.com")))?.error).toMatch(/owner or manager/);
    await asRole("Owner");
    vi.stubEnv("SIGN_IN", "");
    await expect(signOutPersonAction(await idOf("sam@example.com"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await readSession(sam)).not.toBeNull();
  });
});
