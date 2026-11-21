// Standard Web Push with no third party: the message encrypted for one browser (RFC 8291, aes128gcm, RFC 8188) and signed for by our VAPID
// key (RFC 8292, an ES256 JWT). WebCrypto only, so it runs on Cloudflare Workers as it does in Node. Tested against RFC 8291's own example.

export type PushKeys = { p256dh: string; auth: string }; // as the browser gives them (PushSubscription.toJSON().keys), base64url
export type Vapid = { publicKey: string; privateKey: string; subject: string }; // base64url: the raw public point (65 bytes) and d (32 bytes)

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>; // what WebCrypto and fetch take (never a SharedArrayBuffer)
export const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export const unb64u = (s: string): Bytes => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const cat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const hkdf = async (salt: Bytes, ikm: Bytes, info: Bytes, bytes: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));

// A device's record id: a hash of its endpoint, so one device is one record whoever turns it on, and the browser can tell which is itself.
export async function pushId(endpoint: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(endpoint)));
  return "push-" + [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A P-256 key from its raw public point and, for a private key, d.
export function ecJwk(publicRaw: Uint8Array, d?: string): JsonWebKey {
  return { kty: "EC", crv: "P-256", x: b64u(publicRaw.slice(1, 33)), y: b64u(publicRaw.slice(33, 65)), ...(d && { d }) };
}

// The body to POST: one record, the payload and its 0x02 end mark, no padding. `fixed` is for the test vectors only (a known key pair and
// salt); otherwise both are new for every message, as the RFC requires.
export async function encrypt(payload: string, keys: PushKeys, fixed?: { pair: CryptoKeyPair; salt: Bytes }): Promise<Bytes> {
  const uaPublic = unb64u(keys.p256dh);
  const authSecret = unb64u(keys.auth);
  const pair = fixed?.pair ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const ua = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, pair.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096, big endian
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

// The VAPID token for one push service (its origin is the audience), good for 12 hours. WebCrypto's ECDSA signature is r||s, as JWS wants.
export async function vapidJwt(audience: string, v: Vapid, now = Date.now()): Promise<string> {
  const part = (o: object) => b64u(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })}`;
  const key = await crypto.subtle.importKey("jwk", ecJwk(unb64u(v.publicKey), v.privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return `${unsigned}.${b64u(sig)}`;
}

// Sends one message and returns the push service's status. Kept a day if the phone is off; high urgency, as a new lead is.
export async function sendPush(sub: { endpoint: string; keys: PushKeys }, payload: string, v: Vapid): Promise<number> {
  const jwt = await vapidJwt(new URL(sub.endpoint).origin, v);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { TTL: "86400", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: `vapid t=${jwt}, k=${v.publicKey}` },
    body: await encrypt(payload, sub.keys),
    signal: AbortSignal.timeout(5000), // a slow push service never holds the rest up; the caller logs it as failed
  });
  return res.status;
}
