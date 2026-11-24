import "server-only";
import { logActivity } from "@/lib/admin/activity";
import { removeSecrets, saveSecrets, savedNamesNow, secretsKeyReady } from "@/lib/dealer-secrets";
import { INTEGRATIONS, integrationText } from "@/lib/integrations";
import { removeSyncedCars } from "@/lib/donedeal/sync";
import { listing } from "@/lib/stock-source";
import { runAsDealerRow } from "@/lib/tenancy/current";
import { dealerById } from "@/lib/tenancy/directory";
import { HEADERS, ownerAuth, readJson, say } from "./auth";

// Checkwork, not the dealer, sets a dealer's outside-service keys (#80), with the owner token. A value is sealed on the Worker and never
// comes back: no answer carries one, and the log names the dealer, service and outcome only.
const MAX_BODY = 16_000;
const perDealer = INTEGRATIONS.filter((i) => i.perDealer);

export async function ownerKeys(req: Request, dealerId: string, service?: string): Promise<Response> {
  if (!ownerAuth(req).ok) return say(404);
  const dealer = await dealerById(dealerId);
  if (!dealer) return say(404, "No dealer with that id");
  const log = (outcome: string) => console.log(JSON.stringify({ job: "owner-keys", dealer: dealerId, service: service ?? "all", method: req.method, outcome }));
  if (dealer.demo) return say(400, "The demo never needs keys");

  if (!service) {
    const saved = await runAsDealerRow(dealer, savedNamesNow);
    return Response.json({ version: 1, services: perDealer.map((i) => ({ id: i.id, connected: Object.keys(i.perDealer!).every((n) => saved.has(n)), names: Object.keys(i.perDealer!) })) }, { headers: HEADERS });
  }
  const def = perDealer.find((i) => i.id === service);
  if (!def) return say(404, "No such service");
  const names = Object.keys(def.perDealer!);
  const said = (what: string) => runAsDealerRow(dealer, async () => logActivity("settings", `${what} ${integrationText(def, { name: dealer.name, site: (await listing()).site }).name}`, undefined, "Checkwork"));

  if (req.method === "DELETE") {
    await runAsDealerRow(dealer, () => removeSecrets(names));
    await said("Removed the keys for");
    // The listing site's key goes when a dealer leaves or withdraws consent: its cars go with it (#158, docs/new-dealer.md).
    const cars = service === "donedeal" ? await runAsDealerRow(dealer, async () => removeSyncedCars(`the ${(await listing()).site} key was removed`, "Checkwork")) : 0;
    log(cars ? `removed, and ${cars} synced cars` : "removed");
    return say(204);
  }
  if (!secretsKeyReady()) { log("no sealing key"); return say(503, "Keys cannot be saved yet: DEALER_SECRETS_KEY is not set on this app"); }
  const o = (await readJson(req, MAX_BODY)) as Record<string, unknown> | null;
  const bad = !o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).sort().join() !== [...names].sort().join() || Object.values(o).some((v) => typeof v !== "string" || !v.trim() || v.trim().length > 4000);
  if (bad) {
    log("refused");
    return say(400, `Send a JSON object with exactly these names, each a non-empty string up to 4000 characters: ${names.join(", ")}`);
  }
  const had = await runAsDealerRow(dealer, async () => {
    const saved = await savedNamesNow();
    await saveSecrets(Object.fromEntries(names.map((n) => [n, (o[n] as string).trim()])));
    return names.every((n) => saved.has(n));
  });
  await said(had ? "Replaced" : "Connected");
  log("saved");
  return say(204);
}
