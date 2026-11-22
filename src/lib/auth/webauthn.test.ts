import { describe, expect, it } from "vitest";
import { b64u, unb64u } from "@/lib/push/webpush";
import {
  FLAGS, REGISTRATION_FLAGS, RP, SIGN_IN_FLAGS, assertion, authData, authenticator, cat, cbor, clientDataJSON, newChallenge, registration, userHandle,
  type Authenticator, type Cborable, type Kind,
} from "@/test/authenticator";
import { decodeCborAll, type CborMap } from "./cbor";
import fixtures from "./webauthn-fixtures.json";
import { MAX_INPUT, derToRaw, importCoseKey, parseAuthData, verifyAssertion, verifyRegistration, type NewPasskey, type StoredPasskey } from "./webauthn";

// Every check in docs/sign-in.md, section 2, with one failing case each, against a software authenticator made with node:crypto
// (src/test/authenticator.ts) and responses recorded from Chrome's virtual authenticator (scripts/record-webauthn-fixtures.mjs).

const KINDS: Kind[] = ["EdDSA", "ES256", "RS256"];
const { UP, UV, BE, BS, AT, ED } = FLAGS;
const credProtect = () => cbor(new Map<string, Cborable>([["credProtect", 2]]));

// The registration side of the directory: challenges issued for this person's registration, and credential ids already held.
function registering(...live: string[]) {
  const challenges = new Set(live);
  const taken = new Set<string>();
  return { ...RP, taken, useChallenge: async (c: string) => challenges.delete(c), isTaken: async (id: string) => taken.has(id) };
}

async function register(a: Authenticator, o: Parameters<typeof registration>[2] = {}) {
  const c = newChallenge();
  return verifyRegistration(registration(a, c, o), registering(c));
}

// The counter rule counterWhere puts in the directory's statement (webauthn.int.test.ts runs that on SQLite), for the in-memory stand-in.
const counterAdvances = (stored: number, next: number) => stored < next || (stored === 0 && next === 0);

// The sign-in side: passkeys held, live challenges, and the counter written only where counterAdvances holds (as the statement does).
function directory() {
  const rows = new Map<string, StoredPasskey & { active: boolean }>();
  const live = new Set<string>();
  return {
    rows,
    add: (p: NewPasskey, staffId: string, active = true) => rows.set(p.id, { ...p, staffId, active }),
    challenge: () => {
      const c = newChallenge();
      live.add(c);
      return c;
    },
    rp: (confirming: string | null = null) => ({
      ...RP,
      confirming,
      findPasskey: async (id: string) => {
        const r = rows.get(id);
        return r ? { passkey: r, atActiveDealer: r.active } : null;
      },
      useChallenge: async (c: string) => live.delete(c),
      advanceCounter: async (id: string, next: number) => {
        const r = rows.get(id)!;
        if (!counterAdvances(r.signCount, next)) return false;
        r.signCount = next;
        return true;
      },
    }),
  };
}

// Someone with a registered passkey.
async function person(kind: Kind = "ES256", o: { flags?: number } = {}) {
  const a = authenticator(kind);
  const handle = userHandle();
  const r = await register(a, { flags: o.flags });
  if (!r.ok) throw new Error(r.code);
  const dir = directory();
  dir.add(r.passkey, b64u(handle));
  return { a, handle, staffId: b64u(handle), dir, passkey: r.passkey };
}

const refusedWith = (code: string) => ({ ok: false, code });

// A valid clientDataJSON of exactly MAX_INPUT + 1 bytes.
function padded(type: string, challenge: string) {
  const base = clientDataJSON(type, challenge, { pad: "" }).length;
  return clientDataJSON(type, challenge, { pad: "x".repeat(MAX_INPUT + 1 - base) });
}

