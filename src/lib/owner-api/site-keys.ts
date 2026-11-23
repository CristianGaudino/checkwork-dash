import "server-only";
import { logActivity } from "@/lib/admin/activity";
import { runAsDealerRow } from "@/lib/tenancy/current";
import { dealerById, makeSiteKey, revokeSiteKey, siteKeysOf } from "@/lib/tenancy/directory";
import { readCapped } from "@/lib/site-api/request";
import { ownerAuth } from "./auth";

// A dealer's website keys (the site API, docs/site-api.md), made and revoked by Checkwork with the owner token (#118): the dealer never sees
// them. A new key is in the one answer that makes it, never again (only its hash is kept); the log and history name the key's label only.
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const say = (status: number, error?: string) => (error ? Response.json({ error }, { status, headers: HEADERS }) : new Response(null, { status, headers: HEADERS }));

export async function ownerSiteKeys(req: Request, dealerId: string, keyId?: string): Promise<Response> {
  if (!ownerAuth(req).ok) return say(404);
  const dealer = await dealerById(dealerId);
  if (!dealer) return say(404, "No dealer with that id");
  const log = (outcome: string) => console.log(JSON.stringify({ job: "owner-site-keys", dealer: dealerId, method: req.method, outcome }));
  const said = (summary: string) => runAsDealerRow(dealer, () => logActivity("settings", summary, undefined, "Checkwork"));

  if (keyId) {
    if (req.method !== "DELETE") return say(405);
    const gone = await revokeSiteKey(dealerId, keyId); // another dealer's key is not found
    if (!gone) return say(404, "No key with that id still on");
    await said(`Revoked the website key: ${gone.label}`);
    log("revoked");
    return say(204);
  }
  if (req.method === "GET") return Response.json({ version: 1, keys: await siteKeysOf(dealerId) }, { headers: HEADERS });
  if (req.method !== "POST") return say(405);
  const text = await readCapped(req, 1_000);
  let body: unknown;
  try {
    body = text === null ? null : text ? JSON.parse(text) : {}; // null: over the cap
  } catch {
    body = null;
  }
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as { label?: unknown }).label ?? "Website" : null;
  const label = typeof raw === "string" ? raw.trim() : "";
  // One line of up to 60 characters, as the history shows it.
  if (!label || label.length > 60 || /[\u0000-\u001f\u007f]/.test(label)) {
    log("refused");
    return say(400, 'Send {"label": "..."}: one line, up to 60 characters (or no body, for "Website")');
  }
  const { key, siteKey } = await makeSiteKey(dealerId, label);
  await said(`Made a website key: ${label}`);
  log("made");
  return Response.json({ version: 1, key, ...siteKey }, { status: 201, headers: HEADERS });
}
