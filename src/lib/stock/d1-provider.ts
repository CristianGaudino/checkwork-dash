import "server-only";
import { getDb } from "@/lib/db";
import { currentDealer } from "@/lib/tenancy/current";
import { cars } from "@/lib/db/schema";
import { createStockEngine } from "./engine";
import type { Car, StockProvider } from "./types";

// The stock, read from Cloudflare D1 (the `cars` table: one row per car, the whole Car as JSON). The demo seeds it with made-up cars
// (npm run stock:seed, then npm run db:seed); a site that manages its own stock writes the same rows.
// shortcut: every call works on a snapshot of the whole table, kept for 30 seconds per Worker instance and filtered in memory by the engine.
// Fine for a few hundred cars. With more, query D1 by filter and page it instead of loading it all.
const TTL_MS = 30_000;
// One snapshot per dealer, each from that dealer's own database. The promise is kept, not the result, so requests that arrive together
// while it loads share one read of the table.
const snapshots = new Map<string, { at: number; engine: Promise<StockProvider> }>();

async function engine(): Promise<StockProvider> {
  const { id, profile } = await currentDealer();
  const snapshot = snapshots.get(id);
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot.engine;
  const load = getDb()
    .then((db) => db.select({ data: cars.data }).from(cars))
    .then((rows) => createStockEngine(rows.map((r) => r.data as Car), { soldDays: profile.rules.soldVisibleDays }));
  const mine = { at: Date.now(), engine: load };
  snapshots.set(id, mine);
  load.catch(() => void (snapshots.get(id) === mine && snapshots.delete(id))); // a failed read is not kept: the next request tries again
  return load;
}

// The admin changed a car: the current dealer's next read rebuilds the snapshot instead of waiting out the 30 seconds.
export const invalidateStockSnapshot = async () => void snapshots.delete((await currentDealer()).id);

export const d1Provider: StockProvider = {
  query: async (q) => (await engine()).query(q),
  getBySlug: async (slug) => (await engine()).getBySlug(slug),
  getById: async (id) => (await engine()).getById(id),
  getByIds: async (ids) => (await engine()).getByIds(ids),
  lookup: async (slug) => (await engine()).lookup(slug),
  taxonomy: async () => (await engine()).taxonomy(),
};
