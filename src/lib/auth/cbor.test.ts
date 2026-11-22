import { describe, expect, it } from "vitest";
import { CborError, decodeCbor, decodeCborAll, type Cbor } from "./cbor";

const hex = (h: string) => new Uint8Array(Buffer.from(h, "hex"));
const bytes = (...b: number[]) => new Uint8Array(b);
const m = (...entries: [number | string, Cbor][]) => new Map(entries);
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

// RFC 8949, Appendix A: every example in the subset WebAuthn uses decodes to its value.
const READ: [string, Cbor][] = [
  ["00", 0], ["01", 1], ["0a", 10], ["17", 23], ["1818", 24], ["1819", 25], ["1864", 100], ["1903e8", 1000], ["1a000f4240", 1000000],
  ["20", -1], ["29", -10], ["3863", -100], ["3903e7", -1000],
  ["f4", false], ["f5", true], ["f6", null],
  ["40", bytes()], ["4401020304", bytes(1, 2, 3, 4)],
  ["60", ""], ["6161", "a"], ["6449455446", "IETF"], ["62225c", '"\\'], ["62c3bc", "ü"], ["63e6b0b4", "水"], ["64f0908591", "𐅑"],
  ["80", []], ["83010203", [1, 2, 3]], ["8301820203820405", [1, [2, 3], [4, 5]]],
  ["98190102030405060708090a0b0c0d0e0f101112131415161718181819", range(25)],
  ["a0", m()], ["a201020304", m([1, 2], [3, 4])], ["a26161016162820203", m(["a", 1], ["b", [2, 3]])], ["826161a161626163", ["a", m(["b", "c"])]],
  ["a56161614161626142616361436164614461656145", m(["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"], ["e", "E"])],
];

// And every other example is refused: 8-byte integers, tags, floats, undefined and other simple values, indefinite lengths.
const REFUSED = [
  "1b000000e8d4a51000", "1bffffffffffffffff", "c249010000000000000000", "3bffffffffffffffff", "c349010000000000000000",
  "f90000", "f98000", "f93c00", "fb3ff199999999999a", "f93e00", "f97bff", "fa47c35000", "fa7f7fffff", "fb7e37e43c8800759c", "f90001",
  "f90400", "f9c400", "fbc010666666666666", "f97c00", "f97e00", "f9fc00", "fa7f800000", "fa7fc00000", "faff800000", "fb7ff0000000000000",
  "fb7ff8000000000000", "fbfff0000000000000",
  "f7", "f0", "f8ff",
  "c074323031332d30332d32315432303a30343a30305a", "c11a514b67b0", "c1fb41d452d9ec200000", "d74401020304", "d818456449455446",
  "d82076687474703a2f2f7777772e6578616d706c652e636f6d",
  "5f42010243030405ff", "7f657374726561646d696e67ff", "9fff", "9f018202039f0405ffff", "9f01820203820405ff", "83018202039f0405ff",
  "83019f0203ff820405", "9f0102030405060708090a0b0c0d0e0f101112131415161718181819ff", "bf61610161629f0203ffff", "826161bf61626163ff",
  "bf6346756ef563416d7421ff",
];

