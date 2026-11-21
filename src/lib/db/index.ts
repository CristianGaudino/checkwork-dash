import "server-only";
import { drizzle } from "drizzle-orm/d1";
import { currentDealer, dealerBinding } from "@/lib/tenancy/current";
import * as schema from "./schema";

// The current dealer's own D1 database (src/lib/tenancy), per call: the binding exists only inside a request or a job. No current dealer, or
// a dealer whose binding is missing, throws: never another dealer's database. processLead logs that as an error line, so it fails loudly.
export async function getDb() {
  const dealer = await currentDealer();
  const d1 = dealerBinding(dealer.binding);
  if (!d1) throw new Error("Missing the dealer's database binding");
  return drizzle(d1, { schema });
}
