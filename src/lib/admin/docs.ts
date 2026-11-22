import "server-only";
import { and, eq, inArray, notLike, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminDocs } from "@/lib/db/schema";
import { currentDealer, hasD1 } from "@/lib/tenancy/current";
import type { Dealer } from "@/lib/tenancy/directory";

// One small record store for everything the dealer admin keeps (test drives, posts, campaigns, settings...), in the current dealer's own
// store (src/lib/tenancy). On the Worker it is the `admin_docs` table of that dealer's D1 database; with no D1 (next dev, the E2E run) it is
// a map in memory, one per dealer, so the areas work with nothing set up and dealers stay apart there too.
// A collection starts from its seed function the first time it is read, so a fresh database shows a lived-in demo.
// shortcut: memory is per server instance, so with no D1 binding edits last only as long as the process. Fine for dev and tests; the Worker
// uses D1. Kept on globalThis because `next start` bundles route handlers (the site API) apart from pages and actions: one copy for both.
export type Doc = { id: string } & Record<string, unknown>;

const memory = ((globalThis as { __checkworkDocs?: Map<string, Map<string, Map<string, Doc>>> }).__checkworkDocs ??= new Map()); // dealer id, collection, record id
export const SEEDED = "_seeded"; // collection holding one marker row per seeded collection (the activity log uses it too)
const seededHere = new Set<string>(); // "dealer/collection" this instance already knows are seeded, so a call costs no extra query
const memoryOf = (dealer: Dealer) => memory.get(dealer.id) ?? memory.set(dealer.id, new Map()).get(dealer.id)!;

// The made-up records (leads, reviews, posts, a team...) are for a dealer the directory marks as a demo, on any deploy. A real dealer's
// dashboard starts empty. `always` is for a record a dealer cannot run without (the settings), which seeds its defaults either way.
// The Settings reset button and the morning reset (src/app/api/demo/reset) are for a demo dealer too: a real dealer never gets made-up
// records, nor the button that wipes its own.
export const demoRecordsFor = (dealer: Pick<Dealer, "demo">) => dealer.demo;
export const mayResetDemo = async () => (await currentDealer()).demo;