describe("ES256 signatures, DER to raw r and s", () => {
  const int = (v: number[]) => [0x02, v.length, ...v];
  const der = (r: number[], s: number[]) => new Uint8Array([0x30, int(r).length + int(s).length, ...int(r), ...int(s)]);
  const n = (len: number, first: number) => [first, ...Array(len - 1).fill(0x11)];

  it("accepts r or s of 31 bytes (padded) and of 33 with a leading 0x00", () => {
    const raw = derToRaw(der(n(31, 0x7f), [0x00, ...n(32, 0x80)]));
    expect([...raw.slice(0, 32)]).toEqual([0, ...n(31, 0x7f)]);
    expect([...raw.slice(32)]).toEqual(n(32, 0x80));
    expect([...derToRaw(der([0x01], [0x01]))]).toEqual([...Array(31).fill(0), 1, ...Array(31).fill(0), 1]);
  });

  it("refuses non-minimal DER: a leading 0x00 not needed, a long-form length, zero or negative values, too long", () => {
    for (const bad of [
      der([0x00, ...n(31, 0x7f)], n(32, 0x11)), // 0x00 before a byte under 0x80
      der([0x00, 0x00, ...n(31, 0x80)], n(32, 0x11)),
      der([0x00], n(32, 0x11)), // zero
      der(n(32, 0x80), n(32, 0x11)), // negative
      der(n(33, 0x11), n(32, 0x11)), // 33 bytes with no 0x00
      der([], n(32, 0x11)),
    ]) {
      expect(() => derToRaw(bad)).toThrow();
    }
    const ok = der(n(32, 0x11), n(32, 0x11));
    expect(() => derToRaw(new Uint8Array([0x30, 0x81, 0x44, ...ok.slice(2)]))).toThrow(); // long form for a short length
    expect(() => derToRaw(new Uint8Array([0x31, ...ok.slice(1)]))).toThrow(); // a SET, not a SEQUENCE
  });

  it("refuses trailing bytes, after the sequence or inside it", () => {
    const ok = der(n(32, 0x11), n(32, 0x11));
    expect(() => derToRaw(new Uint8Array([...ok, 0x00]))).toThrow();
    expect(() => derToRaw(new Uint8Array([0x30, ok[1] + 1, ...ok.slice(2), 0x00]))).toThrow();
  });

  it("verifies real signatures whose r or s is 31 bytes and 33 with a leading 0x00", async () => {
    const a = authenticator("ES256");
    const { key } = await importCoseKey(decodeCborAll(cbor(a.cose)) as CborMap);
    const data = new TextEncoder().encode("signed");
    const lengths = (sig: Uint8Array) => [sig[3], sig[5 + sig[3]]];
    const seen = new Map<number, Uint8Array>();
    for (let i = 0; i < 5000 && !(seen.has(31) && seen.has(33)); i++) {
      const sig = a.sign(data);
      for (const l of lengths(sig)) if (!seen.has(l)) seen.set(l, sig);
    }
    for (const l of [31, 33]) {
      const sig = seen.get(l)!;
      expect(sig, `a signature with a ${l}-byte integer`).toBeDefined();
      expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(sig), data)).toBe(true);
    }
  });
});

describe("authenticator data", () => {
  const cred = (a: Authenticator) => ({ id: a.id, cose: cbor(a.cose) });

  it("at registration: ED with extensions after the key is accepted (credProtect from a security key)", async () => {
    const a = authenticator("ES256");
    const data = authData({ flags: REGISTRATION_FLAGS | ED, cred: cred(a), after: credProtect() });
    expect(parseAuthData(data, true).credential?.id).toEqual(a.id);
    expect(await register(a, { data })).toMatchObject({ ok: true });
  });

  it("at registration: ED set with nothing after the key is refused", async () => {
    const a = authenticator("ES256");
    expect(await register(a, { data: authData({ flags: REGISTRATION_FLAGS | ED, cred: cred(a) }) })).toEqual(refusedWith("bad-data"));
  });

  it("at registration: bytes after the key with ED clear are refused, and so are bytes after the extensions", async () => {
    const a = authenticator("ES256");
    expect(await register(a, { data: authData({ flags: REGISTRATION_FLAGS, cred: cred(a), after: credProtect() }) })).toEqual(refusedWith("bad-data"));
    expect(await register(a, { data: authData({ flags: REGISTRATION_FLAGS | ED, cred: cred(a), after: cat(credProtect(), new Uint8Array([0])) }) })).toEqual(
      refusedWith("bad-data"),
    );
    expect(await register(a, { data: authData({ flags: REGISTRATION_FLAGS | ED, cred: cred(a), after: cbor([1]) }) })).toEqual(refusedWith("bad-data")); // not a map
  });

  it("at sign-in: 37 bytes, then only with ED one map, then nothing; AT must be clear", () => {
    expect(parseAuthData(authData({ flags: SIGN_IN_FLAGS, signCount: 9 }), false)).toMatchObject({ flags: SIGN_IN_FLAGS, signCount: 9 });
    expect(() => parseAuthData(authData({ flags: SIGN_IN_FLAGS | ED, after: credProtect() }), false)).not.toThrow();
    expect(() => parseAuthData(authData({ flags: SIGN_IN_FLAGS | ED }), false)).toThrow();
    expect(() => parseAuthData(authData({ flags: SIGN_IN_FLAGS, after: new Uint8Array([0]) }), false)).toThrow();
    expect(() => parseAuthData(authData({ flags: SIGN_IN_FLAGS | AT }), false)).toThrow();
    expect(() => parseAuthData(authData({ flags: SIGN_IN_FLAGS }).slice(0, 36), false)).toThrow();
  });

  it("refuses a credential id over 1023 bytes or under 16, and one whose length runs past the end", async () => {
    const a = authenticator("ES256");
    const cose = cbor(a.cose);
    expect(await register(a, { data: authData({ flags: REGISTRATION_FLAGS, cred: { id: new Uint8Array(1024), cose } }) })).toEqual(refusedWith("bad-data"));
    expect(await register(a, { data: authData({ flags: REGISTRATION_FLAGS, cred: { id: new Uint8Array(15), cose } }) })).toEqual(refusedWith("bad-data"));
    expect((await register(a, { data: authData({ flags: REGISTRATION_FLAGS, cred: { id: new Uint8Array(1023).fill(7), cose } }) })).ok).toBe(true);
    const short = authData({ flags: REGISTRATION_FLAGS, cred: { id: a.id, cose } }).slice(0, 37 + 18 + 10);
    expect(await register(a, { data: short })).toEqual(refusedWith("bad-data"));
  });
});

