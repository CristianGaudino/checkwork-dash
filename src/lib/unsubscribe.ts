import { appUrl } from "./site";

// Signed unsubscribe links for stock alerts (#70). No server-only and no "@/" imports: the E2E run builds a link with it too.
// A link names the dealer (so the right store opens), the kind and the record, and carries an HMAC-SHA256 of those three with
// UNSUBSCRIBE_SECRET. It holds no email address. Anyone with the link can stop that one alert, nothing more. Every stock alert email
// carries it in the body and the List-Unsubscribe headers (unsubscribeParts); never send one without them.
export type UnsubKind = "alert"; // the newsletter's kind went with it (#149): its old links are no longer valid
export const UNSUB_PATH = "/api/site/unsubscribe";
export const ONE_CLICK = "List-Unsubscribe=One-Click"; // RFC 8058 section 3.1: the body of the mail provider's POST

const ID = /^[A-Za-z0-9_-]{1,64}$/; // also keeps "\n" out of what is signed, so two different triples never sign the same bytes
export const validParts = (d: string, k: string, id: string) => ID.test(d) && k === "alert" && ID.test(id);

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
  const raw = Buffer.from(sig, "base64url");
  if (raw.toString("base64url") !== sig) return false; // spare-bit variants of a good signature are not accepted
  return crypto.subtle.verify("HMAC", await key(secret, "verify"), raw, data(d, k, id));
}

// The link for one alert, on this app (APP_URL). Throws with no secret: an email must never go out without a working link.
export async function unsubscribeLink(dealerId: string, kind: UnsubKind, id: string, base = appUrl()): Promise<string> {
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
  if (!link.startsWith("https://")) throw new Error("an unsubscribe link in an email must be https"); // RFC 8058
  return { link, headers: listUnsubscribeHeaders(link) };
}
