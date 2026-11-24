import "server-only";
import { modeOf } from "@/lib/integrations";
import type { Ad, AdminReview, SocialPost } from "./collections";
import type { SendResult } from "./marketing";

// The places a draft leaves the admin: a post to Facebook or Instagram, an ad to Meta or Google, a reply to a Google review.
// A service with keys is "live" and goes to its adapter. On a demo dealer it is "simulated" (src/lib/integrations.ts):
// it reports success so the whole flow can be shown, marks the result `simulated`, and sends nothing outside. For any other dealer without
// keys it says not-connected. ADAPTER GOES HERE: when the keys exist and a provider is chosen, replace the "not-installed" return in each.
const run = async (id: Parameters<typeof modeOf>[0]): Promise<SendResult> => {
  const mode = await modeOf(id);
  if (mode === "off") return { ok: false, reason: "not-connected" };
  return mode === "simulated" ? { ok: true, simulated: true } : { ok: false, reason: "not-installed" };
};

// A story goes out like a feed post (PUBLISH_MODE): Instagram, a container with media_type STORIES and image_url or video_url, then
// media_publish; Facebook, the Page's photo_stories (an uploaded unpublished photo id) or video_stories (start, upload, finish).
export async function publishPost(post: SocialPost): Promise<SendResult> {
  void post; // for the adapter that replaces the body below
  return run("social");
}

export async function startAd(ad: Ad): Promise<SendResult> {
  void ad;
  return run("ads");
}

// A reply to a Google review, or "" to remove it: Google Business Profile's reviews.updateReply / deleteReply, for the dealer's verified
// profile. ADAPTER GOES HERE with GOOGLE_BUSINESS_LOCATION and an OAuth refresh token from an owner or manager.
export async function postReviewReply(review: AdminReview, reply: string): Promise<SendResult> {
  void review;
  void reply;
  return run("gbp");
}
