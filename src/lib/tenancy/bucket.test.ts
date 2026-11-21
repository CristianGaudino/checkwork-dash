import { describe, expect, it, vi } from "vitest";
import { prefixedBucket } from "./bucket";

describe("a dealer's part of the shared bucket", () => {
  it("puts, gets, lists and deletes under dealers/<id>/ only, and gives keys back without the prefix", async () => {
    const raw = { put: vi.fn<(key: string, value: unknown) => Promise<void>>(async () => {}), get: vi.fn(async () => null), delete: vi.fn(async () => {}), list: vi.fn(async () => ({ objects: [{ key: "dealers/a-motors/media/1.jpg" }], truncated: false })) };
    const b = prefixedBucket(raw, "a-motors");
    await b.put("media/1.jpg", new ArrayBuffer(1));
    await b.get("media/1.jpg");
    await b.delete(["media/1.jpg"]);
    await b.delete("media/2.jpg");
    expect((await b.list({ prefix: "media/" })).objects).toEqual([{ key: "media/1.jpg" }]);
    expect(raw.put.mock.calls[0][0]).toBe("dealers/a-motors/media/1.jpg");
    expect(raw.get).toHaveBeenCalledWith("dealers/a-motors/media/1.jpg");
    expect(raw.delete.mock.calls).toEqual([[["dealers/a-motors/media/1.jpg"]], ["dealers/a-motors/media/2.jpg"]]);
    expect(raw.list).toHaveBeenCalledWith({ prefix: "dealers/a-motors/media/" });
  });

  it("refuses a dealer id that could reach outside its prefix", () => {
    for (const id of ["", "../b", "a/b", "A"]) expect(() => prefixedBucket({} as never, id)).toThrow();
  });
});