// `demoSeed` gets whether the dealer has made-up records, for an `always` collection whose defaults differ (the settings).
export function defineCollection<T extends Doc>(name: string, demoSeed: (demo: boolean) => T[], { always = false }: { always?: boolean } = {}) {
  const seedFor = (dealer: Dealer) => (always || demoRecordsFor(dealer) ? demoSeed(demoRecordsFor(dealer)) : []);
  // A failed query's error carries its values (a lead's name, email, phone), and an uncaught error is printed to Workers Logs. Rethrown
  // with the collection's name only, so a D1 hiccup never puts a customer in the logs.
  const quiet = <R,>(q: PromiseLike<R>, op: string): Promise<R> =>
    Promise.resolve(q).catch(() => {
      throw new Error(`admin_docs ${name} ${op} failed`);
    });
  // `seedIfNew` false is for a public page: it never writes, so a visitor's page view cannot seed a collection. Returns whether it is ready.
  // The current dealer's records of this collection: a map in memory, or their D1 database. `ok` false: not seeded, and not to be.
  type Where = { ok: boolean; mem?: Map<string, Doc>; db?: Awaited<ReturnType<typeof getDb>>; dealer: Dealer };
  async function ready(seedIfNew = true): Promise<Where> {
    const dealer = await currentDealer();
    if (!hasD1()) {
      const mine = memoryOf(dealer);
      if (!mine.has(name)) mine.set(name, new Map(seedFor(dealer).map((d) => [d.id, d])));
      return { ok: true, mem: mine.get(name)!, dealer };
    }
    const db = await getDb();
    const key = `${dealer.id}/${name}`;
    if (seededHere.has(key)) return { ok: true, db, dealer };
    const done = await quiet(db.select({ id: adminDocs.id }).from(adminDocs).where(and(eq(adminDocs.collection, SEEDED), eq(adminDocs.id, name))).limit(1), "ready");
    if (done.length) {
      seededHere.add(key);
      return { ok: true, db, dealer };
    }
    if (!seedIfNew) return { ok: false, db, dealer };
    // Twenty rows a statement (D1 allows 100 bound values, three a row), so a first visit is a few round trips, not one per record.
    // Conflicts are ignored, so two first visits cannot clash.
    const rows = seedFor(dealer).map((d) => ({ collection: name, id: d.id, data: d }));
    for (let i = 0; i < rows.length; i += 20) await quiet(db.insert(adminDocs).values(rows.slice(i, i + 20)).onConflictDoNothing(), "seed");
    await quiet(db.insert(adminDocs).values({ collection: SEEDED, id: name, data: {} }).onConflictDoNothing(), "seed");
    seededHere.add(key);
    return { ok: true, db, dealer };
  }

  return {
    name,
    async list(opts?: { seed?: boolean }): Promise<T[]> {
      const w = await ready(opts?.seed ?? true);
      if (!w.ok) return [];
      if (w.mem) return [...w.mem.values()] as T[];
      const rows = await quiet(w.db!.select({ data: adminDocs.data }).from(adminDocs).where(eq(adminDocs.collection, name)), "list");
      return rows.map((r) => r.data as T);
    },
    async get(id: string): Promise<T | undefined> {
      const w = await ready();
      if (w.mem) return w.mem.get(id) as T | undefined;
      const rows = await quiet(w.db!.select({ data: adminDocs.data }).from(adminDocs).where(and(eq(adminDocs.collection, name), eq(adminDocs.id, id))).limit(1), "get");
      return rows[0]?.data as T | undefined;
    },
    async put(doc: T): Promise<void> {
      const w = await ready();
      if (w.mem) return void w.mem.set(doc.id, doc);
      await quiet(
        w.db!
          .insert(adminDocs)
          .values({ collection: name, id: doc.id, data: doc })
          // Always a later updated_at than the row had, even in the same millisecond, so an update() racing this put sees it.
          .onConflictDoUpdate({ target: [adminDocs.collection, adminDocs.id], set: { data: doc, updatedAt: sql`max(${Date.now()}, ${adminDocs.updatedAt} + 1)` } }),
        "put",
      );
    },
    // A change to a record that may be changed at the same time (a note while the status moves): `fn` gets the record as it is now, and
    // the write only lands if nobody wrote it since (updated_at unchanged); one retry on a clash. A record that is gone (erased, purged)
    // stays gone: nothing is written and it returns undefined.
    async update(id: string, fn: (doc: T) => T | Promise<T>): Promise<T | undefined> {
      const w = await ready();
      if (w.mem) {
        const cur = w.mem.get(id) as T | undefined;
        if (!cur) return undefined;
        const next = await fn(cur);
        if (!w.mem.has(id)) return undefined;
        w.mem.set(id, next);
        return next;
      }
      const db = w.db!;
      const where = and(eq(adminDocs.collection, name), eq(adminDocs.id, id));
      for (let attempt = 0; attempt < 2; attempt++) {
        const [row] = await quiet(db.select({ data: adminDocs.data, at: adminDocs.updatedAt }).from(adminDocs).where(where).limit(1), "update");
        if (!row) return undefined;
        const next = await fn(row.data as T);
        // At least a millisecond on from the last write, so two writes in the same millisecond still tell apart.
        const at = new Date(Math.max(Date.now(), row.at.getTime() + 1));
        const done = await quiet(db.update(adminDocs).set({ data: next, updatedAt: at }).where(and(where, eq(adminDocs.updatedAt, row.at))).returning({ id: adminDocs.id }), "update");
        if (done.length) return next;
      }
      throw new Error(`admin_docs ${name} update clashed`);
    },
    // Delete some records and write others as one unit: one D1 batch, which is one round trip and all or nothing (a failed insert leaves the
    // deleted records in place). D1 allows 100 bound values a statement, so the ids and rows go in chunks of statements inside that batch.
    async replaceMany(removeIds: string[], docs: T[]): Promise<void> {
      const w = await ready();
      if (w.mem) {
        const done = new Map(w.mem);
        removeIds.forEach((id) => done.delete(id));
        docs.forEach((d) => done.set(d.id, d));
        w.mem.clear();
        done.forEach((d, id) => w.mem!.set(id, d));
        return;
      }
      const db = w.db!;
      const at = new Date(); // `docs` ids must be new or in `removeIds`: a clash fails the whole batch
      const stmts = [];
      for (let i = 0; i < removeIds.length; i += 90) stmts.push(db.delete(adminDocs).where(and(eq(adminDocs.collection, name), inArray(adminDocs.id, removeIds.slice(i, i + 90)))));
      for (let i = 0; i < docs.length; i += 20) stmts.push(db.insert(adminDocs).values(docs.slice(i, i + 20).map((d) => ({ collection: name, id: d.id, data: d, updatedAt: at }))));
      if (stmts.length) await quiet(db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]), "replaceMany");
    },
    async remove(id: string): Promise<void> {
      const w = await ready();
      if (w.mem) return void w.mem.delete(id);
      await quiet(w.db!.delete(adminDocs).where(and(eq(adminDocs.collection, name), eq(adminDocs.id, id))), "remove");
    },
    // Back to the seed: used by "Reset demo data". Records that came from visitors (ids starting "real-") are never touched.
    async reset(): Promise<void> {
      const dealer = await currentDealer();
      if (!hasD1()) {
        const mine = memoryOf(dealer);
        const real = [...(mine.get(name) ?? [])].filter(([id]) => id.startsWith("real-"));
        return void mine.set(name, new Map([...seedFor(dealer).map((d): [string, Doc] => [d.id, d]), ...real]));
      }
      const db = await getDb();
      seededHere.delete(`${dealer.id}/${name}`);
      await db.delete(adminDocs).where(and(eq(adminDocs.collection, name), notLike(adminDocs.id, "real-%")));
      await db.delete(adminDocs).where(and(eq(adminDocs.collection, SEEDED), eq(adminDocs.id, name)));
      // Seeded again at once: other Worker isolates still remember this collection as seeded and would otherwise list nothing.
      await ready();
    },
  };
}