describe("registration (adding a passkey)", () => {
  it.each(KINDS)("accepts a %s passkey with attestation none, and gives what is stored", async (kind) => {
    const a = authenticator(kind);
    const r = await register(a, { flags: UP | UV | AT | BE });
    expect(r).toEqual({ ok: true, passkey: { id: b64u(a.id), publicKey: cbor(a.cose), alg: a.alg, signCount: 0, backupEligible: true, backedUp: false } });
  });

  it.each(KINDS)("accepts %s packed self attestation", async (kind) => {
    expect(await register(authenticator(kind), { fmt: "packed" })).toMatchObject({ ok: true });
  });

  it("1: refuses a type other than webauthn.create, and clientDataJSON that is not a JSON object", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    expect(await verifyRegistration(registration(a, c, { clientData: clientDataJSON("webauthn.get", c) }), registering(c))).toEqual(refusedWith("bad-data"));
    for (const raw of ["not json", "[]", "null", '"x"']) {
      expect(await verifyRegistration(registration(a, c, { clientData: new TextEncoder().encode(raw) }), registering(c))).toEqual(refusedWith("bad-data"));
    }
    expect(await verifyRegistration(registration(a, c, { clientData: new Uint8Array([0xff, 0xfe]) }), registering(c))).toEqual(refusedWith("bad-data"));
  });

  it("2: refuses a challenge not issued for this registration, or already used, and spends it once", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const rp = registering(c);
    expect(await verifyRegistration(registration(a, newChallenge()), rp)).toEqual(refusedWith("expired"));
    const res = registration(a, c);
    expect((await verifyRegistration(res, rp)).ok).toBe(true);
    expect(await verifyRegistration(res, rp)).toEqual(refusedWith("expired")); // replayed
    expect(await verifyRegistration(registration(a, "short"), registering("short"))).toEqual(refusedWith("bad-data")); // not one we issue
  });

  it("3: refuses another origin, crossOrigin true, and any topOrigin", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const cases = [
      clientDataJSON("webauthn.create", c, {}, "https://dev.dash.checkwork.ie"),
      clientDataJSON("webauthn.create", c, {}, "https://dash.checkwork.ie"),
      clientDataJSON("webauthn.create", c, {}, "http://www.dash.checkwork.ie"),
      clientDataJSON("webauthn.create", c, { crossOrigin: true }),
      clientDataJSON("webauthn.create", c, { crossOrigin: "false" }),
      clientDataJSON("webauthn.create", c, { topOrigin: RP.origin }),
    ];
    for (const clientData of cases) expect(await verifyRegistration(registration(a, c, { clientData }), registering(c))).toEqual(refusedWith("bad-origin"));
    const absent = new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: c, origin: RP.origin }));
    expect((await verifyRegistration(registration(a, c, { clientData: absent }), registering(c))).ok).toBe(true); // crossOrigin absent
  });

  it("4: refuses an attestation object with anything left over, or missing its parts", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const res = registration(a, c);
    expect(await verifyRegistration({ ...res, attestationObject: cat(res.attestationObject, new Uint8Array([0])) }, registering(c))).toEqual(refusedWith("bad-data"));
    const parts = decodeCborAll(res.attestationObject) as CborMap;
    for (const drop of ["fmt", "attStmt", "authData"]) {
      const m = new Map(parts);
      m.delete(drop);
      expect(await verifyRegistration({ ...res, attestationObject: cbor(m as Map<string, Cborable>) }, registering(c))).toEqual(refusedWith("bad-data"));
    }
  });

  it("4: refuses none with a statement, and any other format", async () => {
    const a = authenticator("ES256");
    expect(await register(a, { stmt: new Map([["alg", -7]]) })).toEqual(refusedWith("bad-data"));
    for (const fmt of ["fido-u2f", "tpm", "android-key", "apple", ""]) {
      const c = newChallenge();
      const res = registration(a, c);
      const m = decodeCborAll(res.attestationObject) as CborMap;
      m.set("fmt", fmt);
      expect(await verifyRegistration({ ...res, attestationObject: cbor(m as Map<string, Cborable>) }, registering(c))).toEqual(refusedWith("bad-data"));
    }
  });

  it("4: refuses packed self attestation with a wrong alg", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const good = registration(a, c, { fmt: "packed" });
    const stmt = (decodeCborAll(good.attestationObject) as CborMap).get("attStmt") as Map<string, Cborable>;
    for (const alg of [-8, -257, -35]) {
      expect(await verifyRegistration(registration(a, c, { fmt: "packed", stmt: new Map([...stmt, ["alg", alg]]) }), registering(c))).toEqual(refusedWith("bad-data"));
    }
  });

  it.each(KINDS)("4: refuses %s packed self attestation with a bad signature", async (kind) => {
    const a = authenticator(kind);
    const other = authenticator(kind);
    const c = newChallenge();
    const res = registration(a, c);
    const data = (decodeCborAll(res.attestationObject) as CborMap).get("authData") as Uint8Array;
    const sig = other.sign(cat(data, new Uint8Array(32))); // the wrong key, over the wrong bytes
    expect(await verifyRegistration(registration(a, c, { fmt: "packed", stmt: new Map<string, Cborable>([["alg", a.alg], ["sig", sig]]) }), registering(c))).toEqual(
      refusedWith("bad-signature"),
    );
  });

  it("4: refuses packed with x5c (full attestation), or anything else in the statement", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const good = registration(a, c, { fmt: "packed" });
    const stmt = (decodeCborAll(good.attestationObject) as CborMap).get("attStmt") as Map<string, Cborable>;
    for (const [k, v] of [["x5c", [new Uint8Array(300)]], ["ecdaaKeyId", new Uint8Array(32)]] as [string, Cborable][]) {
      expect(await verifyRegistration(registration(a, c, { fmt: "packed", stmt: new Map<string, Cborable>([...stmt, [k, v]]) }), registering(c))).toEqual(refusedWith("bad-data"));
    }
    expect((await verifyRegistration(good, registering(c))).ok).toBe(true);
  });

  it("5: refuses another RP id's hash", async () => {
    const a = authenticator("ES256");
    for (const rpId of ["dev.dash.checkwork.ie", "checkwork.ie", "localhost"]) {
      const data = authData({ rpId, flags: REGISTRATION_FLAGS, cred: { id: a.id, cose: cbor(a.cose) } });
      expect(await register(a, { data })).toEqual(refusedWith("bad-data"));
    }
  });

  it("6: refuses UP clear, UV clear, AT clear, and BS without BE", async () => {
    const a = authenticator("ES256");
    for (const flags of [REGISTRATION_FLAGS & ~UP, REGISTRATION_FLAGS & ~UV, REGISTRATION_FLAGS & ~AT, UP | UV | AT | BS]) {
      expect(await register(a, { flags })).toEqual(refusedWith("bad-data"));
    }
    expect(await register(a, { flags: UP | UV | AT })).toMatchObject({ ok: true, passkey: { backupEligible: false, backedUp: false } });
  });

  it("7: refuses a credential id already registered", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const rp = registering(c);
    rp.taken.add(b64u(a.id));
    expect(await verifyRegistration(registration(a, c), rp)).toEqual(refusedWith("bad-data"));
  });

  describe("8: keys", () => {
    const withKey = async (a: Authenticator, cose: Map<number, Cborable>) => register(a, { cose: cbor(cose) });
    const edit = (a: Authenticator, ...changes: [number, Cborable | undefined][]) => {
      const m = new Map(a.cose);
      for (const [k, v] of changes) {
        if (v === undefined) m.delete(k);
        else m.set(k, v);
      }
      return m;
    };

    it("refuses a kty that does not match the alg", async () => {
      const ec = authenticator("ES256");
      const ed = authenticator("EdDSA");
      const rsa = authenticator("RS256");
      for (const [a, kty] of [[ec, 1], [ec, 3], [ed, 2], [ed, 3], [rsa, 2], [rsa, 1]] as const) {
        expect(await withKey(a, edit(a, [1, kty]))).toEqual(refusedWith("bad-data"));
      }
    });

    it("refuses an algorithm we did not offer, or none", async () => {
      const ec = authenticator("ES256");
      for (const alg of [-35, -36, -37, -257, -8, 0]) expect(await withKey(ec, edit(ec, [3, alg]))).toEqual(refusedWith("bad-data"));
      expect(await withKey(ec, edit(ec, [3, undefined]))).toEqual(refusedWith("bad-data"));
    });

    it("refuses a short EC coordinate, another curve, and a point not on the curve", async () => {
      const ec = authenticator("ES256");
      const x = ec.cose.get(-2) as Uint8Array;
      const y = ec.cose.get(-3) as Uint8Array;
      expect(await withKey(ec, edit(ec, [-2, x.slice(1)]))).toEqual(refusedWith("bad-data"));
      expect(await withKey(ec, edit(ec, [-3, y.slice(1)]))).toEqual(refusedWith("bad-data"));
      expect(await withKey(ec, edit(ec, [-3, cat(new Uint8Array(1), y)]))).toEqual(refusedWith("bad-data"));
      expect(await withKey(ec, edit(ec, [-3, undefined]))).toEqual(refusedWith("bad-data"));
      expect(await withKey(ec, edit(ec, [-1, 2]))).toEqual(refusedWith("bad-data")); // P-384
      const off = new Uint8Array(y);
      off[31] ^= 1;
      expect(await withKey(ec, edit(ec, [-3, off]))).toEqual(refusedWith("bad-data"));
    });

    it("refuses an Ed25519 key of the wrong size or curve", async () => {
      const ed = authenticator("EdDSA");
      expect(await withKey(ed, edit(ed, [-2, (ed.cose.get(-2) as Uint8Array).slice(1)]))).toEqual(refusedWith("bad-data"));
      expect(await withKey(ed, edit(ed, [-1, 7]))).toEqual(refusedWith("bad-data")); // Ed448
    });

    it("refuses an RSA exponent other than 65537 (e = 1 would let anyone forge a signature), and a modulus over 4096 bits", async () => {
      const rsa = authenticator("RS256");
      for (const e of [[1], [3], [1, 0, 0, 1], [1, 0, 0], []]) {
        expect(await withKey(rsa, edit(rsa, [-2, new Uint8Array(e)]))).toEqual(refusedWith("bad-data"));
      }
      const big = new Uint8Array(513).fill(0xc5);
      expect(await withKey(rsa, edit(rsa, [-1, big]))).toEqual(refusedWith("bad-data"));
    });

    it("refuses a 1024-bit RSA key, and one just under 2048 bits", async () => {
      expect(await register(authenticator("RS256", { rsaBits: 1024 }))).toEqual(refusedWith("bad-data"));
      const rsa = authenticator("RS256");
      const n = new Uint8Array(rsa.cose.get(-1) as Uint8Array);
      n[0] = 0x7f; // 2047 bits
      expect(await withKey(rsa, edit(rsa, [-1, n]))).toEqual(refusedWith("bad-data"));
      expect(await withKey(rsa, edit(rsa, [-1, cat(new Uint8Array(1), rsa.cose.get(-1) as Uint8Array)]))).toMatchObject({ ok: true }); // a leading zero is not a bit
    });
  });

  it("refuses an otherwise valid clientDataJSON over MAX_INPUT before spending the challenge", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const clientData = padded("webauthn.create", c);
    expect(clientData.length).toBe(MAX_INPUT + 1);
    const rp = registering(c);
    expect(await verifyRegistration(registration(a, c, { clientData }), rp)).toEqual(refusedWith("bad-data"));
    expect((await verifyRegistration(registration(a, c), rp)).ok).toBe(true); // the challenge was not spent
  });
});

