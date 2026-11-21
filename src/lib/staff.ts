import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { accessConfig, verifyAccessJwt } from "@/lib/access";
import { adminReachable } from "@/lib/demo";
import { DEV_EMAIL } from "@/lib/tenancy/directory";
import { dealerAccess } from "@/lib/tenancy/membership";
import { hasModule } from "@/lib/modules";

// Who the dashboard is talking to, checked here and not trusted from a header. A server action runs on a POST to any page (Next 16), so
// the proxy's gate on the pages is not enough on its own: every dashboard action asks requireStaff() first, and the person is the
// one Cloudflare Access signed for (its token, verified once a request). Open in development and in a build that says so (the E2E run,
// the open demo), as the proxy is, as one fixed person (DEV_EMAIL). This is the one function that says who it is: our own sign-in (#10)
// replaces its body.
export type Staff = { ok: false } | { ok: true; email: string };
export const staffIdentity = cache(async (): Promise<Staff> => {
  if (adminReachable()) return { ok: true, email: DEV_EMAIL };
  const cfg = accessConfig();
  const token = (await headers()).get("cf-access-jwt-assertion");
  if (!cfg || !token) return { ok: false };
  const who = await verifyAccessJwt(token, cfg);
  return who ? { ok: true, email: who.email.toLowerCase() } : { ok: false };
});

// The first line of every dashboard action: anyone Access did not let in, or who has no dealer open (no membership, or not picked yet), gets
// nothing, as if the action were not there. Which dealer is checked against the directory (src/lib/tenancy/membership.ts).
// "choosing": the one action that runs before a dealer is open, the chooser's (src/app/dealers/actions.ts).
// A dealer whose plan has no dashboard (#173) has no action here either: their pages are the not found screen (src/app/layout.tsx).
export async function requireStaff(choosing?: "choosing"): Promise<void> {
  const { state } = await dealerAccess();
  if (state !== "ok" && !(choosing && state === "choose")) notFound();
  if (state === "ok" && !choosing && !(await hasModule("dashboard"))) notFound();
}
