import { blob, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
  profile: text().notNull().default("{}"), // the dealer's facts, plan, stock source and rules, as JSON (src/lib/tenancy/profile.ts)
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

// The keys dealer websites send to the site API (/api/site/v1, docs/site-api.md). Only the SHA-256 of a key is kept: the key itself is shown
// once, when it is made. A key belongs to one dealer, and decides it: nothing in a request can name another. Revoked keys stay, revoked.
export const siteKeys = sqliteTable(
  "site_keys",
  {
    id: text().primaryKey(),
    dealerId: text("dealer_id")
      .notNull()
      .references(() => dealers.id),
    hash: text().notNull().unique(), // hex SHA-256 of the key
    label: text().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }), // written at most once an hour per key
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("site_keys_dealer_idx").on(t.dealerId)],
);

// ---- Our own sign-in (docs/sign-in.md, section 6) ----
// Who someone is, apart from which dealer: a session is a person, not a dealer, and which dealer stays `members`'. Only hashes and HMACs
// of what a browser holds are kept (a cookie, a code, a link), never the values, and no IP address or user agent: only the device kind.

// One row per person, made the first time they ask for a code or sign in. `id` is their WebAuthn user handle (32 random bytes, base64url).
export const staff = sqliteTable("staff", {
  id: text().primaryKey(),
  email: text().notNull().unique(), // lower case, as in members
  codeFailures: integer("code_failures").notNull().default(0), // wrong codes in a row; back to 0 at any sign-in
  codeLockedUntil: integer("code_locked_until", { mode: "timestamp_ms" }), // codes refused until then (15 wrong in a day)
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const passkeys = sqliteTable(
  "passkeys",
  {
    id: text().primaryKey(), // the credential id, base64url
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    publicKey: blob("public_key", { mode: "buffer" }).notNull(), // the COSE key as sent; a public key, not a secret
    alg: integer().notNull(), // -8, -7 or -257
    signCount: integer("sign_count").notNull().default(0),
    backupEligible: integer("backup_eligible", { mode: "boolean" }).notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text().notNull().default("[]"), // what the browser reported, as JSON
    label: text().notNull(), // the device kind ("iPhone"), deviceLabel
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("passkeys_staff_idx").on(t.staffId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(), // hex SHA-256 of the cookie value
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    method: text().$type<"passkey" | "email">().notNull(),
    label: text().notNull(), // the device kind
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(), // written at most once every 5 minutes
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(), // the sign-in, or the last "Confirm it's you"
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), // the absolute lifetime
  },
  (t) => [index("sessions_staff_idx").on(t.staffId)],
);

// Pending challenges, codes and links, each single use. A code row is written for every request, with no email and no code when the email is
// unknown, over a limit or locked; the per-email counts come from the rows that have an email.
export const signInAttempts = sqliteTable(
  "sign_in_attempts",
  {
    id: text().primaryKey(),
    kind: text().$type<"passkey-sign-in" | "passkey-register" | "passkey-confirm" | "code" | "confirm-code" | "link">().notNull(),
    email: text(), // code, link and confirm-code rows for a known email only
    staffId: text("staff_id").references(() => staff.id), // registration and confirmation
    challenge: text(), // passkeys, base64url
    codeHmac: text("code_hmac"),
    tokenHmac: text("token_hmac").unique(),
    browserHash: text("browser_hash"), // the attempt cookie's hash
    tries: integer().notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("sign_in_attempts_created_idx").on(t.createdAt), // the nightly purge
    index("sign_in_attempts_browser_idx").on(t.browserHash), // a code is found by its attempt cookie
    index("sign_in_attempts_email_idx").on(t.email, t.createdAt), // the per-email counts
    index("sign_in_attempts_staff_idx").on(t.staffId),
  ],
);
