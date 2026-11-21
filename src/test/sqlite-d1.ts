/**
 * Test stand-in for Cloudflare D1 with several databases, as on the Worker: the directory and one database per dealer, each its own
 * in-memory SQLite (libSQL) with its own committed migrations, so the real getDb() and the real directory pick between them. Use with
 *   vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
 *   vi.mock("@opennextjs/cloudflare", async () => {
 *     const { env } = await import("@/test/sqlite-d1");
 *     return { getCloudflareContext: () => ({ env }) };
 *   });
 * The bindings in `env` are plain names; the mocked drizzle() turns a name into its database. `env.LEAD_PHOTOS` is a bucket in memory
 * (`objects`, by full key). Each test file gets its own databases.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle as libsql } from "drizzle-orm/libsql";
import * as dealerSchema from "@/lib/db/schema";
import * as directorySchema from "@/lib/db/directory-schema";

async function migrated(dir: string): Promise<Client> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(join(process.cwd(), dir)).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(join(process.cwd(), dir, file), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await client.execute(stmt);
  }
  return client;
}

export const DEALER_BINDINGS = ["DB_CHECKWORK_MOTORS", "DB_TEST_MOTORS"] as const;
const clients = new Map<string, Client>([["DIRECTORY", await migrated("drizzle-directory")]]);
for (const b of DEALER_BINDINGS) clients.set(b, await migrated("drizzle"));

// The same two dealers as the directory's memory copy (src/lib/tenancy/directory.ts), and the same people.
const dir = clients.get("DIRECTORY")!;
await dir.execute(`insert into dealers (id, name, binding, demo, status, created_at) values ('checkwork-motors', 'Checkwork Motors', 'DB_CHECKWORK_MOTORS', 1, 'active', 0), ('test-motors', 'Test Motors', 'DB_TEST_MOTORS', 0, 'active', 1)`);
const people = [["checkwork-motors", "aoife@example.com", "Owner"], ["checkwork-motors", "conor@example.com", "Sales"], ["checkwork-motors", "niamh@example.com", "Finance"], ["checkwork-motors", "ciara@example.com", "Manager"], ["checkwork-motors", "dev@checkwork.invalid", "Owner"], ["test-motors", "dev@checkwork.invalid", "Owner"]];
for (const [i, [d, e, r]] of people.entries()) await dir.execute({ sql: "insert into members (dealer_id, email, role, added_at) values (?, ?, ?, ?)", args: [d, e, r, i] });

export const objects = new Map<string, Blob>();
const bucket = {
  put: async (key: string, value: Blob | ArrayBuffer) => void objects.set(key, value instanceof Blob ? value : new Blob([value])),
  get: async (key: string) => (objects.has(key) ? { body: objects.get(key)!.stream(), httpMetadata: { contentType: "image/jpeg" } } : null),
  delete: async (keys: string | string[]) => void [keys].flat().forEach((k) => objects.delete(k)),
  list: async ({ prefix }: { prefix: string }) => ({ objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
};
export const env: Record<string, unknown> = { DIRECTORY: "DIRECTORY", ...Object.fromEntries(DEALER_BINDINGS.map((b) => [b, b])), LEAD_PHOTOS: bucket };

// The mocked drizzle-orm/d1: a binding (its name here) to its database.
export function drizzle(binding: unknown) {
  const client = clients.get(String(binding));
  if (!client) throw new Error("not a test binding");
  return libsql(client, { schema: binding === "DIRECTORY" ? directorySchema : dealerSchema });
}

/** Empties the given tables of one database between tests. */
export async function truncateIn(binding: string, ...tables: string[]) {
  for (const t of tables) await clients.get(binding)!.execute(`delete from ${t}`);
}