describe("sign-in", () => {
  it.each(KINDS)("accepts a %s passkey: the person, the count and the backup state", async (kind) => {
    const p = await person(kind);
    const r = await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { signCount: 3 }), p.dir.rp());
    expect(r).toEqual({ ok: true, staffId: p.staffId, credentialId: p.passkey.id, signCount: 3, backedUp: true });
    expect(p.dir.rows.get(p.passkey.id)?.signCount).toBe(3);
  });

  it.each(KINDS)("accepts a %s passkey whose stored key comes back from D1 as a Buffer, a view into shared memory", async (kind) => {
    const p = await person(kind);
    const row = p.dir.rows.get(p.passkey.id)!;
    const pool = Buffer.alloc(row.publicKey.length + 64, 0xee);
    pool.set(row.publicKey, 40);
    row.publicKey = pool.subarray(40, 40 + row.publicKey.length); // a non-zero byteOffset, as Buffer's pool gives
    expect(row.publicKey.byteOffset).toBe(40);
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { signCount: 1 }), p.dir.rp())).toMatchObject({ ok: true });
    row.publicKey = Buffer.from(p.passkey.publicKey);
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { signCount: 2 }), p.dir.rp())).toMatchObject({ ok: true });
  });

  it("refuses an oversized clientDataJSON, signature or user handle before looking anything up", async () => {
    const p = await person();
    let lookups = 0;
    const rp = { ...p.dir.rp(), findPasskey: async () => (lookups++, null) };
    const c = p.dir.challenge();
    expect(await verifyAssertion(assertion(p.a, c, p.handle, { clientData: padded("webauthn.get", c) }), rp)).toEqual(refusedWith("bad-data"));
    const res = assertion(p.a, c, p.handle);
    expect(await verifyAssertion({ ...res, signature: new Uint8Array(MAX_INPUT + 1) }, rp)).toEqual(refusedWith("bad-data"));
    expect(await verifyAssertion({ ...res, userHandle: new Uint8Array(MAX_INPUT + 1) }, rp)).toEqual(refusedWith("bad-data"));
    expect(lookups).toBe(0);
  });

  it("1: refuses a credential we do not hold (the only unknown-credential), and one of someone at no active dealer", async () => {
    const p = await person();
    const stranger = authenticator("ES256");
    expect(await verifyAssertion(assertion(stranger, p.dir.challenge(), p.handle), p.dir.rp())).toEqual(refusedWith("unknown-credential"));
    expect(await verifyAssertion({ ...assertion(p.a, p.dir.challenge(), p.handle), credentialId: "not/base64url" }, p.dir.rp())).toEqual(refusedWith("bad-data"));
    p.dir.rows.get(p.passkey.id)!.active = false;
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle), p.dir.rp())).toEqual(refusedWith("no-dealer"));
  });

  it("1: refuses a sign-in with no user handle, or another person's", async () => {
    const p = await person();
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), null), p.dir.rp())).toEqual(refusedWith("bad-data"));
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), userHandle()), p.dir.rp())).toEqual(refusedWith("bad-data"));
  });

  it("1: a confirmation accepts only the session's own person's passkey, with or without a user handle", async () => {
    const p = await person();
    const other = await person();
    p.dir.add(other.passkey, other.staffId); // the other person's passkey, on the same device
    expect(await verifyAssertion(assertion(other.a, p.dir.challenge(), other.handle), p.dir.rp(p.staffId))).toEqual(refusedWith("bad-data"));
    expect(await verifyAssertion(assertion(other.a, p.dir.challenge(), null), p.dir.rp(p.staffId))).toEqual(refusedWith("bad-data"));
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), other.handle), p.dir.rp(p.staffId))).toEqual(refusedWith("bad-data"));
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), null, { signCount: 1 }), p.dir.rp(p.staffId))).toMatchObject({ ok: true, staffId: p.staffId });
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { signCount: 2 }), p.dir.rp(p.staffId))).toMatchObject({ ok: true });
  });

  it("2: refuses a type other than webauthn.get, another origin, crossOrigin true, and a challenge not live", async () => {
    const p = await person();
    const c = p.dir.challenge();
    const at = (clientData: Uint8Array<ArrayBuffer>) => verifyAssertion(assertion(p.a, c, p.handle, { clientData }), p.dir.rp());
    expect(await at(clientDataJSON("webauthn.create", c))).toEqual(refusedWith("bad-data"));
    expect(await at(clientDataJSON("webauthn.get", c, {}, "https://dev.dash.checkwork.ie"))).toEqual(refusedWith("bad-origin"));
    expect(await at(clientDataJSON("webauthn.get", c, { crossOrigin: true }))).toEqual(refusedWith("bad-origin"));
    expect(await verifyAssertion(assertion(p.a, newChallenge(), p.handle), p.dir.rp())).toEqual(refusedWith("expired"));
  });

  it("2: spends the challenge once, so a replayed response is refused", async () => {
    const p = await person();
    const res = assertion(p.a, p.dir.challenge(), p.handle, { signCount: 1 });
    expect((await verifyAssertion(res, p.dir.rp())).ok).toBe(true);
    expect(await verifyAssertion(res, p.dir.rp())).toEqual(refusedWith("expired"));
  });

  it("3: refuses AT set, another RP id, UP or UV clear, and BS without BE", async () => {
    const p = await person();
    for (const flags of [SIGN_IN_FLAGS | AT, SIGN_IN_FLAGS & ~UP, SIGN_IN_FLAGS & ~UV]) {
      expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { flags }), p.dir.rp())).toEqual(refusedWith("bad-data"));
    }
    const data = authData({ rpId: "dev.dash.checkwork.ie", flags: SIGN_IN_FLAGS });
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { data }), p.dir.rp())).toEqual(refusedWith("bad-data"));
    const plain = await person("ES256", { flags: UP | UV | AT });
    expect(await verifyAssertion(assertion(plain.a, plain.dir.challenge(), plain.handle, { flags: UP | UV | BS }), plain.dir.rp())).toEqual(refusedWith("bad-data"));
  });

  it("3: refuses BE different from what was stored at registration, either way", async () => {
    const synced = await person("ES256");
    expect(await verifyAssertion(assertion(synced.a, synced.dir.challenge(), synced.handle, { flags: UP | UV }), synced.dir.rp())).toEqual(refusedWith("bad-data"));
    const local = await person("ES256", { flags: UP | UV | AT });
    expect(await verifyAssertion(assertion(local.a, local.dir.challenge(), local.handle, { flags: UP | UV | BE }), local.dir.rp())).toEqual(refusedWith("bad-data"));
    expect(await verifyAssertion(assertion(local.a, local.dir.challenge(), local.handle, { flags: UP | UV, signCount: 1 }), local.dir.rp())).toMatchObject({ ok: true, backedUp: false });
  });

  it("3: accepts extensions at sign-in only with ED set", async () => {
    const p = await person();
    const ext = authData({ flags: SIGN_IN_FLAGS | ED, signCount: 1, after: credProtect() });
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { data: ext }), p.dir.rp())).toMatchObject({ ok: true });
    const stray = authData({ flags: SIGN_IN_FLAGS, signCount: 2, after: credProtect() });
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { data: stray }), p.dir.rp())).toEqual(refusedWith("bad-data"));
  });

  it.each(KINDS)("4: refuses a bad %s signature", async (kind) => {
    const p = await person(kind);
    const res = assertion(p.a, p.dir.challenge(), p.handle, { signCount: 1 });
    const flipped = new Uint8Array(res.signature);
    flipped[flipped.length - 1] ^= 1;
    expect(await verifyAssertion({ ...res, signature: flipped }, p.dir.rp())).toEqual(refusedWith("bad-signature"));
    // A signature over other client data than was sent.
    const c = p.dir.challenge();
    const other = assertion(p.a, c, p.handle, { signCount: 1 });
    expect(await verifyAssertion({ ...other, clientDataJSON: clientDataJSON("webauthn.get", c, { extra: 1 }) }, p.dir.rp())).toEqual(refusedWith("bad-signature"));
    expect(await verifyAssertion({ ...assertion(p.a, p.dir.challenge(), p.handle), signature: new Uint8Array(0) }, p.dir.rp())).toEqual(refusedWith("bad-signature"));
  });

  it("4: refuses a stored key whose algorithm is not the stored one", async () => {
    const p = await person("ES256");
    p.dir.rows.get(p.passkey.id)!.alg = -257;
    expect(await verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle), p.dir.rp())).toEqual(refusedWith("bad-data"));
  });

  it("5: the counter must go up, except a passkey that always sends 0", async () => {
    const p = await person();
    const at = (signCount: number) => verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { signCount }), p.dir.rp());
    expect((await at(0)).ok).toBe(true); // 0 after 0: a synced passkey
    expect((await at(0)).ok).toBe(true);
    expect((await at(5)).ok).toBe(true);
    expect(await at(5)).toEqual(refusedWith("counter")); // stood still
    expect(await at(4)).toEqual(refusedWith("counter")); // went back
    expect(await at(0)).toEqual(refusedWith("counter")); // back to 0 after counting
    expect((await at(6)).ok).toBe(true);
  });

  it("5: of two sign-ins with the same count, one is refused", async () => {
    const p = await person();
    const results = await Promise.all([0, 1].map(() => verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle, { signCount: 7 }), p.dir.rp())));
    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(results.find((r) => !r.ok)).toEqual(refusedWith("counter"));
  });

  it("counterAdvances: written only where the stored count is below the new one, or both are 0", () => {
    expect([counterAdvances(0, 0), counterAdvances(0, 1), counterAdvances(4, 5)]).toEqual([true, true, true]);
    expect([counterAdvances(5, 5), counterAdvances(5, 4), counterAdvances(1, 0)]).toEqual([false, false, false]);
  });
});

