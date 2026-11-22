import { eq, lt, type SQL } from "drizzle-orm";
import { passkeys } from "../db/directory-schema";
import { b64u } from "../push/webpush";
import { CborError, decodeCbor, decodeCborAll, type CborMap } from "./cbor";

// Our WebAuthn verifier (docs/sign-in.md, section 2): every check of "Registering a New Credential" and "Verifying an Authentication
// Assertion" that the design lists, with WebCrypto doing the cryptography (EdDSA, ES256, RS256) and only parsing and comparing here. Pure
// over bytes: what needs the directory (a challenge marked used, a credential looked up, the counter written) comes in as functions, so
// each check runs in the design's order and none can be left out by a caller. A refusal is one of the log's fixed outcome codes, never a
// detail of the input. Relative imports only, like the rest of src/lib/auth.

type Bytes = Uint8Array<ArrayBuffer>;
export type Alg = -8 | -7 | -257; // EdDSA, ES256, RS256
export const ALGS: readonly Alg[] = [-8, -7, -257]; // the order pubKeyCredParams offers them
export type Refusal = "bad-data" | "bad-origin" | "bad-signature" | "expired" | "counter" | "unknown-credential" | "no-dealer";
export type Refused = { ok: false; code: Refusal };

// What the environment says (wrangler.jsonc), never the request.
export type RelyingParty = { rpId: string; origin: string };

export const MAX_INPUT = 16 * 1024; // any one part a browser sends; the largest real one (an RSA-4096 key in the attestation) is under 2 kB
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, as we issue them
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{22,1364}$/; // 16 to 1023 bytes, base64url
const UP = 1, UV = 4, BE = 8, BS = 16, AT = 64, ED = 128;

class Refusing {
  constructor(readonly code: Refusal) {}
}
const refuse = (code: Refusal = "bad-data"): never => {
  throw new Refusing(code);
};
// A refusal, or unreadable CBOR, becomes the answer; anything else (the directory failing) is the caller's to handle.
async function answer<T>(steps: () => Promise<T>): Promise<T | Refused> {
  try {
    return await steps();
  } catch (e) {
    if (e instanceof Refusing) return { ok: false, code: e.code };
    if (e instanceof CborError) return { ok: false, code: "bad-data" };
    throw e;
  }
}

const enc = new TextEncoder();
const utf8 = new TextDecoder("utf-8", { fatal: true });
const sha256 = async (b: Uint8Array<ArrayBuffer>) => new Uint8Array(await crypto.subtle.digest("SHA-256", b));
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]); // public values only
const sized = (...parts: Uint8Array[]) => parts.every((p) => p instanceof Uint8Array && p.length <= MAX_INPUT) || refuse();

// ---- The binary parts ----

// ES256 signatures come as ASN.1 DER, SEQUENCE { INTEGER r, INTEGER s }; WebCrypto wants r and s as 32 bytes each. Strict: short-form
// lengths (the longest valid signature is 72 bytes), r and s positive, a leading 0x00 only where the next byte needs it, at most 32 bytes
// once that is dropped (shorter ones padded), nothing left over.
export function derToRaw(der: Uint8Array): Bytes {
  if (der.length < 8 || der.length > 72 || der[0] !== 0x30 || der[1] !== der.length - 2) refuse();
  const raw = new Uint8Array(64);
  let at = 2;
  for (const half of [0, 32]) {
    const len = der[at + 1];
    if (der[at] !== 0x02 || len < 1 || len > 33 || at + 2 + len > der.length) refuse();
    let v = der.subarray(at + 2, at + 2 + len);
    if (v[0] & 0x80) refuse(); // negative
    if (v[0] === 0) {
      if (len === 1 || !(v[1] & 0x80)) refuse(); // zero, or a leading 0x00 the next byte does not need
      v = v.subarray(1);
    }
    if (v.length > 32) refuse();
    raw.set(v, half + 32 - v.length);
    at += 2 + len;
  }
  if (at !== der.length) refuse();
  return raw;
}

