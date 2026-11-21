import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
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
  return runAsDealerRow(dealer, fn);
}
// The same with the dealer's row already read from the directory (a site key's lookup, a job's check), so it is not read twice.
export const runAsDealerRow = <T,>(dealer: Dealer, fn: () => Promise<T>): Promise<T> => scope.run(dealer, fn);

export async function currentDealer(): Promise<Dealer> {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  const a = await dealerAccess();
  if (a.state === "ok") return a.dealer;
  throw new Error("No current dealer");
}

// Whether this code runs inside runAsDealer (a job) rather than for a signed-in person.
export const inDealerScope = () => scope.getStore() !== undefined;

// The current dealer's facts, plan, stock source and rules (profile.ts), from the same read as the dealer.
export const dealerProfile = async () => (await currentDealer()).profile;

// One of the demo bar's switches (role, plan, stock sync): its cookie counts only for a demo dealer, and only in a request (a job has no
// cookies and acts for the dealer as it is). For any other dealer it is ignored, so a cookie never changes a real dealer's plan or role.
export async function demoCookie(name: string): Promise<string | undefined> {
  if (inDealerScope() || !(await currentDealer()).demo) return undefined;
  try {
    return (await cookies()).get(name)?.value;
  } catch {
    return undefined; // outside a request (a test, a script): no browser, so no switch
  }
}

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
