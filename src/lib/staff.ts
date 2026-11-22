import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { accessConfig, verifyAccessJwt } from "@/lib/access";
import { PATH_HEADER, appOpen, signInMode, signInPath } from "@/lib/auth/gate";
import { currentSession } from "@/lib/auth/session";
import { DEV_EMAIL } from "@/lib/tenancy/directory";
import { dealerAccess } from "@/lib/tenancy/membership";
import { hasModule } from "@/lib/modules";

// Who the dashboard is talking to, checked here and not trusted from a header. A server action runs on a POST to any page (Next 16), so
// the proxy's gate on the pages is not enough on its own: every dashboard action asks requireStaff() first. Who it is depends on SIGN_IN
// (src/lib/auth/gate.ts, docs/sign-in.md section 7): `access` (the default, and any unknown value) is the one Cloudflare Access signed for
// (its token, verified once a request); `both` is the same Access email, refused if a live session of ours names someone else; `own` is our
// session's person. Open in development and in a build that says so (the E2E run), as the proxy is, as one fixed person (DEV_EMAIL). Never
// with a real directory bound (the Worker): a deploy that set NEXT_PUBLIC_ADMIN_OPEN by mistake still needs a sign-in, so this check is the
// real gate. This is the one function that says who it is.
export type Staff = { ok: false } | { ok: true; email: string };
export const staffIdentity = cache(async (): Promise<Staff> => {
  if (appOpen()) return { ok: true, email: DEV_EMAIL };
  const mode = signInMode();
  if (mode === "own") {
    const s = await currentSession();
    return s ? { ok: true, email: s.email } : { ok: false };
  }
  const email = await accessEmail();
  if (email === null) return { ok: false };
  if (mode === "both") {
    const s = await currentSession(); // a dead cookie names nobody, so it is as if there were none
    if (s && s.email !== email) return { ok: false };
  }
  return { ok: true, email };
});

// The email Access signed for, or null with no valid token.
async function accessEmail(): Promise<string | null> {
  const cfg = accessConfig();
  const token = (await headers()).get("cf-access-jwt-assertion");
  if (!cfg || !token) return null;
  const who = await verifyAccessJwt(token, cfg);
  return who ? who.email.toLowerCase() : null;
}

// The sign-in pages and /sign-out, which the proxy gates by Access in access and both and lets through in own, check the mode again themselves: closed (404) under Access alone, so nothing
// of our sign-in is reachable while SIGN_IN is `access`; behind a valid Access token in `both`; open in `own`.
export async function signInOpen(): Promise<boolean> {
  const mode = signInMode();
  return mode === "own" || (mode === "both" && (await accessEmail()) !== null);
}

// A page load with no live session goes to sign in, and comes back to where it was after. Called by dealerAccess() (src/lib/tenancy/
// membership.ts), which every page, layout, store and permission check goes through, so a client-side navigation (which skips the root
// layout) is caught too. Only where our sign-in is on: under Access alone (the default) nothing changes, since the proxy already refused
// anyone Access did not let in. Only with a path from the proxy: a POST (a server action, a plain form) has an empty one and is not there
// (404, never a redirect: the caller is script), whichever page or store asked first; a page the proxy gives no path (the sign-in pages) has
// none, so it never loops. The path is the proxy's header, never the browser's (the proxy strips any other).
export async function toSignIn(): Promise<void> {
  if (signInMode() === "access" || appOpen()) return;
  const path = (await headers()).get(PATH_HEADER);
  if (path) redirect(signInPath(path));
  if (path === "") notFound();
}

// What the root layout draws (src/app/layout.tsx). "bare": a page the proxy gives no path (the sign-in pages, and the proxy's own 404), which
// has no PATH_HEADER: its own content with no dashboard frame, so a notFound() there answers 404 in every mode. "frame": as before.
export async function pageGate(): Promise<"bare" | "frame"> {
  return (await headers()).get(PATH_HEADER) === null ? "bare" : "frame";
}

// The first line of every dashboard action: anyone not signed in, or who has no dealer open (no membership, or not picked yet), gets
// nothing, as if the action were not there (a 404, never a redirect: the caller is script, not a person on a page). Which dealer is checked
// against the directory (src/lib/tenancy/membership.ts).
// "choosing": the one action that runs before a dealer is open, the chooser's (src/app/dealers/actions.ts).
// A dealer whose plan has no dashboard (#173) has no action here either: their pages are the not found screen (src/app/layout.tsx).
export async function requireStaff(choosing?: "choosing"): Promise<void> {
  const { state } = await dealerAccess();
  if (state !== "ok" && !(choosing && state === "choose")) notFound();
  if (state === "ok" && !choosing && !(await hasModule("dashboard"))) notFound();
}
