import "server-only";
import { logActivity } from "@/lib/admin/activity";
import { alertsStore, subscribersStore } from "@/lib/admin/collections";
import { getBindings } from "@/lib/leads/bindings";
import { runAsDealerRow } from "@/lib/tenancy/current";
import { dealerById } from "@/lib/tenancy/directory";
import { verifyUnsub, type UnsubKind } from "@/lib/unsubscribe";

// The public unsubscribe (#70): /api/site/unsubscribe, no sign-in. Under /api/ the proxy never runs, and /api/site/ is the path Cloudflare Access
// leaves open, so the signed link is the only check. GET shows a button and changes nothing (a mail scanner opens links); POST, from the button
// or a mail provider's RFC 8058 one-click, does it. Anything wrong with the link is the same plain page, with no word on why.
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (status: number, title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title>` +
      `<style>body{font:18px/1.5 system-ui,sans-serif;max-width:30rem;margin:12vh auto;padding:0 1rem;color:#111;background:#fff}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}}button{font:inherit;padding:.7rem 1.4rem;border-radius:.5rem;border:0;background:#111;color:#fff;cursor:pointer}@media(prefers-color-scheme:dark){button{background:#eee;color:#111}}</style></head>` +
      `<body><h1>${escape(title)}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" } },
  );
export const invalid = () => page(404, "This link isn't valid any more", "");

type Found = { dealerName: string; run: <T>(fn: () => Promise<T>) => Promise<T>; kind: UnsubKind; id: string; dealerId: string };
async function open(url: URL): Promise<Found | null> {
  const [d, k, id, sig] = ["d", "k", "id", "sig"].map((n) => url.searchParams.get(n) ?? "");
  if (!(await verifyUnsub(process.env.UNSUBSCRIBE_SECRET, d, k, id, sig))) return null;
  const dealer = await dealerById(d);
  if (!dealer) return null;
  return { dealerName: dealer.name, dealerId: d, kind: k as UnsubKind, id, run: (fn) => runAsDealerRow(dealer, fn) };
}
const exists = (f: Found): Promise<unknown> => (f.kind === "newsletter" ? subscribersStore.get(f.id) : alertsStore.get(f.id));

// 60 a minute per visitor address, SITE_LIMITER's own limit (its keys here start "unsub:", so never meet a website key's count). No binding (next dev, the E2E run): no limit.
async function limited(req: Request) {
  const limiter = getBindings().SITE_LIMITER;
  return Boolean(limiter) && !(await limiter!.limit({ key: `unsub:${req.headers.get("cf-connecting-ip") ?? "unknown"}` })).success;
}

export async function showUnsubscribe(req: Request): Promise<Response> {
  if (await limited(req)) return page(429, "Please try again in a minute", "");
  const f = await open(new URL(req.url)).catch(() => null);
  if (!f || !(await f.run(() => exists(f)).catch(() => null))) return invalid();
  const what = f.kind === "alert" ? "stock alerts" : "emails";
  return page(200, `Stop these ${what}?`, `<p>You will not get any more ${what} from ${escape(f.dealerName)}.</p><form method="post"><button type="submit">Stop these ${what}</button></form>`);
}

export async function doUnsubscribe(req: Request): Promise<Response> {
  if (await limited(req)) return page(429, "Please try again in a minute", "");
  const f = await open(new URL(req.url)).catch(() => null);
  if (!f) return invalid();
  try {
    const done = await f.run(async () => {
      if (f.kind === "newsletter") {
        const s = await subscribersStore.get(f.id);
        if (!s) return false;
        if (s.status === "subscribed") {
          await subscribersStore.put({ ...s, status: "unsubscribed" });
          await logActivity("customers", "Unsubscribed from the newsletter", { kind: "subscriber", id: f.id }, "The subscriber");
        }
      } else {
        const a = await alertsStore.get(f.id);
        if (!a) return false;
        if (a.active) {
          await alertsStore.put({ ...a, active: false });
          await logActivity("customers", "Paused the stock alert", { kind: "alert", id: f.id }, "The subscriber");
        }
      }
      return true;
    });
    if (!done) return invalid();
  } catch {
    console.error(JSON.stringify({ unsubscribe: "error" })); // nothing from the error or the link
    return page(500, "Something went wrong", "<p>Please try the link again in a minute.</p>");
  }
  return page(200, "You won't get these emails again", "");
}
