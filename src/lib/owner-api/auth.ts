import { same } from "@/lib/cron";
import { readCapped } from "@/lib/site-api/request";

// The owner's program reads every site with one bearer token, the Worker secret OWNER_API_TOKEN (compared in constant time). No token set,
// no token sent or a wrong one all give the same answer: nothing is there. Money (sale values) is included only on a site whose
// contract allows it, the second secret OWNER_API_MONEY=1.
export function ownerAuth(req: Request): { ok: false } | { ok: true; money: boolean } {
  const token = process.env.OWNER_API_TOKEN;
  if (!token || !same(req.headers.get("authorization") ?? "", `Bearer ${token}`)) return { ok: false };
  return { ok: true, money: process.env.OWNER_API_MONEY === "1" };
}

// What every owner route that writes answers with: never cached or indexed, an error as {"error"}, otherwise no body.
export const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
export const say = (status: number, error?: string) => (error ? Response.json({ error }, { status, headers: HEADERS }) : new Response(null, { status, headers: HEADERS }));
// The body as JSON, read up to `cap` bytes: null when over the cap or not JSON, undefined when there is none.
export async function readJson(req: Request, cap: number): Promise<unknown> {
  const text = await readCapped(req, cap);
  if (text === "") return undefined;
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}
