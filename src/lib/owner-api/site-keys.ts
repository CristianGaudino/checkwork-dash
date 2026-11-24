import "server-only";
import { logActivity } from "@/lib/admin/activity";
import { runAsDealerRow } from "@/lib/tenancy/current";
import { dealerById, makeSiteKey, revokeSiteKey, siteKeysOf } from "@/lib/tenancy/directory";
import { HEADERS, ownerAuth, readJson, say } from "./auth";

// A dealer's website keys (the site API, docs/site-api.md), made and revoked by Checkwork with the owner token (#118): the dealer never sees
// them. A new key is in the one answer that makes it, never again (only its hash is kept); the log and history name the key's label only.

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
  const sent = await readJson(req, 1_000); // null: over the cap or not JSON
  const body = sent === undefined ? {} : sent; // no body: "Website"
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
