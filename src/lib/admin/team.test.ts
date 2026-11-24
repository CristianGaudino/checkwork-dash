import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The directory with a switch to make its writes fail, as a D1 outage would.
let directoryDown = false;
vi.mock("@/lib/tenancy/directory", async (orig) => {
  const real = await orig<typeof import("@/lib/tenancy/directory")>();
  const guard = <A extends unknown[]>(fn: (...a: A) => Promise<void>) => (...a: A) => (directoryDown ? Promise.reject(new Error("directory down")) : fn(...a));
  return { ...real, putMember: guard(real.putMember), removeMember: guard(real.removeMember) };
});
// And our sign-in's step after a removal, with a switch to make it fail (its error carrying an email, as a D1 error carries values).
let signInDown = false;
vi.mock("@/lib/auth/session", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/session")>();
  return { ...real, endRemoved: (e: string) => (signInDown ? Promise.reject(new Error(e)) : real.endRemoved(e)) };
});
const { changeTeamMember, getSettings, moveTeamMember, settingsStore } = await import("./collections");
const { memoryDirectory, membersOf, putMember, resetMemoryDirectory } = await import("@/lib/tenancy/directory");
const { readSession, startSession } = await import("@/lib/auth/session");

const roleOf = async (email: string) => (await membersOf("checkwork-motors")).find((m) => m.email === email)?.role;

beforeEach(async () => {
  directoryDown = false;
  signInDown = false;
  resetMemoryDirectory();
  await settingsStore.reset();
});

describe("the team, kept in the directory and the dealer's store together", () => {
  it("takes who is on the team and their role from the directory, and the name from the dealer's store", async () => {
    await changeTeamMember("conor@example.com", "Manager", async () => {});
    expect((await getSettings()).team.find((t) => t.email === "conor@example.com")).toMatchObject({ name: "Conor Doyle", role: "Manager" });
    const { putMember } = await import("@/lib/tenancy/directory");
    await putMember("checkwork-motors", "new.owner@example.com", "Owner"); // added by scripts/add-dealer.mjs: no name here yet
    expect((await getSettings()).team.find((t) => t.email === "new.owner@example.com")).toMatchObject({ name: "new.owner@example.com", role: "Owner" });
    expect((await getSettings()).team.map((t) => t.email)).not.toContain("dev@checkwork.invalid");
  });

  it("changes nothing when the directory write fails", async () => {
    directoryDown = true;
    const details = vi.fn(async () => {});
    await expect(changeTeamMember("sam@example.com", "Sales", details)).rejects.toThrow("directory down");
    expect(details).not.toHaveBeenCalled();
    expect(await roleOf("sam@example.com")).toBeUndefined();
  });

  it("puts the directory back when the dealer's own details cannot be saved", async () => {
    const fail = async () => {
      throw new Error("store down");
    };
    await expect(changeTeamMember("sam@example.com", "Sales", fail)).rejects.toThrow("store down");
    expect(await roleOf("sam@example.com")).toBeUndefined();
    await expect(changeTeamMember("conor@example.com", "Owner", fail)).rejects.toThrow("store down");
    expect(await roleOf("conor@example.com")).toBe("Sales");
    await expect(changeTeamMember("conor@example.com", null, fail)).rejects.toThrow("store down");
    expect(await roleOf("conor@example.com")).toBe("Sales");
  });

  it("moves a person's sign-in email in the directory, and puts it back when the details cannot be saved (#142)", async () => {
    const fail = async () => {
      throw new Error("store down");
    };
    await expect(moveTeamMember("conor@example.com", "conor.d@example.com", "Sales", fail)).rejects.toThrow("store down");
    expect(await roleOf("conor@example.com")).toBe("Sales");
    expect(await roleOf("conor.d@example.com")).toBeUndefined();
    await moveTeamMember("Conor@Example.com", "Conor.D@example.com", "Sales", async () => {});
    expect(await roleOf("conor@example.com")).toBeUndefined();
    expect(await roleOf("conor.d@example.com")).toBe("Sales");
  });
});

