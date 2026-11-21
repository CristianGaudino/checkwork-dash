import { describe, expect, it } from "vitest";
import { b64u, ecJwk, encrypt, unb64u, vapidJwt } from "./webpush";

// RFC 8291, section 5 (the example) and appendix A.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("Web Push encryption (RFC 8291, aes128gcm)", () => {
  it("gives the RFC's own message body for its keys and salt", async () => {
    const pub = unb64u(RFC.asPublic);
    const pair = {
      publicKey: await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []),
      privateKey: await crypto.subtle.importKey("jwk", ecJwk(pub, RFC.asPrivate), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]),
    };
    const body = await encrypt(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, { pair, salt: unb64u(RFC.salt) });
    expect(b64u(body)).toBe(RFC.body);
  });

  it("uses a new key and salt for every message otherwise", async () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const [a, b] = [await encrypt("x", keys), await encrypt("x", keys)];
    expect(b64u(a.slice(0, 16))).not.toBe(b64u(b.slice(0, 16)));
    expect(a.length).toBe(86 + 1 + 1 + 16); // header, the byte, the end mark, the tag
  });
});

describe("the VAPID token (RFC 8292, ES256)", () => {
  it("is a JWT for the push service's origin that verifies with our public key", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
    const now = Date.UTC(2026, 10, 21);
    const jwt = await vapidJwt("https://fcm.googleapis.com", { publicKey, privateKey, subject: "mailto:contact@checkwork.ie" }, now);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(unb64u(h)))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(new TextDecoder().decode(unb64u(c)))).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:contact@checkwork.ie" });
    expect(unb64u(s).length).toBe(64);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, unb64u(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});