describe("what never escapes", () => {
  it("answers bad-data, never an exception, for broken or random input", async () => {
    const a = authenticator("ES256");
    const c = newChallenge();
    const good = registration(a, c, { fmt: "packed" });
    const inputs = [
      ...Array.from({ length: good.attestationObject.length }, (_, i) => good.attestationObject.slice(0, i)),
      ...Array.from({ length: 200 }, () => crypto.getRandomValues(new Uint8Array(1 + Math.floor(Math.random() * 300)))),
    ];
    for (const attestationObject of inputs) {
      const r = await verifyRegistration({ ...good, attestationObject }, registering(c, newChallenge()));
      expect(r.ok).toBe(false);
    }
    const p = await person();
    for (let i = 0; i < 37; i++) {
      const res = assertion(p.a, p.dir.challenge(), p.handle);
      expect(await verifyAssertion({ ...res, authenticatorData: res.authenticatorData.slice(0, i) }, p.dir.rp())).toEqual(refusedWith("bad-data"));
    }
  });

  it("lets a failing directory's error through, for the caller to handle", async () => {
    const p = await person();
    const down = { ...p.dir.rp(), useChallenge: async () => Promise.reject(new Error("D1 down")) };
    await expect(verifyAssertion(assertion(p.a, p.dir.challenge(), p.handle), down)).rejects.toThrow("D1 down");
  });
});

