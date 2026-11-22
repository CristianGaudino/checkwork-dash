import "server-only";
import { getBindings } from "@/lib/leads/bindings";
import { logSite, type SiteOutcome } from "@/lib/log";
import { runAsDealerRow } from "@/lib/tenancy/current";
import { dealerOfSiteKey } from "@/lib/tenancy/directory";

// The site API (/api/site/v1, docs/site-api.md): what a dealer's website sends and reads. The website key decides the dealer, and the route's
// work runs inside that dealer's store (runAsDealerRow), so nothing in a request can name or reach another dealer. Error answers carry no body.
export type Answer = { status: number; outcome: SiteOutcome; body?: unknown; headers?: Record<string, string> };

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
export const MAX_BODY = 64 * 1024;

export async function siteRequest(req: Request, route: "leads" | "stock" | "drives", run: () => Promise<Answer>): Promise<Response> {
  let dealerId: string | undefined;
  const answer = await (async (): Promise<Answer> => {
    const key = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
    const found = key ? await dealerOfSiteKey(key) : null;
    if (!found) return { status: 401, outcome: "no-key" };
    dealerId = found.dealer.id;
    // Per key, 60 a minute (wrangler.jsonc). No binding (next dev, the E2E run): no limit.
    const limiter = getBindings().SITE_LIMITER;
    if (limiter && !(await limiter.limit({ key: found.keyId })).success) return { status: 429, outcome: "rate" };
    return runAsDealerRow(found.dealer, run);
  })().catch((): Answer => ({ status: 500, outcome: "error" })); // nothing from the error: a query's message carries its values
  logSite({ route, dealerId, outcome: answer.outcome, status: answer.status });
  const headers = { ...HEADERS, ...answer.headers };
  return answer.body === undefined ? new Response(null, { status: answer.status, headers }) : Response.json(answer.body, { status: answer.status, headers });
}

// The body as text, or null when it is over `max` bytes: refused on a Content-Length that says so, and counted as it is read, so a body
// that lies about its length (or sends none) is cut off too.
export async function readCapped(req: Request, max = MAX_BODY): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return new TextDecoder().decode(await new Blob(parts as BlobPart[]).arrayBuffer());
}
