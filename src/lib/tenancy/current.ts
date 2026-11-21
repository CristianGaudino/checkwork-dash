import { AsyncLocalStorage } from "node:async_hooks";
import type { AnyD1Database } from "drizzle-orm/d1";
import { getBindings, type PhotoBucket } from "@/lib/leads/bindings";
import { prefixedBucket } from "./bucket";
import { dealerById, hasD1, type Dealer } from "./directory";
import { dealerAccess } from "./membership";

// The dealer whose store every read and write uses (getDb, the record store, stock, the activity log, the bucket). In a request it is the
// signed-in person's (membership.ts); outside one (the Worker's jobs, later the site API) the code runs inside runAsDealer. No dealer is an
// error, never a fallback to another dealer or a shared store.
const scope = new AsyncLocalStorage<Dealer>();

export async function runAsDealer<T>(dealerId: string, fn: () => Promise<T>): Promise<T> {
  const dealer = await dealerById(dealerId);
  if (!dealer) throw new Error("Unknown dealer");
  return scope.run(dealer, fn);
}

export async function currentDealer(): Promise<Dealer> {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  const a = await dealerAccess();
  if (a.state === "ok") return a.dealer;
  throw new Error("No current dealer");
}

// Whether this code runs inside runAsDealer (a job) rather than for a signed-in person.
export const inDealerScope = () => scope.getStore() !== undefined;

// The shared bucket, seen through the current dealer's prefix (dealers/<id>/). Undefined with no bucket (next dev, the E2E run); the dealer
// is checked first either way.
export async function dealerBucket(): Promise<PhotoBucket | undefined> {
  const { id } = await currentDealer();
  const b = getBindings().LEAD_PHOTOS;
  return b && prefixedBucket(b, id);
}

// A dealer's own D1 database, by the binding name the directory gives it.
export const dealerBinding = (name: string): AnyD1Database | undefined => (getBindings() as Record<string, AnyD1Database | undefined>)[name];

export { hasD1 }; // here too, beside the rest of what picks the dealer's store
