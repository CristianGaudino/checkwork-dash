import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/staff", () => ({ requireStaff: async () => {} }));
vi.mock("@/lib/admin/activity", () => ({ logActivity: async () => {} }));
// One lead in memory: update() runs the change on it, as the real store does.
let lead: { id: string; reg?: string; details?: Record<string, string>; message: string; source?: string };
const update = vi.fn(async (_id: string, fn: (l: typeof lead) => typeof lead) => (lead = fn(lead)));
vi.mock("@/lib/admin/collections", () => ({ leadsStore: { update: (id: string, fn: (l: typeof lead) => typeof lead) => update(id, fn) } }));
const { saveTheirCarAction } = await import("./car-actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const all = { reg: "191-D-1234", make: "Toyota", model: "Corolla", year: "2019", mileage: "142000", condition: "Good", asking: "15000" };

describe("saveTheirCarAction", () => {
  beforeEach(() => {
    lead = { id: "l1", message: "Hi", details: { Mileage: "90,000 km", Colour: "Red" } };
    update.mockClear();
  });

  it("refuses a bad year or mileage and writes nothing", async () => {
    expect((await saveTheirCarAction("l1", undefined, form({ ...all, year: "19" })))?.errors?.year).toBeTruthy();
    expect((await saveTheirCarAction("l1", undefined, form({ ...all, mileage: "1.2.3" })))?.errors?.mileage).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it("stores the facts as read, and an empty box clears its own", async () => {
    expect((await saveTheirCarAction("l1", undefined, form({ ...all, mileage: "142,000", model: "" })))?.saved).toBe(true);
    expect(lead.reg).toBe("191-D-1234");
    expect(lead.details).toMatchObject({ Make: "Toyota", Year: "2019", Mileage: "142,000 km", Condition: "Good", Colour: "Red" });
    expect(lead.details?.Model).toBeUndefined();
  });

  it("leaves what the form did not ask about (no condition or asking price off a sell or trade-in)", async () => {
    lead.details = { Condition: "Fair", "Asking price": "€9,000" };
    const f = form(all);
    f.delete("condition");
    f.delete("asking");
    await saveTheirCarAction("l1", undefined, f);
    expect(lead.details).toMatchObject({ Condition: "Fair", "Asking price": "€9,000", Make: "Toyota" });
  });

  it("keeps an older site lead's glued answers as details, and its message as their words", async () => {
    lead = { id: "l1", source: "Website", message: "Make: Ford. Model: Focus. Mileage: 120000.\n\nHi" };
    await saveTheirCarAction("l1", undefined, form({ reg: "151-D-9" })); // only the plate: the rest stays as the site wrote it
    expect(lead.message).toBe("Hi");
    expect(lead.details).toEqual({ Make: "Ford", Model: "Focus", Mileage: "120,000 km" });
  });
});