describe("the CBOR reader (RFC 8949)", () => {
  it.each(READ)("reads Appendix A's %s", (h, value) => {
    expect(decodeCborAll(hex(h))).toEqual(value);
  });

  it.each(REFUSED)("refuses Appendix A's %s (outside what WebAuthn needs)", (h) => {
    expect(() => decodeCborAll(hex(h))).toThrow(CborError);
  });

  it("reports how many bytes one item used, and decodeCborAll refuses anything left over", () => {
    expect(decodeCbor(hex("830102030405"))).toEqual({ value: [1, 2, 3], end: 4 });
    expect(decodeCbor(hex("ff0102"), 1)).toEqual({ value: 1, end: 2 });
    expect(() => decodeCborAll(hex("830102030405"))).toThrow(CborError);
  });

  it("reads the largest 4-byte integers", () => {
    expect(decodeCborAll(hex("1affffffff"))).toBe(4294967295);
    expect(decodeCborAll(hex("3affffffff"))).toBe(-4294967296);
  });

  it("refuses a length past the end, for strings, arrays and maps, and an empty input", () => {
    for (const h of ["", "45010203", "6461", "83 0102", "a2 0102 03", "19 01", "1a 0000", "5a ffffffff 00", "9a ffffffff 00"]) {
      expect(() => decodeCborAll(hex(h.replaceAll(" ", "")))).toThrow(CborError);
    }
  });

  it("refuses 8-byte lengths for strings, arrays and maps, and the reserved additional information", () => {
    for (const h of ["5b000000000000000100", "7b000000000000000161", "9b000000000000000101", "bb00000000000000010102", "1c", "1d", "1e"]) {
      expect(() => decodeCborAll(hex(h))).toThrow(CborError);
    }
  });

  it("refuses a duplicate map key, text or integer, and a key that is not an integer or text", () => {
    expect(() => decodeCborAll(hex("a2616101616102"))).toThrow(CborError); // {"a": 1, "a": 2}
    expect(() => decodeCborAll(hex("a201020103"))).toThrow(CborError); // {1: 2, 1: 3}
    expect(() => decodeCborAll(hex("a1400102"))).toThrow(CborError); // {h'': 1}
    expect(() => decodeCborAll(hex("a1f501"))).toThrow(CborError); // {true: 1}
    expect(() => decodeCborAll(hex("a1800102"))).toThrow(CborError); // {[]: 1}
    expect(decodeCborAll(hex("a2016161616101"))).toEqual(m([1, "a"], ["a", 1])); // 1 and "a" are different keys
  });

  it("allows 8 levels of nesting and refuses a 9th, in arrays and maps", () => {
    expect(decodeCborAll(hex("81".repeat(7) + "80"))).toEqual([[[[[[[[]]]]]]]]);
    expect(() => decodeCborAll(hex("81".repeat(8) + "80"))).toThrow(CborError);
    expect(() => decodeCborAll(hex("a101".repeat(8) + "a0"))).toThrow(CborError);
    expect(decodeCborAll(hex("a101".repeat(7) + "a0"))).toBeInstanceOf(Map);
  });

  it("refuses text that is not UTF-8, and keeps a byte order mark as text", () => {
    expect(() => decodeCborAll(hex("62c328"))).toThrow(CborError);
    expect(decodeCborAll(hex("63efbbbf"))).toBe("﻿");
  });

  it("refuses a count of items past what is left before reading any (a 4-byte count on a short input)", () => {
    expect(() => decodeCborAll(hex("9affffffff"))).toThrow(CborError);
    expect(() => decodeCborAll(hex("baffffffff"))).toThrow(CborError);
  });

  it("reads a Buffer that is a view at a non-zero offset into shared memory, as D1 gives a blob", () => {
    const pool = Buffer.alloc(400, 0xee);
    pool.set(hex("a2 01 590100 " .replaceAll(" ", "") + "00".repeat(256) + "02 1a00010000".replaceAll(" ", "")), 7);
    const view = pool.subarray(7, 7 + 1 + 1 + 3 + 256 + 1 + 5);
    expect(view.byteOffset).toBe(7);
    const m = decodeCborAll(view) as Map<number, Cbor>;
    expect((m.get(1) as Uint8Array).length).toBe(256);
    expect(m.get(2)).toBe(65536);
  });

  it("gives byte strings as copies, so the input can change after", () => {
    const input = hex("4401020304");
    const out = decodeCborAll(input) as Uint8Array;
    input[1] = 9;
    expect([...out]).toEqual([1, 2, 3, 4]);
  });

  it("says nothing about the input when it refuses", () => {
    expect(() => decodeCborAll(hex("6441424344ff"))).toThrow(/^Unreadable CBOR$/);
  });
});