// Removal from a team ends the person's sign-in (docs/sign-in.md, section 1): only for a removal, only once it stands, and their passkeys only
// when they are at no dealer any more.
describe("the team and our sign-in", () => {
  const mem = () => memoryDirectory();
  // conor@ (Sales at the demo) has a staff row, a passkey, a pending passkey challenge and two sessions.
  const signedIn = async () => {
    mem().staff.push({ id: "conor", email: "conor@example.com", codeFailures: 0, codeLockedUntil: null, createdAt: new Date() });
    mem().passkeys.push({ id: "k1", staffId: "conor", publicKey: new Uint8Array([1]) as never, alg: -7, signCount: 0, backupEligible: true, backedUp: true, transports: "[]", label: "iPhone", createdAt: new Date(), lastUsedAt: null });
    mem().signInAttempts.push({ id: "a1", kind: "passkey-register", email: null, staffId: "conor", challenge: "c", codeHmac: null, tokenHmac: null, browserHash: null, tries: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000), usedAt: null });
    return [await startSession({ staffId: "conor", method: "email", label: "iPhone" }), await startSession({ staffId: "conor", method: "passkey", label: "Mac" })];
  };
  const counts = () => ({ staff: mem().staff.length, passkeys: mem().passkeys.length, attempts: mem().signInAttempts.length });

  it("a role change ends no session", async () => {
    const [a, b] = await signedIn();
    await changeTeamMember("conor@example.com", "Manager", async () => {});
    expect(await readSession(a)).not.toBeNull();
    expect(await readSession(b)).not.toBeNull();
    expect(counts()).toEqual({ staff: 1, passkeys: 1, attempts: 1 });
  });

  it("a removal ends every session, and at no dealer any more their passkeys, attempts and staff row go too", async () => {
    const [a, b] = await signedIn();
    let during: unknown;
    await changeTeamMember("Conor@Example.com", null, async () => void (during = await readSession(a)));
    expect(during).not.toBeNull(); // nothing of their sign-in is touched until the details are saved
    expect(await readSession(a)).toBeNull();
    expect(await readSession(b)).toBeNull();
    expect(counts()).toEqual({ staff: 0, passkeys: 0, attempts: 0 });
  });

  it("a removal keeps the passkeys of someone still at another dealer: they sign in again and reach only that one", async () => {
    await putMember("test-motors", "conor@example.com", "Sales");
    const [a] = await signedIn();
    await changeTeamMember("conor@example.com", null, async () => {});
    expect(await readSession(a)).toBeNull(); // a session is a person, so it ends at every dealer
    expect(counts()).toEqual({ staff: 1, passkeys: 1, attempts: 1 });
  });

  it("a removal whose details() throws keeps the sessions, passkeys and staff row, and the membership", async () => {
    const [a] = await signedIn();
    const fail = async () => {
      throw new Error("store down");
    };
    await expect(changeTeamMember("conor@example.com", null, fail)).rejects.toThrow("store down");
    expect(await readSession(a)).not.toBeNull();
    expect(counts()).toEqual({ staff: 1, passkeys: 1, attempts: 1 });
    expect(await roleOf("conor@example.com")).toBe("Sales");
  });

  it("ends nothing when the directory write itself fails", async () => {
    const [a] = await signedIn();
    directoryDown = true;
    await expect(changeTeamMember("conor@example.com", null, async () => {})).rejects.toThrow("directory down");
    expect(await readSession(a)).not.toBeNull();
    expect(counts()).toEqual({ staff: 1, passkeys: 1, attempts: 1 });
  });

  it("a removal stands when ending the sign-in fails, logged by fixed words only", async () => {
    const [a] = await signedIn();
    signInDown = true;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await changeTeamMember("conor@example.com", null, async () => {});
    expect(await roleOf("conor@example.com")).toBeUndefined();
    expect(log.mock.calls).toEqual([[JSON.stringify({ signIn: "team", outcome: "failed" })]]); // never the error, which named them
    log.mockRestore();
    expect(await readSession(a)).not.toBeNull(); // left for the nightly purge; it reaches no dealer of theirs now
  });
});