export type AuthData = {
  rpIdHash: Bytes;
  flags: number;
  signCount: number;
  credential?: { id: Bytes; publicKey: Bytes; key: CborMap }; // at registration: the id, the COSE key's own bytes, and the key read
};

// 37 bytes (rpIdHash, flags, count); at registration (AT set) the AAGUID, the credential id and the key as one CBOR item; if ED is set,
// the extensions as one CBOR map; then nothing. AT must be set at registration and clear at sign-in.
export function parseAuthData(raw: Uint8Array, registration: boolean): AuthData {
  if (raw.length < 37) refuse();
  const flags = raw[32];
  if (registration !== Boolean(flags & AT)) refuse();
  let at = 37;
  let credential: AuthData["credential"];
  if (registration) {
    if (raw.length < at + 18) refuse();
    const len = (raw[at + 16] << 8) | raw[at + 17]; // after the 16-byte AAGUID
    at += 18;
    if (len < 16 || len > 1023 || len > raw.length - at) refuse();
    const id = raw.slice(at, (at += len));
    const { value, end } = decodeCbor(raw, at);
    if (!(value instanceof Map)) refuse();
    credential = { id, publicKey: raw.slice(at, end), key: value as CborMap };
    at = end;
  }
  if (flags & ED) {
    const { value, end } = decodeCbor(raw, at); // ED set with nothing after it fails here
    if (!(value instanceof Map)) refuse();
    at = end;
  }
  if (at !== raw.length) refuse(); // bytes after the key with ED clear, or after the extensions
  return { rpIdHash: raw.slice(0, 32), flags, signCount: new DataView(raw.buffer, raw.byteOffset).getUint32(33), credential };
}

// A COSE key (RFC 9052, 9053) as a WebCrypto key, only for the three algorithms we offer, with registration step 8's checks. importKey
// then refuses a point that is not on the curve.
export async function importCoseKey(cose: CborMap): Promise<{ alg: Alg; key: CryptoKey }> {
  const bytes = (label: number, length?: number) => {
    const v = cose.get(label);
    return v instanceof Uint8Array && (length === undefined || v.length === length) ? v : refuse();
  };
  const unsigned = (v: Uint8Array) => v.subarray(v.findIndex((b) => b !== 0) >>> 0); // no leading zeros (JWK's base64urlUInt)
  const [alg, kty, crv] = [cose.get(3), cose.get(1), cose.get(-1)];
  let jwk: JsonWebKey;
  let params: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams;
  if (alg === -8 && kty === 1 && crv === 6) {
    jwk = { kty: "OKP", crv: "Ed25519", x: b64u(bytes(-2, 32)) };
    params = { name: "Ed25519" };
  } else if (alg === -7 && kty === 2 && crv === 1) {
    jwk = { kty: "EC", crv: "P-256", x: b64u(bytes(-2, 32)), y: b64u(bytes(-3, 32)) };
    params = { name: "ECDSA", namedCurve: "P-256" };
  } else if (alg === -257 && kty === 3) {
    const [n, e] = [unsigned(bytes(-1)), unsigned(bytes(-2))];
    if (n.length < 256 || (n.length === 256 && n[0] < 0x80) || e.length === 0) refuse(); // the modulus at least 2048 bits
    jwk = { kty: "RSA", n: b64u(n), e: b64u(e) };
    params = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  } else return refuse();
  try {
    return { alg, key: await crypto.subtle.importKey("jwk", jwk, params, false, ["verify"]) };
  } catch {
    return refuse();
  }
}

async function verifies(alg: Alg, key: CryptoKey, sig: Uint8Array<ArrayBuffer>, data: Bytes): Promise<boolean> {
  try {
    if (alg === -7) return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(sig), data);
    if (alg === -8) return sig.length === 64 && (await crypto.subtle.verify("Ed25519", key, sig, data));
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  } catch {
    return false; // a malformed signature is a bad one
  }
}

