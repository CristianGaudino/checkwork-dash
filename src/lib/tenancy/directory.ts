import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getBindings } from "@/lib/leads/bindings";
import { dealers, members, passkeys, sessions, signInAttempts, siteKeys, staff } from "@/lib/db/directory-schema";
import { same } from "@/lib/cron";
import type { Role } from "@/lib/permission-rules";
import { DEMO_NAME, DEMO_PROFILE, parseProfile, type DealerProfile } from "./profile";

// The directory: the dealers, and who works at each with which role. On the Worker the DIRECTORY D1 database; with no D1 (next dev, the
// E2E run, unit tests) a copy in memory with two dealers: Checkwork Motors (the demo, with its made-up team) and Test Motors (empty, not a
// demo). The only place that answers who may open which dealer (src/lib/tenancy/current.ts).
// `profile`: the dealer's facts, plan, stock source and rules (profile.ts), read with the dealer, so it costs no second read.
export type Dealer = { id: string; name: string; binding: string; demo: boolean; status: "active" | "paused"; createdAt: number; profile: DealerProfile };
export type Member = { dealerId: string; email: string; role: Role; addedAt: number };

// D1 or memory, for the whole app at once: with the directory bound (the Worker) every store is D1 and a dealer whose database is missing
// fails; with no Cloudflare bindings at all (next dev, next start for the E2E run, unit tests) every store is in memory, kept per dealer.
export const hasD1 = () => Boolean(getBindings().DIRECTORY);

// The person the open app (next dev, NEXT_PUBLIC_ADMIN_OPEN=1) acts as (src/lib/staff.ts). The .invalid domain can never be a real address.
export const DEV_EMAIL = "dev@checkwork.invalid";
export const DEMO_DEALER = "checkwork-motors";

// Stored as the directory stores it (a JSON text), so memory and D1 read it the same way.
type Row = Omit<Dealer, "profile"> & { profile: string };
const SEED_DEALERS: Row[] = [
  { id: DEMO_DEALER, name: DEMO_NAME, binding: "DB_CHECKWORK_MOTORS", demo: true, status: "active", createdAt: 0, profile: "{}" },
  { id: "test-motors", name: "Test Motors", binding: "DB_TEST_MOTORS", demo: false, status: "active", createdAt: 1, profile: "{}" },
];
// The demo's made-up team (TEAM_SEED in src/lib/admin/collections.ts) and the open app's person, who is at both dealers.
const SEED_MEMBERS: Member[] = [
  ...[
    ["aoife@example.com", "Owner"],
    ["conor@example.com", "Sales"],
    ["niamh@example.com", "Finance"],
    ["ciara@example.com", "Manager"],
  ].map(([email, role], i): Member => ({ dealerId: DEMO_DEALER, email, role: role as Role, addedAt: i })),
  { dealerId: DEMO_DEALER, email: DEV_EMAIL, role: "Owner", addedAt: 10 },
  { dealerId: "test-motors", email: DEV_EMAIL, role: "Owner", addedAt: 11 },
];
// The demo dealer's website key, in memory only (next dev and the E2E run, so the E2E suite can call the site API): not a secret, since memory
// never runs in production (mem() throws there). docs/site-api.md. Its hash is checked against it in site-keys.test.ts.
export const DEMO_SITE_KEY = "cw_site_demo-key-for-next-dev-and-e2e-not-a-secret0";
const DEMO_SITE_KEY_HASH = "78630084e15e7eb9948b4531f317f2860bdfc95d41d07ed2431d837044395552";
type KeyRow = SiteKey & { hash: string };
// shortcut: memory is per server instance, like the record store (src/lib/admin/docs.ts). Fine for dev and tests; the Worker uses D1. Kept on
// globalThis so the route handlers (the site API) and the pages, which `next start` bundles apart, share one copy.
// Our own sign-in's tables (docs/sign-in.md, section 6), as D1 returns their rows; empty until someone signs in.
type Mem = {
  dealers: Row[];
  members: Member[];
  siteKeys: KeyRow[];
  staff: (typeof staff.$inferSelect)[];
  passkeys: (typeof passkeys.$inferSelect)[];
  sessions: (typeof sessions.$inferSelect)[];
  signInAttempts: (typeof signInAttempts.$inferSelect)[];
};
const held = globalThis as { __checkworkDirectory?: Mem | null };
const mem = () => {
  // A production build with no DIRECTORY bound is a broken deploy, not the E2E run: fail loudly instead of answering from memory and losing
  // every write (the same rule as stock, src/lib/stock/index.ts).
  if (process.env.NODE_ENV === "production" && process.env.E2E_FAKE_BACKENDS !== "1") throw new Error("Missing binding DIRECTORY");
  return (held.__checkworkDirectory ??= {
    dealers: SEED_DEALERS.map((d) => ({ ...d })),
    members: SEED_MEMBERS.map((m) => ({ ...m })),
    siteKeys: [{ id: "demo-site-key", dealerId: DEMO_DEALER, hash: DEMO_SITE_KEY_HASH, label: "Demo website", createdAt: Date.now(), lastUsedAt: null, revokedAt: null }],
    staff: [],
    passkeys: [],
    sessions: [],
    signInAttempts: [],
  });
};
// Tests: back to the two seeded dealers.
export const resetMemoryDirectory = () => void (held.__checkworkDirectory = null);

