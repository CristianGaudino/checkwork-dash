import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ad, AdminReview, SocialPost } from "./collections";

vi.mock("server-only", () => ({}));
const { postReviewReply, publishPost, startAd } = await import("./publishers");
const { runAsDealer } = await import("@/lib/tenancy/current");
const real = <T,>(fn: () => Promise<T>) => runAsDealer("test-motors", fn); // a dealer that is not a demo

afterEach(() => vi.unstubAllEnvs());

const post = {} as SocialPost;
const ad = {} as Ad;
const review = {} as AdminReview;

describe("publishers", () => {
  it("simulate for a demo dealer: success flagged as simulated, and nothing goes outside, even with keys", async () => {
    for (const k of ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_INSTAGRAM_ID"]) vi.stubEnv(k, "x");
    expect(await publishPost(post)).toEqual({ ok: true, simulated: true });
    expect(await startAd(ad)).toEqual({ ok: true, simulated: true });
    expect(await postReviewReply(review, "Thanks")).toEqual({ ok: true, simulated: true });
  });
  it("say not-connected without keys for a real dealer, so it never pretends", async () => {
    expect(await real(() => publishPost(post))).toEqual({ ok: false, reason: "not-connected" });
    expect(await real(() => startAd(ad))).toEqual({ ok: false, reason: "not-connected" });
    expect(await real(() => postReviewReply(review, "Thanks"))).toEqual({ ok: false, reason: "not-connected" });
  });
  it("say not-installed with keys until the real adapter is written, and never ok", async () => {
    vi.stubEnv("DEALER_SECRETS_KEY", Buffer.alloc(32, 3).toString("base64"));
    const { saveSecrets, removeSecret } = await import("@/lib/dealer-secrets");
    const names = ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_INSTAGRAM_ID"];
    expect(await real(() => publishPost(post))).toEqual({ ok: false, reason: "not-connected" }); // app-wide variables alone never connect a dealer
    await real(() => saveSecrets(Object.fromEntries(names.map((n) => [n, "x"]))));
    expect(await real(() => publishPost(post))).toEqual({ ok: false, reason: "not-installed" });
    await real(() => Promise.all(names.map(removeSecret)));
  });
});