// What every ceremony signs: authenticatorData followed by SHA-256 of the raw clientDataJSON bytes.
const signed = async (authData: Uint8Array, clientDataJSON: Uint8Array<ArrayBuffer>): Promise<Bytes> => {
  const out = new Uint8Array(authData.length + 32);
  out.set(authData);
  out.set(await sha256(clientDataJSON), authData.length);
  return out;
};

// clientDataJSON: its type, our origin exactly, crossOrigin absent or false, topOrigin absent; returns the challenge for the caller to
// spend.
function clientData(raw: Uint8Array, type: "webauthn.create" | "webauthn.get", origin: string): string {
  let c: unknown;
  try {
    c = JSON.parse(utf8.decode(raw));
  } catch {
    refuse();
  }
  if (typeof c !== "object" || c === null || Array.isArray(c)) return refuse();
  const { type: t, challenge, origin: o, crossOrigin, topOrigin } = c as Record<string, unknown>;
  if (t !== type) refuse();
  if (o !== origin || (crossOrigin !== undefined && crossOrigin !== false) || topOrigin !== undefined) refuse("bad-origin");
  return typeof challenge === "string" && CHALLENGE.test(challenge) ? challenge : refuse();
}

// rpIdHash ours; UP and UV set; if BE is clear, BS is clear.
async function checkAuthData(a: AuthData, rpId: string) {
  if (!equal(a.rpIdHash, await sha256(enc.encode(rpId)))) refuse();
  if (!(a.flags & UP) || !(a.flags & UV) || (!(a.flags & BE) && a.flags & BS)) refuse();
}

// ---- Registration (adding a passkey) ----

export type Registration = { clientDataJSON: Bytes; attestationObject: Bytes };
export type NewPasskey = { id: string; publicKey: Bytes; alg: Alg; signCount: number; backupEligible: boolean; backedUp: boolean };

export async function verifyRegistration(
  res: Registration,
  rp: RelyingParty & {
    useChallenge: (challenge: string) => Promise<boolean>; // this person's registration challenge, if unused and unexpired, marked used
    isTaken: (credentialId: string) => Promise<boolean>; // registered to anyone already
  },
): Promise<{ ok: true; passkey: NewPasskey } | Refused> {
  return answer(async () => {
    sized(res.clientDataJSON, res.attestationObject);
    // 1 to 3: clientDataJSON, the challenge spent in the same statement that finds it, the origin.
    const challenge = clientData(res.clientDataJSON, "webauthn.create", rp.origin);
    if (!(await rp.useChallenge(challenge))) refuse("expired");
    // 4: the attestation object, nothing left over.
    const att = decodeCborAll(res.attestationObject);
    if (!(att instanceof Map)) return refuse();
    const [fmt, stmt, authData] = [att.get("fmt"), att.get("attStmt"), att.get("authData")];
    if (!(stmt instanceof Map) || !(authData instanceof Uint8Array)) return refuse();
    // 5 and 6: authenticator data, rpIdHash, flags (AT is required by parseAuthData).
    const a = parseAuthData(authData, true);
    await checkAuthData(a, rp.rpId);
    const cred = a.credential!;
    // 8: one of our three algorithms, its parts matching.
    const { alg, key } = await importCoseKey(cred.key);
    // 4, the statement: `none` with nothing in it, or `packed` self attestation (no x5c, our alg, signed by the new key itself).
    if (fmt === "packed") {
      const sig = stmt.get("sig");
      if (stmt.size !== 2 || stmt.get("alg") !== alg || !(sig instanceof Uint8Array)) refuse();
      if (!(await verifies(alg, key, sig as Bytes, await signed(authData, res.clientDataJSON)))) refuse("bad-signature");
    } else if (fmt !== "none" || stmt.size !== 0) refuse();
    // 7: at most 1023 bytes (parseAuthData), and nobody's yet.
    const id = b64u(cred.id);
    if (await rp.isTaken(id)) refuse();
    return {
      ok: true as const,
      passkey: { id, publicKey: cred.publicKey, alg, signCount: a.signCount, backupEligible: Boolean(a.flags & BE), backedUp: Boolean(a.flags & BS) },
    };
  });
}