const db = () => {
  const d1 = getBindings().DIRECTORY;
  if (!d1) throw new Error("Missing binding DIRECTORY");
  return drizzle(d1);
};
// A failed query's error carries its values (a staff email, a key's hash), and an uncaught error is printed to Workers Logs. Rethrown with
// the operation's name only, as the record store does (src/lib/admin/docs.ts).
const quiet = <R,>(q: PromiseLike<R>, op: string): Promise<R> =>
  Promise.resolve(q).catch(() => {
    throw new Error(`directory ${op} failed`);
  });
// The memory copy, the D1 handle and the quiet rethrow, for our sign-in's tables in the directory (src/lib/auth/session.ts).
export { mem as memoryDirectory, db as directoryDb, quiet as quietDirectory };
// What is stored, over the made-up demo business (every module, its facts) for a demo dealer and over the plain defaults for any other.
const withProfile = (r: Row): Dealer => ({ ...r, profile: parseProfile(r.profile, r.demo ? DEMO_PROFILE : undefined) });
const toDealer = (r: typeof dealers.$inferSelect): Dealer => withProfile({ ...r, createdAt: r.createdAt.getTime() });
const toMember = (r: typeof members.$inferSelect): Member => ({ ...r, addedAt: r.addedAt.getTime() });

export async function listDealers(): Promise<Dealer[]> {
  if (!hasD1()) return mem().dealers.map(withProfile);
  return (await quiet(db().select().from(dealers).orderBy(asc(dealers.id)), "listDealers")).map(toDealer);
}

export async function dealerById(id: string): Promise<Dealer | undefined> {
  if (!hasD1()) {
    const d = mem().dealers.find((x) => x.id === id);
    return d && withProfile(d);
  }
  const [r] = await quiet(db().select().from(dealers).where(eq(dealers.id, id)).limit(1), "dealerById");
  return r && toDealer(r);
}

// Where this person works, active dealers only, oldest membership first.
export async function membershipsOf(email: string): Promise<(Member & { dealer: Dealer })[]> {
  const e = email.trim().toLowerCase();
  if (!e) return [];
  if (!hasD1()) {
    const m = mem();
    return m.members.filter((x) => x.email === e).flatMap((x) => {
      const dealer = m.dealers.find((d) => d.id === x.dealerId && d.status === "active");
      return dealer ? [{ ...x, dealer: withProfile(dealer) }] : [];
    });
  }
  const rows = await quiet(db().select().from(members).innerJoin(dealers, eq(members.dealerId, dealers.id)).where(and(eq(members.email, e), eq(dealers.status, "active"))).orderBy(asc(members.addedAt)), "membershipsOf");
  return rows.map((r) => ({ ...toMember(r.members), dealer: toDealer(r.dealers) }));
}

// Everyone at one dealer, oldest first.
export async function membersOf(dealerId: string): Promise<Member[]> {
  if (!hasD1()) return mem().members.filter((x) => x.dealerId === dealerId).map((x) => ({ ...x }));
  return (await quiet(db().select().from(members).where(eq(members.dealerId, dealerId)).orderBy(asc(members.addedAt)), "membersOf")).map(toMember);
}

// Adds the person, or changes their role. Lower case, so a signed-in address always matches.
export async function putMember(dealerId: string, email: string, role: Role): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!hasD1()) {
    const m = mem();
    const cur = m.members.find((x) => x.dealerId === dealerId && x.email === e);
    if (cur) cur.role = role;
    else m.members.push({ dealerId, email: e, role, addedAt: Date.now() });
    return;
  }
  await quiet(db().insert(members).values({ dealerId, email: e, role }).onConflictDoUpdate({ target: [members.dealerId, members.email], set: { role } }), "putMember");
}

export async function removeMember(dealerId: string, email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!hasD1()) {
    const m = mem();
    m.members = m.members.filter((x) => !(x.dealerId === dealerId && x.email === e));
    return;
  }
  await quiet(db().delete(members).where(and(eq(members.dealerId, dealerId), eq(members.email, e))), "removeMember");
}

// The dealer's name and the given parts of their profile, merged over what is stored (JSON merge patch, in the one UPDATE, so a part we set
// at the same moment is never written back stale): Settings, Your business, for the facts the dealer may change. `null` puts the profile
// back to its base (the demo reset). The rest of the profile is ours (docs/new-dealer.md).
// SQLite's json_patch (RFC 7396) for the copy in memory: objects merge, anything else replaces, null removes.
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isObject(patch)) return patch;
  const out = isObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) if (v === null) delete out[k];
  else out[k] = mergePatch(out[k], v);
  return out;
}
export async function patchDealer(id: string, name: string, patch: Partial<DealerProfile> | null): Promise<void> {
  const json = JSON.stringify(patch ?? {});
  if (!hasD1()) {
    const d = mem().dealers.find((x) => x.id === id);
    if (d) Object.assign(d, { name, profile: patch ? JSON.stringify(mergePatch(JSON.parse(d.profile), patch)) : json });
    return;
  }
  await quiet(
    db()
      .update(dealers)
      .set({ name, profile: patch ? sql`json_patch(${dealers.profile}, ${json})` : json })
      .where(eq(dealers.id, id)),
    "patchDealer",
  );
}

