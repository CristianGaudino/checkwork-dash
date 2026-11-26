import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cars } from "@/lib/db/schema";
import { hasD1 } from "@/lib/tenancy/current";
import { memoryCars, refreshMemoryStock } from "@/lib/stock";
import { readCar, type Car } from "@/lib/stock/types";
import { devFixtureCars } from "@/lib/dev-data";
import { drivesStore, leadsStore, mediaStore, postsStore, reservationsStore, salesStore } from "./collections";
import { carSlug, nextCarId, slugId } from "./stock-admin-pure";
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
  return rows.map((r) => readCar(r.data));
}

// The id for a new car: above every id still in use, by a car or by a record that names one (a sale, a deposit, a lead and its visit note,
// a test drive, a post, a library photo, which find their car by id), so none is given twice.
export async function freeCarId(): Promise<string> {
  const [cars, sales, deposits, leads, drives, posts, media] = await Promise.all([adminCars(), salesStore.list(), reservationsStore.list(), leadsStore.list(), drivesStore.list(), postsStore.list(), mediaStore.list()]);
  const slugs = [...leads, ...drives, ...posts, ...media].map((r) => slugId(r.carSlug ?? ""));
  const named = [...slugs, ...leads.flatMap((l) => l.journey?.cars.map((c) => c.id) ?? [])].map((id) => ({ id }));
  return nextCarId([...cars, ...sales.map((s) => ({ id: s.carId ?? s.id })), ...deposits.map((r) => ({ id: r.carId })), ...named]);
}

// One row on D1, not the whole table: the website's photo route (src/lib/site-api/photos.ts) reads a car per image.
export async function adminCar(id: string): Promise<Car | undefined> {
  if (!hasDb()) return (await adminCars()).find((c) => c.id === id);
  const [r] = await (await getDb()).select({ data: cars.data }).from(cars).where(eq(cars.id, id)).limit(1);
  return r && readCar(r.data);
}

// When each car in memory was last written (D1 keeps it in the row's updated_at). Kept off the Car, so the website never sees it.
const memAt = new WeakMap<Car, number>();
// At least a millisecond on from the last write, so two writes in the same millisecond still tell apart.
const nextAt = (at: number) => Math.max(Date.now(), at + 1);

// The whole car, as it is: a car added or synced in. A change to a car already there goes through updateCar, so it never writes over
// another change made at the same time.
export async function saveCar(car: Car): Promise<void> {
  if (hasDb()) {
    const set = { slug: car.slug, data: car, updatedAt: sql`max(${Date.now()}, ${cars.updatedAt} + 1)` };
    await (await getDb()).insert(cars).values({ id: car.id, slug: car.slug, data: car, updatedAt: Date.now() }).onConflictDoUpdate({ target: cars.id, set });
  } else {
    const mem = await memoryCars();
    const i = mem.findIndex((c) => c.id === car.id);
    memAt.set(car, nextAt(i >= 0 ? (memAt.get(mem[i]) ?? 0) : 0));
    if (i >= 0) mem[i] = car;
    else mem.unshift(car);
  }
  await afterWrite();
}

// A car with when it was last written: the car form carries `at`, so its save can tell whether someone changed the car since.
export async function adminCarAt(id: string): Promise<{ car: Car; at: number } | undefined> {
  if (!hasDb()) {
    const car = (await memoryCars()).find((c) => c.id === id);
    return car && { car, at: memAt.get(car) ?? 0 };
  }
  const [row] = await (await getDb()).select({ car: cars.data, at: cars.updatedAt }).from(cars).where(eq(cars.id, id)).limit(1);
  return row && { car: readCar(row.car), at: row.at };
}

// A change to one car (hide it, drop its price, add a photo) while others may change it too, as docs.ts' update does for records: `fn`
// gets the car as it is now (and when it was last written), and the write lands only if nobody wrote it since; one retry on a clash.
// `fn` returns null to leave the car as it is. Returns the car as written, or undefined if nothing was written: `fn` said no, or the car is
// gone (deleted meanwhile), which stays gone.
export async function updateCar(id: string, fn: (car: Car, at: number) => Car | null | Promise<Car | null>): Promise<Car | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = await adminCarAt(id);
    if (!now) return undefined;
    const next = await fn(now.car, now.at);
    if (!next) return undefined;
    const at = nextAt(now.at);
    let done: boolean;
    if (hasDb()) {
      const set = { slug: next.slug, data: next, updatedAt: at };
      done = (await (await getDb()).update(cars).set(set).where(and(eq(cars.id, id), eq(cars.updatedAt, now.at))).returning({ id: cars.id })).length > 0;
    } else {
      const mem = await memoryCars();
      const i = mem.findIndex((c) => c.id === id);
      done = i >= 0 && mem[i] === now.car;
      if (done) {
        memAt.set(next, at);
        mem[i] = next;
      }
    }
    if (done) {
      await afterWrite();
      return next;
    }
  }
  throw new Error(`Car ${id} was changed by someone else at the same time`);
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