// ---- Authentication (signing in), and "Confirm it's you" ----

export type Assertion = { credentialId: string; clientDataJSON: Bytes; authenticatorData: Bytes; signature: Bytes; userHandle: Bytes | null };
export type StoredPasskey = { id: string; staffId: string; publicKey: Uint8Array; alg: number; signCount: number; backupEligible: boolean };

export async function verifyAssertion(
  res: Assertion,
  rp: RelyingParty & {
    confirming?: string; // the session's staff id in "Confirm it's you"; absent in a sign-in, where no one is identified beforehand
    findPasskey: (id: string) => Promise<{ passkey: StoredPasskey; atActiveDealer: boolean } | null>;
    useChallenge: (challenge: string) => Promise<boolean>; // this kind of request's challenge (sign-in, or this session's confirmation)
    advanceCounter: (id: string, signCount: number, backedUp: boolean) => Promise<boolean>; // counterWhere's statement: false when refused
  },
): Promise<{ ok: true; staffId: string; credentialId: string; signCount: number; backedUp: boolean } | Refused> {
  return answer(async () => {
    sized(res.clientDataJSON, res.authenticatorData, res.signature, ...(res.userHandle ? [res.userHandle] : []));
    if (!CREDENTIAL_ID.test(res.credentialId)) refuse(); // only a lookup that finds no row is unknown-credential (the signal call)
    // 1: a passkey we hold, of someone at an active dealer. A sign-in needs the user handle, and it must be theirs (the staff id is the
    // user handle, base64url); a confirmation needs the session's own person, and a user handle, if sent, theirs.
    const found = await rp.findPasskey(res.credentialId);
    if (!found) return refuse("unknown-credential");
    const { passkey } = found;
    if (!found.atActiveDealer) refuse("no-dealer");
    const handle = res.userHandle && b64u(res.userHandle);
    if (rp.confirming === undefined ? handle !== passkey.staffId : passkey.staffId !== rp.confirming || (handle !== null && handle !== passkey.staffId)) refuse();
    // 2: clientDataJSON, origin, and the challenge spent.
    const challenge = clientData(res.clientDataJSON, "webauthn.get", rp.origin);
    if (!(await rp.useChallenge(challenge))) refuse("expired");
    // 3: authenticator data (AT clear), rpIdHash, UP and UV, BE as stored at registration, BS only with BE.
    const a = parseAuthData(res.authenticatorData, false);
    await checkAuthData(a, rp.rpId);
    if (Boolean(a.flags & BE) !== passkey.backupEligible) refuse();
    // 4: the signature, with the stored key (whose algorithm must be the stored one).
    const cose = decodeCborAll(passkey.publicKey);
    if (!(cose instanceof Map)) return refuse();
    const { alg, key } = await importCoseKey(cose);
    if (alg !== passkey.alg) refuse();
    if (!(await verifies(alg, key, res.signature, await signed(res.authenticatorData, res.clientDataJSON)))) refuse("bad-signature");
    // 5 and 6: the counter, checked and written (with BS and last used) in one statement.
    const backedUp = Boolean(a.flags & BS);
    if (!(await rp.advanceCounter(passkey.id, a.signCount, backedUp))) refuse("counter");
    return { ok: true as const, staffId: passkey.staffId, credentialId: passkey.id, signCount: a.signCount, backedUp };
  });
}

// ---- The counter ("Signature Counter Considerations") ----
// It must go up, except a passkey that never counts (synced ones send 0 every time). The directory writes it only WHERE this holds, in
// the same statement that checks it, so two sign-ins with the same count cannot both pass:
//   UPDATE passkeys SET sign_count = :new, backed_up = :bs, last_used_at = :now WHERE id = :id AND <counterWhere(:new)> RETURNING id
export const counterAdvances = (stored: number, next: number) => stored < next || (stored === 0 && next === 0);
export const counterWhere = (next: number): SQL => (next === 0 ? eq(passkeys.signCount, 0) : lt(passkeys.signCount, next));
