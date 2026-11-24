import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { seedMessages } = await import("./store");
const { TEAM_SEED } = await import("@/lib/admin/collections");

describe("the demo's WhatsApp seed", () => {
  it("gives the slow car's suggested drop, and its button, only to owners and managers", () => {
    const slow = seedMessages().filter((m) => m.event === "slow-stock");
    const role = (to: string) => TEAM_SEED.find((t) => t.name === to)!.role;
    expect(slow.some((m) => role(m.to!) === "Sales")).toBe(true);
    for (const m of slow) {
      const drops = role(m.to!) === "Owner" || role(m.to!) === "Manager";
      expect(m.buttons).toEqual(drops ? ["drop"] : []);
      expect(m.text.includes("Drop the price")).toBe(drops);
    }
  });
});
