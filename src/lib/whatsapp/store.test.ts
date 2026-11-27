import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const msgs = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/admin/docs", () => ({ defineCollection: () => ({ list: async () => msgs }) }));
vi.mock("@/lib/admin/collections", () => ({ TEAM_SEED: [], leadsStore: { get: async () => undefined } }));
vi.mock("@/lib/admin/seed-data", () => ({ carTitleOf: () => "" }));
const { viewFor } = await import("./store");

describe("viewFor", () => {
  it("shows every alert and the questions asked from it, and nothing not yet due", async () => {
    const staff = (id: string, o: Record<string, unknown>) => ({ id, at: 1, thread: "staff", from: "site", to: "Aoife", text: id, ...o });
    msgs.push(
      staff("trade", { event: "trade-in", buttons: ["price"] }),
      staff("price-q", { ref: "trade", expects: "price" }),
      staff("review", { event: "review", ref: "rev-1" }),
      staff("review-q", { ref: "rev-1", expects: "review-reply" }),
      staff("enquiry", { event: "enquiry" }),
      staff("note", { text: "Already done." }),
    );
    expect((await viewFor("Aoife", 2)).staff.map((m) => m.id)).toEqual(["trade", "price-q", "review", "review-q", "enquiry", "note"]);
    expect((await viewFor("Aoife", 0)).staff).toEqual([]); // each at 1, after now
  });
});
