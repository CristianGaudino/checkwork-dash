import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ad, AdminReview, Newsletter, SocialPost } from "./collections";

vi.mock("server-only", () => ({}));
const { postReviewReply, publishPost, sendNewsletter, startAd } = await import("./publishers");
const { runAsDealer } = await import("@/lib/tenancy/current");
const real = <T,>(fn: () => Promise<T>) => runAsDealer("test-motors", fn); // a dealer that is not a demo

afterEach(() => vi.unstubAllEnvs());

const post = {} as SocialPost;
const ad = {} as Ad;
const nl = {} as Newsletter;
const review = {} as AdminReview;

describe("publishers", () => {
  it("simulate for a demo dealer: success flagged as simulated, and nothing goes outside, even with keys", async () => {
    for (const k of ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_INSTAGRAM_ID"]) vi.stubEnv(k, "x");
    expect(await publishPost(post)).toEqual({ ok: true, simulated: true });
    expect(await startAd(ad)).toEqual({ ok: true, simulated: true });
    expect(await sendNewsletter(nl)).toEqual({ ok: true, simulated: true });
    expect(await postReviewReply(review, "Thanks")).toEqual({ ok: true, simulated: true });
  });
  it("say not-connected without keys for a real dealer, so it never pretends", async () => {
    expect(await real(() => publishPost(post))).toEqual({ ok: false, reason: "not-connected" });
    expect(await real(() => startAd(ad))).toEqual({ ok: false, reason: "not-connected" });
    expect(await real(() => sendNewsletter(nl))).toEqual({ ok: false, reason: "not-connected" });
    expect(await real(() => postReviewReply(review, "Thanks"))).toEqual({ ok: false, reason: "not-connected" });
  });
  it("say not-installed with keys until the real adapter is written, and never ok", async () => {
    for (const k of ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_INSTAGRAM_ID"]) vi.stubEnv(k, "x");
    expect(await real(() => publishPost(post))).toEqual({ ok: false, reason: "not-installed" });
  });
});
