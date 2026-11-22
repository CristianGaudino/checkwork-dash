"use server";

import { redirect } from "next/navigation";
import { logActivity } from "@/lib/admin/activity";
import { reviewsStore } from "@/lib/admin/collections";
import { REVIEW_FILTERS } from "@/lib/admin/reviews";
import { postReviewReply } from "@/lib/admin/publishers";
import { requireModule } from "@/lib/modules";
import { requireStaff } from "@/lib/staff";

// A reply goes to Google first (Business Profile, simulated on the demo), and is kept here only once Google has it, so the dashboard never
// shows a reply the customer cannot see. An empty box removes the reply. The answer comes back as a short code the page knows.
export async function replyAction(id: string, data: FormData) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await requireModule("reviews"); // and only while the dealer has it
  await requireModule("dashboard"); // replies are a dashboard feature: a Showroom site shows reviews only (#224)
  const reply = String(data.get("reply") ?? "").trim().slice(0, 500);
  // Back to the tab they replied from: only a known filter, so the address is never built from what was posted.
  const tab = REVIEW_FILTERS.find(([k]) => k === data.get("filter"))?.[0];
  const back = (notice: string) => `/reviews?${tab ? `filter=${tab}&` : ""}notice=${notice}`;
  const review = await reviewsStore.get(id);
  if (!review || reply === (review.reply ?? "")) return; // nothing changed
  const sent = await postReviewReply(review, reply);
  if (!sent.ok) redirect(back(sent.reason));
  await reviewsStore.put(reply ? { ...review, reply, repliedAt: Date.now() } : { ...review, reply: undefined, repliedAt: undefined });
  await logActivity("reviews", reply ? (review.reply ? "Changed the reply to the review" : "Replied to the review") : "Removed the reply to the review", { kind: "review", id });
  redirect(back(reply ? "reply-posted" : "reply-removed"));
}