describe("responses recorded from Chrome's virtual authenticator", () => {
  it.each(fixtures.fixtures.map((f) => [f.name, f] as const))("%s registers and signs in", async (_, f) => {
    const rp = { rpId: f.rpId, origin: f.origin };
    const reg = { clientDataJSON: unb64u(f.registration.clientDataJSON), attestationObject: unb64u(f.registration.attestationObject) };
    const r = await verifyRegistration(reg, { ...rp, useChallenge: async (c) => c === f.registration.challenge, isTaken: async () => false });
    if (!r.ok) throw new Error(r.code);
    expect(r.passkey.id).toBe(f.registration.id);
    const stored = { ...r.passkey, staffId: f.userHandle };
    const res = {
      credentialId: f.signIn.id,
      clientDataJSON: unb64u(f.signIn.clientDataJSON),
      authenticatorData: unb64u(f.signIn.authenticatorData),
      signature: unb64u(f.signIn.signature),
      userHandle: f.signIn.userHandle ? unb64u(f.signIn.userHandle) : null,
    };
    const deps = {
      ...rp,
      findPasskey: async (id: string) => (id === stored.id ? { passkey: stored, atActiveDealer: true } : null),
      confirming: null,
      useChallenge: async (c: string) => c === f.signIn.challenge,
      advanceCounter: async (_: string, next: number) => counterAdvances(stored.signCount, next),
    };
    expect(await verifyAssertion(res, deps)).toMatchObject({ ok: true, staffId: f.userHandle });
    // The same response on production's RP: another origin, and another RP id hash.
    expect(await verifyAssertion(res, { ...deps, origin: RP.origin })).toEqual(refusedWith("bad-origin"));
    expect(await verifyAssertion(res, { ...deps, rpId: RP.rpId })).toEqual(refusedWith("bad-data"));
  });
});
