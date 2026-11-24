import { afterEach, describe, expect, it, vi } from "vitest";
import { listUnsubscribeHeaders, signUnsub, unsubscribeLink, unsubscribeParts, verifyUnsub } from "./unsubscribe";

const S = "test-secret";
afterEach(() => vi.unstubAllEnvs());

describe("signed unsubscribe links", () => {
  it("verify what was signed, and nothing else", async () => {
    const sig = await signUnsub(S, "checkwork-motors", "alert", "alert-400");
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await verifyUnsub(S, "checkwork-motors", "alert", "alert-400", sig)).toBe(true);
    expect(await verifyUnsub(S, "test-motors", "alert", "alert-400", sig)).toBe(false); // another dealer
    expect(await verifyUnsub(S, "checkwork-motors", "newsletter", "alert-400", sig)).toBe(false); // the newsletter's kind is gone (#149)
    expect(await verifyUnsub(S, "checkwork-motors", "alert", "alert-401", sig)).toBe(false); // another record
    expect(await verifyUnsub("other-secret", "checkwork-motors", "alert", "alert-400", sig)).toBe(false);
    expect(await verifyUnsub(undefined, "checkwork-motors", "alert", "alert-400", sig)).toBe(false); // no secret set: nothing verifies
    expect(await verifyUnsub(S, "checkwork-motors", "alert", "alert-400", `${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`)).toBe(false); // tampered: the first character
    const AB = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const spare = sig.slice(0, 42) + AB[AB.indexOf(sig[42]) ^ 1]; // the last character has two spare bits: same bytes, other text
    expect(Buffer.from(spare, "base64url").equals(Buffer.from(sig, "base64url"))).toBe(true);
    expect(await verifyUnsub(S, "checkwork-motors", "alert", "alert-400", spare)).toBe(false);
    for (const bad of ["", "x", sig.slice(1), `${sig}A`]) expect(await verifyUnsub(S, "checkwork-motors", "alert", "alert-400", bad)).toBe(false);
  });

  it("refuses parts that could blur one record into another", async () => {
    const sig = await signUnsub(S, "a", "alert", "b");
    expect(await verifyUnsub(S, "a\nalert", "alert", "b", sig)).toBe(false);
    expect(await verifyUnsub(S, "a", "other", "b", sig)).toBe(false);
    expect(await verifyUnsub(S, "a", "alert", "", sig)).toBe(false);
  });

  it("builds a link on this app with no email in it, and the RFC 8058 headers", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", S);
    vi.stubEnv("APP_URL", "https://dev.dash.checkwork.ie");
    const link = await unsubscribeLink("checkwork-motors", "alert", "alert-400");
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe("https://dev.dash.checkwork.ie/api/site/unsubscribe");
    expect([...u.searchParams.keys()]).toEqual(["d", "k", "id", "sig"]);
    expect(await verifyUnsub(S, "checkwork-motors", "alert", "alert-400", u.searchParams.get("sig")!)).toBe(true);
    expect(listUnsubscribeHeaders(link)).toEqual({ "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect((await unsubscribeParts("checkwork-motors", "alert", "alert-400")).link).toBe(link);
  });

  it("unsubscribeParts refuses a link that is not https", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", S);
    vi.stubEnv("APP_URL", "http://localhost:3000");
    await expect(unsubscribeParts("checkwork-motors", "alert", "alert-400")).rejects.toThrow();
    expect(await unsubscribeLink("checkwork-motors", "alert", "alert-400")).toContain("http://localhost:3000/");
  });

  it("throws with no secret, so an email never goes out without a working link", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    await expect(unsubscribeLink("checkwork-motors", "alert", "alert-400")).rejects.toThrow();
  });
});