// ---- Website keys (the site API, docs/site-api.md) ----
// A key is "cw_site_" and 32 random bytes in base64url. Only its SHA-256 is stored; the key itself is shown once, when it is made.
export type SiteKey = { id: string; dealerId: string; label: string; createdAt: number; lastUsedAt: number | null; revokedAt: number | null };
const KEY_SHAPE = /^cw_site_[A-Za-z0-9_-]{43}$/;
const HOUR_MS = 3_600_000;
export async function hashSiteKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const toSiteKey = ({ id, dealerId, label, createdAt, lastUsedAt, revokedAt }: KeyRow): SiteKey => ({ id, dealerId, label, createdAt, lastUsedAt, revokedAt }); // never the hash
const fromRow = (r: typeof siteKeys.$inferSelect): KeyRow => ({ ...r, createdAt: r.createdAt.getTime(), lastUsedAt: r.lastUsedAt?.getTime() ?? null, revokedAt: r.revokedAt?.getTime() ?? null });

export async function makeSiteKey(dealerId: string, label: string): Promise<{ key: string; siteKey: SiteKey }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = "cw_site_" + btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const row: KeyRow = { id: crypto.randomUUID(), dealerId, hash: await hashSiteKey(key), label, createdAt: Date.now(), lastUsedAt: null, revokedAt: null };
  if (!hasD1()) mem().siteKeys.push(row);
  else await quiet(db().insert(siteKeys).values({ ...row, createdAt: new Date(row.createdAt), lastUsedAt: null, revokedAt: null }), "makeSiteKey");
  return { key, siteKey: toSiteKey(row) };
}

// One dealer's keys, revoked ones too, newest first. Never the hash.
export async function siteKeysOf(dealerId: string): Promise<SiteKey[]> {
  if (!hasD1()) return mem().siteKeys.filter((k) => k.dealerId === dealerId).sort((a, b) => b.createdAt - a.createdAt).map(toSiteKey);
  return (await quiet(db().select().from(siteKeys).where(eq(siteKeys.dealerId, dealerId)).orderBy(desc(siteKeys.createdAt)), "siteKeysOf")).map((r) => toSiteKey(fromRow(r)));
}

// Revokes one of this dealer's keys (a key of another dealer is not found). The key revoked, or undefined if there was none still on.
export async function revokeSiteKey(dealerId: string, id: string): Promise<SiteKey | undefined> {
  const now = Date.now();
  if (!hasD1()) {
    const k = mem().siteKeys.find((x) => x.dealerId === dealerId && x.id === id && x.revokedAt === null);
    if (k) k.revokedAt = now;
    return k && toSiteKey(k);
  }
  const [r] = await quiet(db().update(siteKeys).set({ revokedAt: new Date(now) }).where(and(eq(siteKeys.dealerId, dealerId), eq(siteKeys.id, id), isNull(siteKeys.revokedAt))).returning(), "revokeSiteKey");
  return r && toSiteKey(fromRow(r));
}

// The dealer a website key belongs to: an active dealer and a key not revoked, else null. Looked up by the key's hash, and the hash then
// compared in constant time. Marks the key used, at most once an hour, so a busy website does not write on every request.
export async function dealerOfSiteKey(key: string): Promise<{ dealer: Dealer; keyId: string } | null> {
  if (!KEY_SHAPE.test(key)) return null;
  const hash = await hashSiteKey(key);
  const now = Date.now();
  if (!hasD1()) {
    const m = mem();
    const k = m.siteKeys.find((x) => same(x.hash, hash) && x.revokedAt === null);
    const d = k && m.dealers.find((x) => x.id === k.dealerId && x.status === "active");
    if (!k || !d) return null;
    if (k.lastUsedAt === null || k.lastUsedAt < now - HOUR_MS) k.lastUsedAt = now;
    return { dealer: withProfile(d), keyId: k.id };
  }
  const [r] = await quiet(db().select().from(siteKeys).innerJoin(dealers, eq(siteKeys.dealerId, dealers.id)).where(and(eq(siteKeys.hash, hash), isNull(siteKeys.revokedAt), eq(dealers.status, "active"))).limit(1), "dealerOfSiteKey");
  if (!r || !same(r.site_keys.hash, hash)) return null;
  const used = r.site_keys.lastUsedAt?.getTime();
  if (used === undefined || used < now - HOUR_MS)
    await quiet(db().update(siteKeys).set({ lastUsedAt: new Date(now) }).where(and(eq(siteKeys.id, r.site_keys.id), or(isNull(siteKeys.lastUsedAt), lt(siteKeys.lastUsedAt, new Date(now - HOUR_MS))))), "markKeyUsed");
  return { dealer: toDealer(r.dealers), keyId: r.site_keys.id };
}
