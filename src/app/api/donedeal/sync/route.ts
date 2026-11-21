import { runSync, syncRunsHere } from "@/lib/donedeal/sync";
import { dealerJob } from "@/lib/tenancy/jobs";

// The Worker's 15-minute cron (worker.mjs) runs each dealer's DoneDeal sync through here, with CRON_KEY and the dealer's id. Without the
// key set, or for a dealer whose stock is not from DoneDeal, it is not there. The answer is counts only, never a car or a person.
export const POST = (req: Request) =>
  dealerJob(req, async () => {
    if (!syncRunsHere()) return null;
    const s = await runSync();
    return { ok: !s.problem, result: s.result ?? null, held: Boolean(s.held) };
  });
