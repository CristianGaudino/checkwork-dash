import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { mirrorLead } from "@/lib/admin/real-leads";
import { getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { buildLeadEmail } from "@/lib/leads/email";
import { leadRecipients, sendToDealer } from "@/lib/leads/mail";
import { DETAIL_LABELS, TYPE_LABELS, leadSchemaFor, oneLine, type LeadType } from "@/lib/leads/schema";
import { createDrizzleStore, type LeadRow } from "@/lib/leads/store";
import { logLead } from "@/lib/log";
import { currentDealer, hasD1 } from "@/lib/tenancy/current";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/visit-rules";
import type { Answer } from "./request";

// POST /api/site/v1/leads: a lead the dealer's website already stored (and emailed, or tried to). It lands in this dealer's `leads` table
// and inbox as a website lead always did: the bell, the staff WhatsApp alert, and the dealer's lead email when the website could not send it.
// The website ran the browser's checks (bot check, per-visitor limit); this checks the lead again by the same rules (src/lib/leads/schema.ts),
// consent included. Runs inside the key's dealer (siteRequest). Nothing from the lead is ever logged.

const TYPES = Object.keys(TYPE_LABELS) as [LeadType, ...LeadType[]];
const time = z.number().int().positive();
// The v1 contract: exactly these fields, epoch milliseconds for times. No photos, only how many came with it.
const envelope = z.strictObject({
  lead: z.strictObject({
    id: z.uuid(), // the website's own id, not ours
    clientRef: z.uuid(),
    type: z.enum(TYPES),
    carId: z.string().regex(/^\d{1,12}$/).nullable(),
    carSlug: z.string().regex(/^[a-z0-9-]{1,200}$/).nullable(),
    carTitle: oneLine(z.string().max(200)).nullable(),
    carPriceEur: z.number().int().min(0).max(10_000_000).nullable(),
    sourcePath: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    message: z.string().nullable(),
    details: z.record(z.string(), z.union([z.string(), z.number()])),
    consentAt: time,
    consentVersion: z.string().trim().min(1).max(40),
    createdAt: time,
  }),
  emailed: z.boolean(),
  photoCount: z.number().int().min(0).max(20),
});

const INVALID: Answer = { status: 400, outcome: "invalid" };

// Where a lead from the site API is kept: the dealer's `leads` table, by clientRef. With no D1 (next dev, the E2E run) a map per dealer, on
// globalThis like the record store, so the route and the pages share it.
type Store = { idOf(clientRef: string): Promise<string | undefined>; insert(row: LeadRow): Promise<boolean>; markNotified(id: string): Promise<void> };
const held = globalThis as { __checkworkSiteLeads?: Map<string, Map<string, string>> };
async function store(): Promise<Store> {
  if (!hasD1()) {
    const all = (held.__checkworkSiteLeads ??= new Map());
    const { id } = await currentDealer();
    const mine = all.get(id) ?? all.set(id, new Map()).get(id)!; // clientRef to our id
    return {
      idOf: async (ref) => mine.get(ref),
      insert: async (row) => !mine.has(row.clientRef) && Boolean(mine.set(row.clientRef, row.id)),
      markNotified: async () => {},
    };
  }
  const db = await getDb();
  const drizzleStore = createDrizzleStore(db);
  return {
    idOf: async (ref) => (await db.select({ id: leads.id }).from(leads).where(eq(leads.clientRef, ref)).limit(1))[0]?.id,
    insert: drizzleStore.insert,
    markNotified: drizzleStore.markNotified,
  };
}

export async function receiveLead(text: string): Promise<Answer> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return INVALID;
  }
  const sent = envelope.safeParse(json);
  if (!sent.success) return INVALID;
  const { lead, emailed, photoCount } = sent.data;

  // A retry of a lead already here gets the same id, before the rules are run again (a booking's day may have passed since).
  const leadsHere = await store();
  const known = await leadsHere.idOf(lead.clientRef);
  if (known) return { status: 200, outcome: "duplicate", body: { id: known } };

  // The website's stored lead back into the form's fields, so the same schema checks it. Its details hold the answers; the fields of the
  // contract come after, so a detail can never stand in for one. The channel is stored as its label; the schema takes its id.
  const { details } = lead;
  const channel = CHANNELS.find((c) => CHANNEL_LABELS[c] === details.channel);
  const dealer = await currentDealer();
  const parsed = leadSchemaFor(dealer.profile.hours).safeParse({
    ...Object.fromEntries(Object.entries(details).map(([k, v]) => [k, String(v)])),
    channel,
    type: lead.type,
    clientRef: lead.clientRef,
    sourcePath: lead.sourcePath,
    carId: lead.carId ?? undefined,
    name: lead.name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    message: lead.message ?? "",
    consent: "yes", // consentAt and consentVersion above are the consent
  });
  if (!parsed.success) return INVALID;
  const input = parsed.data;

  const row: LeadRow = {
    id: crypto.randomUUID(), // ours: a website never picks a key in this dealer's table
    clientRef: input.clientRef,
    type: input.type,
    // The car as the website snapshotted it from its stock when the lead came in (a sold car's lead is still a lead here).
    carId: lead.carId,
    carSlug: lead.carSlug,
    carTitle: lead.carTitle,
    carPriceEur: lead.carPriceEur,
    sourcePath: input.sourcePath,
    name: input.name ?? "Stock alert",
    phone: input.phone ?? null,
    email: input.email ?? null,
    message: input.message ?? null,
    details: Object.fromEntries(Object.entries(input).filter(([k, v]) => Object.hasOwn(DETAIL_LABELS, k) && v !== undefined)) as LeadRow["details"],
    photoKeys: [],
    consentAt: new Date(lead.consentAt),
    consentVersion: lead.consentVersion,
  };
  // Two retries at once: the second finds the first's row.
  if (!(await leadsHere.insert(row))) {
    const id = await leadsHere.idOf(row.clientRef);
    return id ? { status: 200, outcome: "duplicate", body: { id } } : { status: 500, outcome: "error" };
  }

  // The website could not email the dealer: we try, when the dealer has an address. A failure leaves the lead marked in the inbox.
  let told = emailed;
  if (!emailed && (await leadRecipients()).length > 0) {
    try {
      await sendToDealer({ ...buildLeadEmail(row, { demo: dealer.demo, siteUrl: dealer.profile.siteUrl }), replyTo: row.email ?? undefined });
      told = true;
    } catch {
      logLead({ leadId: row.id, type: row.type, outcome: "notify_failed" });
    }
  }
  // Best effort, as on the website: the lead is stored, so a failed copy into the inbox is logged by id and type for a hand copy.
  await mirrorLead(row, told, photoCount).catch(() => logLead({ leadId: row.id, type: row.type, outcome: "mirror_failed" }));
  if (told) await leadsHere.markNotified(row.id).catch(() => {});
  return { status: 201, outcome: "stored", body: { id: row.id } };
}
