import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { b64u } from "@/lib/push/webpush";

// A software authenticator for src/lib/auth/webauthn.test.ts, made with node:crypto: real keys and signatures for EdDSA, ES256 and RS256,
// and every part built by hand so a test can break exactly one thing.

type Bytes = Uint8Array<ArrayBuffer>;
export type Cborable = number | string | boolean | null | Uint8Array | Cborable[] | Map<number | string, Cborable>;

// A small CBOR writer (definite lengths, at most 4-byte arguments): the reader's counterpart for building test input.
export function cbor(v: Cborable): Bytes {
  const head = (major: number, n: number) => {
    const m = major << 5;
    if (n < 24) return [m | n];
    if (n < 0x100) return [m | 24, n];
    if (n < 0x10000) return [m | 25, n >> 8, n & 255];
    return [m | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const out: number[] = [];
  const put = (x: Cborable) => {
    if (x === false || x === true || x === null) out.push(x === null ? 0xf6 : x ? 0xf5 : 0xf4);
    else if (typeof x === "number") out.push(...(x >= 0 ? head(0, x) : head(1, -1 - x)));
    else if (typeof x === "string") {
      const b = new TextEncoder().encode(x);
      out.push(...head(3, b.length), ...b);
    } else if (x instanceof Uint8Array) out.push(...head(2, x.length), ...x);
    else if (Array.isArray(x)) {
      out.push(...head(4, x.length));
      x.forEach(put);
    } else {
      out.push(...head(5, x.size));
      for (const [k, val] of x) {
        put(k);
        put(val);
      }
    }
  };
  put(v);
  return new Uint8Array(out);
}

export const cat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
};
const sha256 = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest());
const fromJwk = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export type Kind = "EdDSA" | "ES256" | "RS256";
export const ALG = { EdDSA: -8, ES256: -7, RS256: -257 } as const;

export type Authenticator = { kind: Kind; alg: number; cose: Map<number, Cborable>; id: Bytes; sign: (data: Uint8Array) => Bytes };

export function authenticator(kind: Kind, { rsaBits = 2048 } = {}): Authenticator {
  const pair =
    kind === "EdDSA" ? generateKeyPairSync("ed25519") : kind === "ES256" ? generateKeyPairSync("ec", { namedCurve: "P-256" }) : generateKeyPairSync("rsa", { modulusLength: rsaBits });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const cose: Map<number, Cborable> =
    kind === "EdDSA"
      ? new Map<number, Cborable>([[1, 1], [3, -8], [-1, 6], [-2, fromJwk(jwk.x!)]])
      : kind === "ES256"
        ? new Map<number, Cborable>([[1, 2], [3, -7], [-1, 1], [-2, fromJwk(jwk.x!)], [-3, fromJwk(jwk.y!)]])
        : new Map<number, Cborable>([[1, 3], [3, -257], [-1, fromJwk(jwk.n!)], [-2, fromJwk(jwk.e!)]]);
  const key: KeyObject = pair.privateKey;
  // ES256 signs as DER, as WebAuthn sends it; Ed25519 takes no hash; RS256 is PKCS#1 v1.5 with SHA-256.
  return { kind, alg: ALG[kind], cose, id: new Uint8Array(randomBytes(32)), sign: (data) => new Uint8Array(sign(kind === "EdDSA" ? null : "sha256", data, key)) };
}

export const FLAGS = { UP: 1, UV: 4, BE: 8, BS: 16, AT: 64, ED: 128 };
export const RP = { rpId: "dash.checkwork.ie", origin: "https://www.dash.checkwork.ie" };
export const newChallenge = () => b64u(randomBytes(32));
export const userHandle = () => new Uint8Array(randomBytes(32));

export function clientDataJSON(type: string, challenge: string, more: Record<string, unknown> = {}, origin = RP.origin): Bytes {
  return new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...more }));
}

// rpIdHash, flags, count; then, given a key, the attested credential data; then any extensions or extra bytes as given.
export function authData(o: { rpId?: string; flags: number; signCount?: number; cred?: { id: Uint8Array; cose: Uint8Array }; after?: Uint8Array }): Bytes {
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, o.signCount ?? 0);
  const attested = o.cred ? cat(new Uint8Array(16), new Uint8Array([o.cred.id.length >> 8, o.cred.id.length & 255]), o.cred.id, o.cred.cose) : new Uint8Array();
  return cat(sha256(new TextEncoder().encode(o.rpId ?? RP.rpId)), new Uint8Array([o.flags]), count, attested, o.after ?? new Uint8Array());
}

export const REGISTRATION_FLAGS = FLAGS.UP | FLAGS.UV | FLAGS.AT | FLAGS.BE | FLAGS.BS;
export const SIGN_IN_FLAGS = FLAGS.UP | FLAGS.UV | FLAGS.BE | FLAGS.BS;

// A registration response. `fmt` none, or packed self attestation signed by the new key; `stmt` replaces the statement outright.
export function registration(
  a: Authenticator,
  challenge: string,
  o: { fmt?: "none" | "packed"; stmt?: Map<string, Cborable>; flags?: number; data?: Bytes; clientData?: Bytes; cose?: Uint8Array } = {},
) {
  const clientData = o.clientData ?? clientDataJSON("webauthn.create", challenge);
  const data = o.data ?? authData({ flags: o.flags ?? REGISTRATION_FLAGS, cred: { id: a.id, cose: o.cose ?? cbor(a.cose) } });
  const stmt = o.stmt ?? (o.fmt === "packed" ? new Map<string, Cborable>([["alg", a.alg], ["sig", a.sign(cat(data, sha256(clientData)))]]) : new Map());
  return { clientDataJSON: clientData, attestationObject: cbor(new Map<string, Cborable>([["fmt", o.fmt ?? "none"], ["attStmt", stmt], ["authData", data]])) };
}

// A sign-in response for the authenticator's credential.
export function assertion(a: Authenticator, challenge: string, handle: Uint8Array | null, o: { flags?: number; signCount?: number; data?: Bytes; clientData?: Bytes } = {}) {
  const clientData = o.clientData ?? clientDataJSON("webauthn.get", challenge);
  const data = o.data ?? authData({ flags: o.flags ?? SIGN_IN_FLAGS, signCount: o.signCount ?? 0 });
  return { credentialId: b64u(a.id), clientDataJSON: clientData, authenticatorData: data, signature: a.sign(cat(data, sha256(clientData))), userHandle: handle && new Uint8Array(handle) };
}
