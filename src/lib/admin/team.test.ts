import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The directory with a switch to make its writes fail, as a D1 outage would.
let directoryDown = false;
vi.mock("@/lib/tenancy/directory", async (orig) => {
  const real = await orig<typeof import("@/lib/tenancy/directory")>();
  const guard = <A extends unknown[]>(fn: (...a: A) => Promise<void>) => (...a: A) => (directoryDown ? Promise.reject(new Error("directory down")) : fn(...a));
  return { ...real, putMember: guard(real.putMember), removeMember: guard(real.removeMember) };
});
const { changeTeamMember, getSettings, settingsStore } = await import("./collections");
const { membersOf, resetMemoryDirectory } = await import("@/lib/tenancy/directory");

const roleOf = async (email: string) => (await membersOf("checkwork-motors")).find((m) => m.email === email)?.role;

beforeEach(async () => {
  directoryDown = false;
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
});
