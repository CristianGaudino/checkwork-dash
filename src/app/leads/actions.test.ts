import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));
const { setStatusAction } = await import("./actions");
const { leadsStore } = await import("@/lib/admin/collections");
const { listActivity } = await import("@/lib/admin/activity");

const form = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());

describe("closing a lead (#55)", () => {
  it("needs a reason from the list, closes it with its follow-up cleared, logs it, and Undo puts it back", async () => {
    const lead = (await leadsStore.list()).find((l) => l.status === "contacted" && l.followUpOn && l.type !== "warranty")!;
    await setStatusAction(lead.id, form({ status: "closed" }));
    await setStatusAction(lead.id, form({ status: "closed", reason: "Price" })); // a lost reason is not a close reason
    expect((await leadsStore.get(lead.id))!.status).toBe("contacted");
    await setStatusAction(lead.id, form({ status: "closed", reason: "Spam", from: lead.status }));
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "closed", closedReason: "Spam", followUpOn: undefined });
    expect((await listActivity({ area: "leads" }, 1, 50)).rows.find((r) => r.refId === lead.id)?.summary).toBe("Moved the lead from Contacted to Closed: Spam");
    // Undo: the status it had and its follow-up day; the reason goes with the closed status.
    await setStatusAction(lead.id, form({ status: "contacted", from: "closed", on: lead.followUpOn! }));
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "contacted", closedReason: undefined, followUpOn: lead.followUpOn });
  });
  it("is never done to a warranty request, whose Lost already reads Closed", async () => {
    const lead = (await leadsStore.list()).find((l) => l.type === "warranty" && l.status !== "lost")!;
    await setStatusAction(lead.id, form({ status: "closed", reason: "Spam" }));
    expect((await leadsStore.get(lead.id))!.status).toBe(lead.status);
  });
});
