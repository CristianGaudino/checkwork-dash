import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Role } from "../permission-rules"; // relative: worker.mjs bundles this outside Next's "@/" alias

// The directory (wrangler.jsonc DIRECTORY): a small D1 database of its own that lists the dealers and who works at each. It decides which
// dealer's store a signed-in person may open, and with which role (src/lib/tenancy). Each dealer's records live in that dealer's own D1
// database, named here by its binding. Migrations in drizzle-directory/, additive only (scripts/check-migrations.sh).
export const dealers = sqliteTable("dealers", {
  id: text().primaryKey(), // a slug, e.g. checkwork-motors
  name: text().notNull(),
  binding: text().notNull().unique(), // the dealer's D1 binding in wrangler.jsonc, e.g. DB_CHECKWORK_MOTORS
  demo: integer({ mode: "boolean" }).notNull().default(false), // made-up records, and the demo reset
  status: text().$type<"active" | "paused">().notNull().default("active"), // paused: nobody opens it and no job runs for it
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// One row per person per dealer. The email is kept lower case; the rest of what the dealer knows about the person (name, phone, alerts)
// stays in the dealer's own store, keyed by this email.
export const members = sqliteTable(
  "members",
  {
    dealerId: text("dealer_id")
      .notNull()
      .references(() => dealers.id),
    email: text().notNull(),
    role: text().$type<Role>().notNull(),
    addedAt: integer("added_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.dealerId, t.email] }), index("members_email_idx").on(t.email)],
);
