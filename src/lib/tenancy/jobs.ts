import { cronAuthorized } from "@/lib/cron";
import { runAsDealer } from "./current";
import { dealerById, type Dealer } from "./directory";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const none = () => new Response(null, { status: 404, headers: HEADERS });

// A scheduled job's route (worker.mjs calls it once per active dealer, ?dealer=<id>, with CRON_KEY). The dealer id is taken from the request
// only behind the key, so only the Worker can name one, and the job runs inside that dealer's store. A 404 means "not here": no key, no
// such active dealer, or `run` says the job does not apply to this dealer.
export async function dealerJob(req: Request, run: (dealer: Dealer) => Promise<unknown | null>): Promise<Response> {
  if (!cronAuthorized(req)) return none();
  const dealer = await dealerById(new URL(req.url).searchParams.get("dealer") ?? "");
  if (!dealer || dealer.status !== "active") return none();
  const body = await runAsDealer(dealer.id, () => run(dealer));
  return body === null ? none() : Response.json(body, { headers: HEADERS });
}
