import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cars } from "@/lib/db/schema";
import { hasD1 } from "@/lib/tenancy/current";
import { memoryCars, refreshMemoryStock } from "@/lib/stock";
import type { Car } from "@/lib/stock/types";
import { devFixtureCars } from "@/lib/dev-data";
import { reservationsStore, salesStore } from "./collections";
import { carSlug, nextCarId } from "./stock-admin-pure";
import { dropCarPhotos } from "./car-photos";

// The dealer's view of the stock: every car, sold ones too, and the writes, in the current dealer's own store. On the Worker this is the
// `cars` table of their D1 database. With no D1 binding it edits that dealer's in-memory list (dev and E2E).
const hasDb = hasD1;

async function afterWrite() {
  if (hasDb()) await (await import("@/lib/stock/d1-provider")).invalidateStockSnapshot();
  else await refreshMemoryStock();
}

export async function adminCars(): Promise<Car[]> {
  if (!hasDb()) {
    // break-ui: in `next dev` the Demo / Worst case switch reaches the dashboard too, so its lists can be tried at 0, 1 or 1,284 cars.
    const dev = await devFixtureCars();
    return [...(dev ?? (await memoryCars()))];
  }
  const rows = await (await getDb()).select({ data: cars.data }).from(cars);
  return rows.map((r) => r.data as Car);
}

// The id for a new car: above every id still in use, by a car or by a record that names one (a sale, a deposit), so none is given twice.
export async function freeCarId(): Promise<string> {
  const [cars, sales, deposits] = await Promise.all([adminCars(), salesStore.list(), reservationsStore.list()]);
  return nextCarId([...cars, ...sales.map((s) => ({ id: s.carId ?? s.id })), ...deposits.map((r) => ({ id: r.carId }))]);
}

export async function adminCar(id: string): Promise<Car | undefined> {
  return (await adminCars()).find((c) => c.id === id);
}

export async function saveCar(car: Car): Promise<void> {
  if (hasDb()) {
    await (await getDb()).insert(cars).values({ id: car.id, slug: car.slug, data: car }).onConflictDoUpdate({ target: cars.id, set: { slug: car.slug, data: car } });
  } else {
    const mem = await memoryCars();
    const i = mem.findIndex((c) => c.id === car.id);
    if (i >= 0) mem[i] = car;
    else mem.unshift(car);
  }
  await afterWrite();
}

// A new car, under the next free id. Two cars added at once would get the same id: the insert only lands if the id (and slug) is still free,
// else the next id is tried. Returns the car as saved.
export async function addCar(draft: Car): Promise<Car> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await freeCarId();
    const car = { ...draft, id, slug: carSlug({ ...draft, id }) };
    if (!hasDb()) (await memoryCars()).unshift(car);
    else if (!(await (await getDb()).insert(cars).values({ id, slug: car.slug, data: car }).onConflictDoNothing().returning({ id: cars.id })).length) continue;
    await afterWrite();
    return car;
  }
  throw new Error("No free car id");
}

// Its photos added in the dashboard go with it, after the row: a photo left behind is only space, a car without its photos is broken.
// `known`: the car, when the caller already has it, so a bulk delete does not read the whole table once per car.
export async function removeCar(id: string, known?: Car): Promise<void> {
  const car = known ?? (await adminCar(id));
  if (hasDb()) await (await getDb()).delete(cars).where(eq(cars.id, id));
  else {
    const mem = await memoryCars();
    const i = mem.findIndex((c) => c.id === id);
    if (i >= 0) mem.splice(i, 1);
  }
  await afterWrite();
  if (car) await dropCarPhotos(car.photos);
}
