import { ActButton } from "@/components/admin/ActButton";
import { rowButton, rowButtonStrong } from "@/components/admin/kit";
import { publishPostAction } from "@/app/marketing/actions";
import { FORMAT_LABELS, PUBLISH_MODE } from "@/lib/admin/networks";
import type { SocialPost } from "@/lib/admin/collections";

// Held until the network approves us (PUBLISH_MODE: anything on TikTok): saved as posted, but it has not gone out.
export const prepared = (p: Pick<SocialPost, "network" | "format">) => PUBLISH_MODE[p.network][p.format ?? "post"] === "prepare";
export const postName = (p: { network: string; format?: keyof typeof FORMAT_LABELS }) => `${p.network} ${(p.format ? FORMAT_LABELS[p.format] : "Post").toLowerCase()}`;
// "the Facebook post, Ford Focus": how a row's buttons name the post.
export const postLabel = (p: Pick<SocialPost, "network" | "format" | "carTitle">) => `the ${postName(p)}${p.carTitle ? `, ${p.carTitle}` : ""}`;

// Post a waiting post now, and say so for one held until the network approves us. A row's primary action (`strong`), or an item in its menu.
// `className`: ml-auto in a list row, so a button that wraps under the words keeps to the right edge (#126).
export function PostNow({ p, strong = true, className = "" }: { p: SocialPost; strong?: boolean; className?: string }) {
  const ready = prepared(p);
  const verb = ready ? "Finish post" : "Post now";
  return (
    <ActButton
      act={publishPostAction.bind(null, p.id)}
      confirm={ready ? { title: "Finish this post?", text: `It is saved and goes out once ${p.network} approves us.`, yes: verb, safe: true } : { title: "Post this now?", text: `It goes out on ${p.network} at once.`, yes: verb, safe: true }}
      label={`${verb}: ${postName(p)}${p.carTitle ? `, ${p.carTitle}` : ""}`}
      className={`${strong ? rowButtonStrong : rowButton} ${className}`}
    >
      {verb}
    </ActButton>
  );
}
