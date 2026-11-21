import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEALER_COOKIE, dealerAccess } from "@/lib/tenancy/membership";

// Where a push notification opens (src/lib/admin/notifications.ts): its dealer, then its page. Someone at several dealers may have another
// one open. The dealer is checked against their memberships, as the chooser does (src/app/dealers/actions.ts), and the cookie stays as it was
// for one they are not a member of. Only a path on this site: anything else goes to the overview.
export const dynamic = "force-dynamic";

function safePath(to: string | null): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) return "/";
  // What the browser would make of it (it drops tabs and newlines, so "/\t/x.com" is "//x.com"): still this site, or the overview.
  const u = new URL(to, "http://here");
  return u.origin === "http://here" ? u.pathname + u.search + u.hash : "/";
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get("dealer") ?? "";
  const a = await dealerAccess();
  const choices = a.state === "ok" || a.state === "choose" ? a.choices : [];
  if (!choices.some((c) => c.id === id)) redirect("/");
  (await cookies()).set(DEALER_COOKIE, id, { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true, secure: true });
  redirect(safePath(q.get("to")));
}
