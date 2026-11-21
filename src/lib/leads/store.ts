import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { leads } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import type { LeadType } from "./schema";

// A lead as the dealer's `leads` table keeps it: what a dealer's website sends through the site API (src/lib/site-api/leads.ts).
export interface LeadRow {
  id: string;
  clientRef: string;
  type: LeadType;
  carId: string | null;
  carSlug: string | null;
  carTitle: string | null;
  carPriceEur: number | null;
  sourcePath: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  details: Record<string, string | number>;
  photoKeys: string[];
  consentAt: Date;
  consentVersion: string;
}

export interface LeadStore {
  insert(row: LeadRow): Promise<boolean>; // false when the clientRef is already stored
  markNotified(id: string): Promise<void>;
}

// Not server-only, so the libSQL integration test can run it. Plain insert, select and update only (no batch or
// transaction), so the D1 and libSQL drivers behave the same. Drizzle parameterises every value (T-03-14).
export function createDrizzleStore(db: BaseSQLiteDatabase<"async", unknown, typeof schema>): LeadStore {
  return {
    async insert(row) {
      const stored = await db.insert(leads).values(row).onConflictDoNothing({ target: leads.clientRef }).returning({ id: leads.id });
      return stored.length > 0;
    },
    async markNotified(id) {
      await db.update(leads).set({ notifiedAt: new Date() }).where(eq(leads.id, id));
    },
  };
}
