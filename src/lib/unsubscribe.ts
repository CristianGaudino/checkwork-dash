// Signed unsubscribe links for newsletters and stock alerts (#70). No server-only and no "@/" imports: the E2E run builds a link with it too.
// A link names the dealer (so the right store opens), the kind and the record, and carries an HMAC-SHA256 of those three with
// UNSUBSCRIBE_SECRET. It holds no email address. Anyone with the link can stop that one subscription, nothing more.
export type UnsubKind = "newsletter" | "alert";
export const UNSUB_PATH = "/api/site/unsubscribe";
export const ONE_CLICK = "List-Unsubscribe=One-Click"; // RFC 8058 section 3.1: the body of the mail provider's POST

const ID = /^[A-Za-z0-9_-]{1,64}$/; // also keeps "\n" out of what is signed, so two different triples never sign the same bytes
export const validParts = (d: string, k: string, id: string) => ID.test(d) && (k === "newsletter" || k === "alert") && ID.test(id);

const enc = new TextEncoder();
const key = (secret: string, usage: "sign" | "verify") => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
const data = (d: string, k: string, id: string) => enc.encode(`unsubscribe\n${d}\n${k}\n${id}`);
const b64 = (b: ArrayBuffer) => Buffer.from(b).toString("base64url");

export async function signUnsub(secret: string, d: string, k: UnsubKind, id: string): Promise<string> {
  return b64(await crypto.subtle.sign("HMAC", await key(secret, "sign"), data(d, k, id)));
}

// subtle.verify compares in constant time. A signature that is not base64url of 32 bytes, or any part that is not well formed, is just false.
export async function verifyUnsub(secret: string | undefined, d: string, k: string, id: string, sig: string): Promise<boolean> {
  if (!secret || !validParts(d, k, id) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return false;
  return crypto.subtle.verify("HMAC", await key(secret, "verify"), Buffer.from(sig, "base64url"), data(d, k, id));
}

// The link for one subscriber or alert, on this app (APP_URL). Throws with no secret: an email must never go out without a working link.
export async function unsubscribeLink(dealerId: string, kind: UnsubKind, id: string, base = process.env.APP_URL || "https://www.dash.checkwork.ie"): Promise<string> {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET is not set");
  if (!validParts(dealerId, kind, id)) throw new Error("not a valid unsubscribe record");
  const q = new URLSearchParams({ d: dealerId, k: kind, id, sig: await signUnsub(secret, dealerId, kind, id) });
  return `${new URL(UNSUB_PATH, base)}?${q}`;
}

// RFC 8058: both headers together, an https link in angle brackets (a mail provider POSTs ONE_CLICK to it).
export const listUnsubscribeHeaders = (link: string) => ({ "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": ONE_CLICK });

// What a sender adds to one email: the link for the body and the headers.
export async function unsubscribeParts(dealerId: string, kind: UnsubKind, id: string) {
  const link = await unsubscribeLink(dealerId, kind, id);
  return { link, headers: listUnsubscribeHeaders(link) };
}
