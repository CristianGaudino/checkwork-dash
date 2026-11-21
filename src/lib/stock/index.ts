import { withDevData } from "../dev-data";
import { currentDealer, hasD1 } from "../tenancy/current";
import demoCars from "./demo-cars.json";
import extraCars from "./demo-cars-extra.json";
import { createStockEngine } from "./engine";
import type { Car, StockProvider } from "./types";

// Where the cars come from (D-06, the one place that names a provider): the current dealer's D1 database on the Worker. With no D1, which
// is the E2E run and `next dev`, a list in memory per dealer stands in, the way the lead fakes do: the demo dealer starts from the made-up
// cars in demo-cars.json, any other dealer with none. Any other missing binding fails loudly: stock never quietly falls back to the file
// on a deployed site, nor to another dealer's cars.
// Admin edits with no D1 binding land in the dealer's memoryCars (src/lib/admin/stock-admin.ts), and its engine is rebuilt from it.
const memory = new Map<string, { cars: Car[]; engine: StockProvider }>(); // by dealer id
async function memoryStock() {
  const d = await currentDealer();
  if (!memory.has(d.id)) {
    const cars = d.demo ? [...(demoCars as Car[]), ...(extraCars as Car[])] : [];
    memory.set(d.id, { cars, engine: createStockEngine(cars, { soldDays: d.profile.rules.soldVisibleDays }) });
  }
  return memory.get(d.id)!;
}
export const memoryCars = async () => (await memoryStock()).cars;
export const refreshMemoryStock = async () => {
  const m = await memoryStock();
  m.engine = createStockEngine(m.cars, { soldDays: (await currentDealer()).profile.rules.soldVisibleDays });
};
const files: StockProvider = {
  query: async (q) => (await source()).query(q),
  getBySlug: async (s) => (await source()).getBySlug(s),
  getById: async (id) => (await source()).getById(id),
  getByIds: async (ids) => (await source()).getByIds(ids),
  lookup: async (s) => (await source()).lookup(s),
  taxonomy: async () => (await source()).taxonomy(),
};
// The D1 provider is server-only and loaded only where there is a binding, so tests and the memory stand-in never import it.
async function source(): Promise<StockProvider> {
  if (hasD1()) return (await import("./d1-provider")).d1Provider;
  if (process.env.E2E_FAKE_BACKENDS === "1" || process.env.NODE_ENV !== "production") return (await memoryStock()).engine;
  throw new Error("Missing binding DIRECTORY");
}

export const stock = withDevData(files); // break-ui: the dev-only Demo / Worst case switch; returns `files` itself outside `next dev`
