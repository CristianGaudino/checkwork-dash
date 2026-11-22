import "server-only";
import { modeOf } from "@/lib/integrations";
import type { Ad, AdminReview, Newsletter, SocialPost } from "./collections";
import type { SendResult } from "./marketing";

// The three places a draft leaves the admin: a post to Facebook or Instagram, an ad to Meta or Google, a newsletter to subscribers.
// A service with keys is "live" and goes to its adapter. On a demo dealer it is "simulated" (src/lib/integrations.ts):
// it reports success so the whole flow can be shown, marks the result `simulated`, and sends nothing outside. For any other dealer without
// keys it says not-connected. ADAPTER GOES HERE: when the keys exist and a provider is chosen, replace the "not-installed" return in each.
const run = async (id: Parameters<typeof modeOf>[0]): Promise<SendResult> => {
  const mode = await modeOf(id);
  if (mode === "off") return { ok: false, reason: "not-connected" };
  return mode === "simulated" ? { ok: true, simulated: true } : { ok: false, reason: "not-installed" };
};

export async function publishPost(post: SocialPost): Promise<SendResult> {
  void post; // for the adapter that replaces the body below
  return run("social");
}

export async function startAd(ad: Ad): Promise<SendResult> {
  void ad;
  return run("ads");
}

// Every newsletter and stock alert email carries its own unsubscribe link in the body and the List-Unsubscribe headers: unsubscribeParts
// (src/lib/unsubscribe.ts) for that subscriber or alert, signed with UNSUBSCRIBE_SECRET. The link is on this app, never the dealer's website:
// it opens /api/site/unsubscribe, public with no sign-in, and turns the subscription off in the dealer's own store. Never send one without them.
export async function sendNewsletter(n: Newsletter): Promise<SendResult> {
  void n; // for the adapter: per subscriber, `await unsubscribeParts(dealerId, "newsletter", subscriber.id)` gives the link and the headers
  return run("newsletter");
}

// A reply to a Google review, or "" to remove it: Google Business Profile's reviews.updateReply / deleteReply, for the dealer's verified
// profile. ADAPTER GOES HERE with GOOGLE_BUSINESS_LOCATION and an OAuth refresh token from an owner or manager.
export async function postReviewReply(review: AdminReview, reply: string): Promise<SendResult> {
  void review;
  void reply;
  return run("gbp");
}
