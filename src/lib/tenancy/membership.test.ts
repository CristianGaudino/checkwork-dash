import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn })); // a fresh answer per call
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // the real one, not the setup's stand-in
// Who Access signed for, and the dealer cookie the browser sends: set per test.
let email: string | undefined;
let picked: string | undefined;
const set = vi.fn();
vi.mock("@/lib/staff", () => ({ staffIdentity: async () => (email === undefined ? { ok: false } : { ok: true, email }), requireStaff: async () => {}, toSignIn: async () => {} }));
let pickedBefore: string | undefined; // the dealer cookie's name before it moved to __Host- (sign-in step 3)
const jarValue = (n: string) => (n === "__Host-cw_dealer" ? picked : n === "checkwork-dealer" ? pickedBefore : undefined);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jarValue(n) !== undefined ? { value: jarValue(n) } : undefined), set }), headers: async () => ({ get: () => null }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
const { dealerAccess } = await import("./membership");
const { currentDealer } = await import("./current");
const { putMember, resetMemoryDirectory } = await import("./directory");
const { chooseDealerAction } = await import("@/app/dealers/actions");
const { GET: openDealer } = await import("@/app/dealers/open/route");
const open = (dealer: string, to: string) => openDealer(new Request(`http://localhost/dealers/open?${new URLSearchParams({ dealer, to })}`));

const form = (dealer: string) => {
  const f = new FormData();
  f.set("dealer", dealer);
  return f;
};
const ok = async () => {
  const a = await dealerAccess();
  return a.state === "ok" ? a.dealer.id : a.state;
};

beforeEach(() => resetMemoryDirectory());
afterEach(() => {
  email = picked = pickedBefore = undefined;
  set.mockClear();
  vi.unstubAllEnvs();
});

describe("the current dealer for a request", () => {
  it("is the one dealer a member works at, with the directory's role", async () => {
    email = "conor@example.com";
    expect(await dealerAccess()).toMatchObject({ state: "ok", dealer: { id: "checkwork-motors" }, role: "Sales", choices: [{ id: "checkwork-motors" }] });
    expect((await currentDealer()).id).toBe("checkwork-motors");
  });

  it("ignores a forged dealer cookie for a dealer they are not a member of, and the chooser never offers it", async () => {
    email = "conor@example.com";
    picked = "test-motors";
    expect(await ok()).toBe("checkwork-motors");
    expect((await currentDealer()).id).toBe("checkwork-motors");
    const a = await dealerAccess();
    expect(a.state === "ok" && a.choices.map((c) => c.id)).toEqual(["checkwork-motors"]);
  });

  it("refuses to open another dealer from the chooser's form, and sets no cookie", async () => {
    email = "conor@example.com";
    await expect(chooseDealerAction(form("test-motors"))).rejects.toThrow("NOT_FOUND");
    expect(set).not.toHaveBeenCalled();
  });

  it("is no dealer at all for someone at none, or not signed in, and the stores then refuse", async () => {
    email = "stranger@dealer.example";
    expect(await dealerAccess()).toEqual({ state: "no-access" });
    await expect(currentDealer()).rejects.toThrow("No current dealer");
    email = undefined;
    expect(await dealerAccess()).toEqual({ state: "signed-out" });
    await expect(currentDealer()).rejects.toThrow("No current dealer");
  });

  it("asks someone at several dealers to choose, then keeps their choice while they are a member", async () => {
    await putMember("test-motors", "Conor@Example.com", "Manager");
    email = "conor@example.com";
    expect(await dealerAccess()).toMatchObject({ state: "choose", choices: [{ id: "checkwork-motors" }, { id: "test-motors" }] });
    await expect(currentDealer()).rejects.toThrow("No current dealer");
    await expect(chooseDealerAction(form("test-motors"))).rejects.toThrow("REDIRECT");
    expect(set).toHaveBeenCalledWith("__Host-cw_dealer", "test-motors", expect.objectContaining({ httpOnly: true }));
    picked = "test-motors";
    expect(await dealerAccess()).toMatchObject({ state: "ok", dealer: { id: "test-motors" }, role: "Manager" });
    picked = "nobody-motors";
    expect(await ok()).toBe("choose");
  });

  it("keeps a pick made under the dealer cookie's old name, and the next pick moves it to the __Host- name", async () => {
    await putMember("test-motors", "conor@example.com", "Manager");
    email = "conor@example.com";
    pickedBefore = "test-motors";
    expect(await ok()).toBe("test-motors"); // nobody is sent back to the chooser by the rename
    picked = "checkwork-motors";
    expect(await ok()).toBe("checkwork-motors"); // the new name wins over the old
    picked = undefined;
    await expect(chooseDealerAction(form("checkwork-motors"))).rejects.toThrow("REDIRECT");
    expect(set).toHaveBeenCalledWith("__Host-cw_dealer", "checkwork-motors", { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true, secure: true });
    expect(set).toHaveBeenCalledWith("checkwork-dealer", "", expect.objectContaining({ maxAge: 0, path: "/" })); // the old one ends
    set.mockClear();
    pickedBefore = undefined;
    await expect(chooseDealerAction(form("test-motors"))).rejects.toThrow("REDIRECT");
    expect(set.mock.calls.map((c) => c[0])).toEqual(["__Host-cw_dealer"]); // nothing to end
  });

  it("drops a dealer the person was removed from, whatever the cookie says", async () => {
    await putMember("test-motors", "conor@example.com", "Sales");
    email = "conor@example.com";
    picked = "test-motors";
    expect(await ok()).toBe("test-motors");
    const { removeMember } = await import("./directory");
    await removeMember("test-motors", "conor@example.com");
    expect(await ok()).toBe("checkwork-motors");
  });

  it("starts the open app's person (next dev, the E2E run) at the demo dealer, and lets them switch", async () => {
    email = "dev@checkwork.invalid";
    expect(await ok()).toBe("checkwork-motors");
    picked = "test-motors";
    expect(await ok()).toBe("test-motors");
  });
});

describe("a push notification's link (/dealers/open)", () => {
  it("switches someone at two dealers to the one it came from, then opens its page", async () => {
    await putMember("test-motors", "conor@example.com", "Manager");
    email = "conor@example.com";
    picked = "test-motors";
    await expect(open("checkwork-motors", "/leads/abc?x=1")).rejects.toThrow("REDIRECT:/leads/abc?x=1");
    expect(set).toHaveBeenCalledWith("__Host-cw_dealer", "checkwork-motors", { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true, secure: true });
  });

  it("sends someone not at that dealer to the overview and keeps their cookie", async () => {
    email = "conor@example.com";
    await expect(open("test-motors", "/leads/abc")).rejects.toThrow(/^REDIRECT:\/$/);
    expect(set).not.toHaveBeenCalled();
    email = undefined;
    await expect(open("checkwork-motors", "/leads/abc")).rejects.toThrow(/^REDIRECT:\/$/);
    expect(set).not.toHaveBeenCalled();
  });

  it("opens only a path on this site", async () => {
    email = "conor@example.com";
    for (const to of ["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "javascript:alert(1)", "leads", ""])
      await expect(open("checkwork-motors", to), to).rejects.toThrow(/^REDIRECT:\/$/);
  });
});
