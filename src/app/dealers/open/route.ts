import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/gate";
import { toSignIn } from "@/lib/staff";
import { dealerAccess, pickDealer } from "@/lib/tenancy/membership";

// Where a push notification opens (src/lib/admin/notifications.ts): its dealer, then its page. Someone at several dealers may have another
// one open. The dealer is checked against their memberships, as the chooser does (src/app/dealers/actions.ts), and the cookie stays as it was
// for one they are not a member of. Only a path on this site (safeNext, the same rule as sign-in's `next`): anything else goes to the overview.
// Signed out under our sign-in (a dead session): to sign in first, then back here, so the tap still reaches its lead.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get("dealer") ?? "";
  const a = await dealerAccess();
  if (a.state === "signed-out") await toSignIn();
  const choices = a.state === "ok" || a.state === "choose" ? a.choices : [];
  if (!choices.some((c) => c.id === id)) redirect("/");
  await pickDealer(id);
  redirect(safeNext(q.get("to")));
}
