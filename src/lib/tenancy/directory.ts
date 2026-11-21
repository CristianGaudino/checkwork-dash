import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getBindings } from "@/lib/leads/bindings";
import { dealers, members } from "@/lib/db/directory-schema";
import type { Role } from "@/lib/permission-rules";
import { SITE_NAME } from "@/lib/site";

// The directory: the dealers, and who works at each with which role. On the Worker the DIRECTORY D1 database; with no D1 (next dev, the
// E2E run, unit tests) a copy in memory with two dealers: Checkwork Motors (the demo, with its made-up team) and Test Motors (empty, not a
// demo). The only place that answers who may open which dealer (src/lib/tenancy/current.ts).
export type Dealer = { id: string; name: string; binding: string; demo: boolean; status: "active" | "paused"; createdAt: number };
export type Member = { dealerId: string; email: string; role: Role; addedAt: number };

// D1 or memory, for the whole app at once: with the directory bound (the Worker) every store is D1 and a dealer whose database is missing
// fails; with no Cloudflare bindings at all (next dev, next start for the E2E run, unit tests) every store is in memory, kept per dealer.
export const hasD1 = () => Boolean(getBindings().DIRECTORY);

// The person the open app (next dev, NEXT_PUBLIC_ADMIN_OPEN=1) acts as (src/lib/staff.ts). The .invalid domain can never be a real address.
export const DEV_EMAIL = "dev@checkwork.invalid";
export const DEMO_DEALER = "checkwork-motors";

const SEED_DEALERS: Dealer[] = [
  { id: DEMO_DEALER, name: SITE_NAME, binding: "DB_CHECKWORK_MOTORS", demo: true, status: "active", createdAt: 0 },
  { id: "test-motors", name: "Test Motors", binding: "DB_TEST_MOTORS", demo: false, status: "active", createdAt: 1 },
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
// shortcut: memory is per server instance, like the record store (src/lib/admin/docs.ts). Fine for dev and tests; the Worker uses D1.
let memory: { dealers: Dealer[]; members: Member[] } | null = null;
const mem = () => {
  // A production build with no DIRECTORY bound is a broken deploy, not the E2E run: fail loudly instead of answering from memory and losing
  // every write (the same rule as stock, src/lib/stock/index.ts).
  if (process.env.NODE_ENV === "production" && process.env.E2E_FAKE_BACKENDS !== "1") throw new Error("Missing binding DIRECTORY");
  return (memory ??= { dealers: SEED_DEALERS.map((d) => ({ ...d })), members: SEED_MEMBERS.map((m) => ({ ...m })) });
};
// Tests: back to the two seeded dealers.
export const resetMemoryDirectory = () => void (memory = null);

const db = () => {
  const d1 = getBindings().DIRECTORY;
  if (!d1) throw new Error("Missing binding DIRECTORY");
  return drizzle(d1);
};
const toDealer = (r: typeof dealers.$inferSelect): Dealer => ({ ...r, createdAt: r.createdAt.getTime() });
const toMember = (r: typeof members.$inferSelect): Member => ({ ...r, addedAt: r.addedAt.getTime() });

export async function listDealers(): Promise<Dealer[]> {
  if (!hasD1()) return mem().dealers.map((d) => ({ ...d }));
  return (await db().select().from(dealers).orderBy(asc(dealers.id))).map(toDealer);
}

export async function dealerById(id: string): Promise<Dealer | undefined> {
  if (!hasD1()) return mem().dealers.find((d) => d.id === id);
  const [r] = await db().select().from(dealers).where(eq(dealers.id, id)).limit(1);
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
      return dealer ? [{ ...x, dealer: { ...dealer } }] : [];
    });
  }
  const rows = await db().select().from(members).innerJoin(dealers, eq(members.dealerId, dealers.id)).where(and(eq(members.email, e), eq(dealers.status, "active"))).orderBy(asc(members.addedAt));
  return rows.map((r) => ({ ...toMember(r.members), dealer: toDealer(r.dealers) }));
}

// Everyone at one dealer, oldest first.
export async function membersOf(dealerId: string): Promise<Member[]> {
  if (!hasD1()) return mem().members.filter((x) => x.dealerId === dealerId).map((x) => ({ ...x }));
  return (await db().select().from(members).where(eq(members.dealerId, dealerId)).orderBy(asc(members.addedAt))).map(toMember);
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
  await db().insert(members).values({ dealerId, email: e, role }).onConflictDoUpdate({ target: [members.dealerId, members.email], set: { role } });
}

export async function removeMember(dealerId: string, email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!hasD1()) {
    const m = mem();
    m.members = m.members.filter((x) => !(x.dealerId === dealerId && x.email === e));
    return;
  }
  await db().delete(members).where(and(eq(members.dealerId, dealerId), eq(members.email, e)));
}
