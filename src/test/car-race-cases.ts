import { expect, it } from "vitest";
import type { Car } from "@/lib/stock/types";

// Two people changing one car at once (#15): neither change is lost, and a car deleted meanwhile stays deleted. Run twice: in memory
// (src/lib/admin/stock-admin.test.ts, next dev and the E2E run) and on the D1 path on SQLite (stock-admin.int.test.ts, the Worker).
const car = (id: string): Car => ({ id, slug: `make-model-2020-${id}`, make: "Make", makeSlug: "make", model: "Model", modelSlug: "model", year: 2020, priceEur: 5000, photos: [] });

// An update held after its read, until `go`: whatever is written meanwhile is the clash it must not write over.
function held(update: (fn: (c: Car, at: number) => Car | null | Promise<Car | null>) => Promise<Car | undefined>, fn: (c: Car, at: number) => Car | null) {
  let go!: () => void;
  let read!: () => void;
  const gate = new Promise<void>((r) => (go = r));
  const reached = new Promise<void>((r) => (read = r));
  let first = true;
  const done = update(async (c, at) => {
    if (first) {
      first = false;
      read();
      await gate;
    }
    return fn(c, at);
  });
  return { reached, go, done };
}

export function carRaceCases() {
  it("keeps two changes to different fields made at the same time", async () => {
    const { adminCar, saveCar, updateCar } = await import("@/lib/admin/stock-admin");
    await saveCar(car("810001"));
    await Promise.all([updateCar("810001", (c) => ({ ...c, priceEur: 4500 })), updateCar("810001", (c) => ({ ...c, colour: "Blue" }))]);
    expect(await adminCar("810001")).toMatchObject({ priceEur: 4500, colour: "Blue" });
  });

  it("keeps a price saved while a hide was in flight, and the hide", async () => {
    const { adminCar, saveCar, updateCar } = await import("@/lib/admin/stock-admin");
    await saveCar(car("810002"));
    const hide = held((fn) => updateCar("810002", fn), (c) => ({ ...c, listing: "hidden" }));
    await hide.reached; // the hide has read the car at 5000
    await updateCar("810002", (c) => ({ ...c, priceEur: 4000 }));
    hide.go();
    expect(await hide.done).toMatchObject({ listing: "hidden", priceEur: 4000 });
    expect(await adminCar("810002")).toMatchObject({ listing: "hidden", priceEur: 4000 });
  });

  it("does not bring back a car deleted while a change to it was in flight", async () => {
    const { adminCar, removeCar, saveCar, updateCar } = await import("@/lib/admin/stock-admin");
    await saveCar(car("810003"));
    const hide = held((fn) => updateCar("810003", fn), (c) => ({ ...c, listing: "hidden" }));
    await hide.reached;
    await removeCar("810003");
    hide.go();
    expect(await hide.done).toBeUndefined();
    expect(await adminCar("810003")).toBeUndefined();
    expect(await updateCar("810003", (c) => c)).toBeUndefined();
  });

  it("refuses a whole-car save from a form opened before a change, and takes one opened after", async () => {
    const { adminCar, adminCarAt, saveCar, updateCar } = await import("@/lib/admin/stock-admin");
    await saveCar(car("810004"));
    const opened = (await adminCarAt("810004"))!; // the form opens
    await updateCar("810004", (c) => ({ ...c, listing: "hidden" })); // Hide, in another tab
    const typed = { ...opened.car, priceEur: 4200 }; // the whole car as the form has it, still shown
    expect(await updateCar("810004", (_, at) => (at === opened.at ? typed : null))).toBeUndefined();
    expect(await adminCar("810004")).toMatchObject({ listing: "hidden", priceEur: 5000 });
    const reopened = (await adminCarAt("810004"))!;
    expect(reopened.at).toBeGreaterThan(opened.at);
    expect(await updateCar("810004", (_, at) => (at === reopened.at ? { ...reopened.car, priceEur: 4200 } : null))).toMatchObject({ listing: "hidden", priceEur: 4200 });
  });
}
