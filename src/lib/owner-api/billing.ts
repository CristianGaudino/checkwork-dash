import "server-only";
import { z } from "zod";
import { logActivity } from "@/lib/admin/activity";
import { addMonths, dublinDay } from "@/lib/admin/format";
import { fmtMonth } from "@/lib/billing/bills-rules";
import { billingSettings, saveBilling } from "@/lib/billing/usage";
import { runAsDealerRow } from "@/lib/tenancy/current";
import { dealerById } from "@/lib/tenancy/directory";
import { readCapped } from "@/lib/site-api/request";
import { ownerAuth } from "./auth";

// A dealer's contract term and free first month (#177), set by Checkwork with the owner token: the dealer only sees them on Billing.
// The demo dealer is allowed: these are its own billing settings and nothing goes outside.
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const say = (status: number, error?: string) => (error ? Response.json({ error }, { status, headers: HEADERS }) : new Response(null, { status, headers: HEADERS }));

// freeMonth: from last month (its bill may not be issued yet; an issued bill is never changed) to 12 months ahead. null clears it, left out keeps it.
const body = (thisMonth: string) => {
  const first = addMonths(`${thisMonth}-01`, -1).slice(0, 7);
  const last = addMonths(`${thisMonth}-01`, 12).slice(0, 7);
  return z.strictObject({
    term: z.union([z.literal(1), z.literal(2)]),
    freeMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine((m) => m >= first && m <= last).nullable().optional(),
  });
};
const ERROR = 'Send {"term": 1 or 2, "freeMonth": "YYYY-MM" or null}: the free month from last month to 12 months ahead';

export async function ownerBilling(req: Request, dealerId: string): Promise<Response> {
  if (!ownerAuth(req).ok) return say(404);
  const dealer = await dealerById(dealerId);
  if (!dealer) return say(404, "No dealer with that id");
  const read = async () => {
    const b = await runAsDealerRow(dealer, billingSettings);
    return { version: 1, term: b.term, freeMonth: b.freeMonth ?? null };
  };
  if (req.method === "GET") return Response.json(await read(), { headers: HEADERS });
  if (req.method !== "PUT") return say(405);

  const text = await readCapped(req, 1_000);
  let raw: unknown;
  try {
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  const r = body(dublinDay().slice(0, 7)).safeParse(raw);
  const log = (outcome: string) => console.log(JSON.stringify({ job: "owner-billing", dealer: dealerId, method: req.method, outcome }));
  if (!r.success) {
    log("refused");
    return say(400, ERROR);
  }
  const { term, freeMonth } = r.data;
  await runAsDealerRow(dealer, async () => {
    const was = await billingSettings();
    const change = { term, ...(freeMonth !== undefined && { freeMonth: freeMonth ?? undefined }) };
    await saveBilling(change);
    if (was.term !== term) await logActivity("settings", `Set the contract to ${term === 2 ? "2 years" : "1 year"}`, undefined, "Checkwork");
    if (freeMonth !== undefined && (was.freeMonth ?? null) !== freeMonth)
      await logActivity("settings", freeMonth ? `Set the first month free to ${fmtMonth(freeMonth)}` : "Removed the first month free", undefined, "Checkwork");
  });
  log("saved");
  return Response.json(await read(), { headers: HEADERS });
}
