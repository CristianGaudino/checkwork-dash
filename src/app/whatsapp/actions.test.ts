import { beforeEach, describe, expect, it, vi } from "vitest";

// Stop WhatsApp: the buyer's opt-in goes, and a lead erased meanwhile is never written back.
const db = vi.hoisted(() => ({ leads: new Map<string, Record<string, unknown>>(), log: [] as string[], role: "Sales", calls: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/modules", () => ({ requireModule: async () => {}, enabledModules: async () => new Set() }));
vi.mock("@/lib/staff", () => ({ requireStaff: async () => {} }));
vi.mock("@/lib/permissions", () => ({ currentMember: async () => ({ name: "Aoife", role: db.role }) }));
vi.mock("@/lib/whatsapp/handle", () => ({ tap: async () => void db.calls.push("tap"), typed: async () => void db.calls.push("typed") }));
vi.mock("@/lib/whatsapp/store", () => ({ viewFor: async () => (db.calls.push("view"), { staff: [{}], buyer: [], buyerName: "Pat", typing: false }) }));
vi.mock("@/lib/admin/activity", () => ({ logActivity: async (_a: string, text: string) => void db.log.push(text) }));
vi.mock("@/lib/admin/collections", () => ({
  leadsStore: {
    get: async (id: string) => db.leads.get(id),
    update: async (id: string, fn: (l: Record<string, unknown>) => Record<string, unknown>) => {
      const cur = db.leads.get(id);
      if (!cur) return undefined;
      const next = fn(cur);
      db.leads.set(id, next);
      return next;
    },
  },
}));
const { sendAction, snapshotAction, stopWhatsAppAction, tapAction } = await import("./actions");

beforeEach(() => {
  db.leads.clear();
  db.log.length = 0;
  db.calls.length = 0;
  db.role = "Sales";
});

describe("Finance has no WhatsApp (#142)", () => {
  const empty = { staff: [], buyer: [], buyerName: "", typing: false };
  it("gives Finance no conversation, and taps or answers nothing for them", async () => {
    db.role = "Finance";
    expect(await snapshotAction()).toEqual(empty);
    expect(await tapAction("m1", "confirm")).toEqual(empty);
    expect(await sendAction("What price?")).toEqual(empty);
    expect(db.calls).toEqual([]);
  });

  it("still lets Sales tap and answer", async () => {
    await tapAction("m1", "confirm");
    await sendAction("What price?");
    expect(db.calls).toEqual(["tap", "view", "typed", "view"]);
  });
});

describe("Stop WhatsApp", () => {
  it("clears the buyer's opt-in and logs it without the buyer", async () => {
    db.leads.set("lead-1", { id: "lead-1", name: "Pat Byrne", whatsappOptIn: true });
    await stopWhatsAppAction("lead-1");
    expect(db.leads.get("lead-1")?.whatsappOptIn).toBe(false);
    expect(db.log).toEqual(["Stopped WhatsApp updates to the buyer"]);
  });

  it("never brings back a lead erased between the read and the write", async () => {
    db.leads.set("lead-1", { id: "lead-1", name: "Pat Byrne", whatsappOptIn: true });
    const update = (await import("@/lib/admin/collections")).leadsStore.update;
    const erased = vi.spyOn((await import("@/lib/admin/collections")).leadsStore, "update").mockImplementationOnce(async (id, fn) => {
      db.leads.delete(id); // the erasure lands first
      return update(id, fn);
    });
    await stopWhatsAppAction("lead-1");
    expect(db.leads.has("lead-1")).toBe(false);
    expect(db.log).toEqual([]);
    erased.mockRestore();
  });
});
