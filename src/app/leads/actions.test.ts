import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));
const { setSpamAction, setStatusAction } = await import("./actions");
const { leadsStore, statusBack } = await import("@/lib/admin/collections");
const { listActivity } = await import("@/lib/admin/activity");

const form = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());
const logged = async (id: string) => (await listActivity({ area: "leads" }, 1, 50)).rows.find((r) => r.refId === id)?.summary;
const pick = async (test: (l: Awaited<ReturnType<typeof leadsStore.list>>[number]) => boolean) => (await leadsStore.list()).find(test)!;

describe("closing a lead (#55)", () => {
  it("needs a reason from the list, keeps the status it had, clears the follow-up, logs it, and Undo puts it back", async () => {
    const lead = await pick((l) => l.status === "contacted" && Boolean(l.followUpOn) && l.type !== "warranty");
    await setStatusAction(lead.id, form({ status: "closed" }));
    await setStatusAction(lead.id, form({ status: "closed", reason: "Price" })); // a lost reason is not a close reason
    expect((await leadsStore.get(lead.id))!.status).toBe("contacted");
    await setStatusAction(lead.id, form({ status: "closed", reason: "Duplicate", from: lead.status }));
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "closed", closedReason: "Duplicate", statusBefore: "contacted", followUpOn: undefined });
    expect(await logged(lead.id)).toBe("Moved the lead from Contacted to Closed: Duplicate");
    // Undo: the status it had and its follow-up day; the reason and the status before go with the closed status.
    await setStatusAction(lead.id, form({ status: "contacted", from: "closed", on: lead.followUpOn! }));
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "contacted", closedReason: undefined, statusBefore: undefined, followUpOn: lead.followUpOn });
  });
  it("is Reopened to the status it had, and never closes a lead already won", async () => {
    const lead = await pick((l) => l.status === "appointment" && l.type !== "warranty");
    await setStatusAction(lead.id, form({ status: "closed", reason: "Not interested" }));
    const closed = (await leadsStore.get(lead.id))!;
    expect(statusBack(closed)).toBe("appointment");
    await setStatusAction(lead.id, form({ status: statusBack(closed), from: "closed" }));
    expect((await leadsStore.get(lead.id))!.status).toBe("appointment");
    expect(statusBack({})).toBe("new"); // a record from before statusBefore
    // Undo of a step on a closed lead sends where Reopen went, so Reopen still goes there.
    await setStatusAction(lead.id, form({ status: "closed", reason: "Duplicate" }));
    await setStatusAction(lead.id, form({ status: "contacted", from: "closed" }));
    await setStatusAction(lead.id, form({ status: "closed", reason: "Duplicate", from: "contacted", before: "appointment" }));
    expect((await leadsStore.get(lead.id))!.statusBefore).toBe("appointment");
    const won = await pick((l) => l.status === "won");
    await setStatusAction(won.id, form({ status: "closed", reason: "Duplicate" }));
    expect((await leadsStore.get(won.id))!.status).toBe("won");
  });
  it("is never done to a warranty request, whose Lost already reads Closed", async () => {
    const lead = await pick((l) => l.type === "warranty" && l.status !== "lost");
    await setStatusAction(lead.id, form({ status: "closed", reason: "Duplicate" }));
    expect((await leadsStore.get(lead.id))!.status).toBe(lead.status);
  });
});

describe("spam (#56)", () => {
  it("marks an open lead spam, logs it, and Not spam puts back the status it had; never by the status buttons", async () => {
    const lead = await pick((l) => l.status === "contacted" && l.type !== "warranty");
    await setStatusAction(lead.id, form({ status: "spam" }));
    expect((await leadsStore.get(lead.id))!.status).toBe("contacted");
    await setSpamAction(lead.id, form({ spam: "yes", from: "contacted" }));
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "spam", statusBefore: "contacted" });
    expect(await logged(lead.id)).toBe("Marked the lead as spam");
    expect(await setSpamAction(lead.id, form({ spam: "no", from: "contacted" }))).toEqual({ error: expect.any(String) }); // an old page
    await setSpamAction(lead.id, form({ spam: "no", from: "spam" }));
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "contacted", statusBefore: undefined });
    expect(await logged(lead.id)).toBe("Marked the lead not spam");
  });
  it("clears Possible spam with Not spam, and Undo of either press puts Possible spam back", async () => {
    const lead = await pick((l) => l.status === "new");
    await leadsStore.update(lead.id, (l) => ({ ...l, maybeSpam: true }));
    await setSpamAction(lead.id, form({ spam: "no", from: "new" }));
    expect((await leadsStore.get(lead.id))!.maybeSpam).toBeUndefined();
    await setSpamAction(lead.id, form({ spam: "maybe", from: "new" })); // Undo
    expect((await leadsStore.get(lead.id))!.maybeSpam).toBe(true);
    await setSpamAction(lead.id, form({ spam: "yes", from: "new" }));
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "spam", maybeSpam: undefined });
    await setSpamAction(lead.id, form({ spam: "maybe", from: "spam" })); // Undo
    expect(await leadsStore.get(lead.id)).toMatchObject({ status: "new", maybeSpam: true });
  });
  it("refuses anything but yes, no or maybe, and a lead won or lost", async () => {
    const won = await pick((l) => l.status === "won");
    await setSpamAction(won.id, form({ spam: "yes" }));
    await setSpamAction(won.id, form({ spam: "hacked" }));
    expect((await leadsStore.get(won.id))!.status).toBe("won");
  });
});
