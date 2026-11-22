// A strict reader for the CBOR that WebAuthn sends (RFC 8949): the attestation object, COSE keys and extensions (docs/sign-in.md,
// section 2). Unsigned and negative integers, byte and text strings, arrays, maps (integer or text keys), true, false and null. Refused:
// tags, floats and other simple values, indefinite lengths, 8-byte lengths and integers (nothing in WebAuthn needs them), a length past
// the end, a duplicate map key, invalid UTF-8 and nesting deeper than 8. Relative imports only, like the rest of src/lib/auth.

export type CborMap = Map<number | string, Cbor>;
export type Cbor = number | string | boolean | null | Uint8Array<ArrayBuffer> | Cbor[] | CborMap;

// One fixed message, never a byte of the input.
export class CborError extends Error {
  constructor() {
    super("Unreadable CBOR");
  }
}

export const MAX_DEPTH = 8;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Decodes one item from `start` and reports where it ended. The caller decides whether anything may follow.
export function decodeCbor(input: Uint8Array, start = 0): { value: Cbor; end: number } {
  // A copy: a Node Buffer (D1's blob) can be a view into shared memory, and every slice below is then a plain array of its own.
  const bytes = new Uint8Array(input);
  let at = start;
  const fail = (): never => {
    throw new CborError();
  };
  const take = (n: number) => (n > bytes.length - at ? fail() : bytes.slice(at, (at += n)));
  const item = (depth: number): Cbor => {
    if (at >= bytes.length) fail();
    const head = bytes[at++];
    const major = head >> 5;
    const info = head & 31;
    if (major === 7) return info === 20 ? false : info === 21 ? true : info === 22 ? null : fail();
    if (major === 6) fail();
    let arg = info;
    if (info === 24) arg = take(1)[0];
    else if (info === 25 || info === 26) arg = take(info === 25 ? 2 : 4).reduce((n, b) => n * 256 + b, 0); // big endian
    else if (info > 26) fail(); // 27: 8 bytes; 28 to 30: reserved; 31: indefinite
    if (major === 0) return arg;
    if (major === 1) return -1 - arg;
    if (major === 2) return take(arg);
    if (major === 3) {
      const raw = take(arg);
      try {
        return utf8.decode(raw);
      } catch {
        return fail();
      }
    }
    // An array or a map. Every item takes at least a byte, so a count past what is left is refused before any work.
    if (depth >= MAX_DEPTH || arg > bytes.length - at) fail();
    if (major === 4) return Array.from({ length: arg }, () => item(depth + 1));
    const map: CborMap = new Map();
    for (let i = 0; i < arg; i++) {
      const key = item(depth + 1);
      if ((typeof key !== "number" && typeof key !== "string") || map.has(key)) fail();
      map.set(key as number | string, item(depth + 1));
    }
    return map;
  };
  return { value: item(0), end: at };
}

// One complete item: nothing may be left over.
export function decodeCborAll(bytes: Uint8Array): Cbor {
  const { value, end } = decodeCbor(bytes);
  if (end !== bytes.length) throw new CborError();
  return value;
}
