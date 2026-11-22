import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sameOrigin } from "@/lib/auth/gate";
import { endSession, endSessionsOf, endedSessionCookie, readSession } from "@/lib/auth/session";
import { logSignIn } from "@/lib/log";
import { signInOpen } from "@/lib/staff";

// Sign out (docs/sign-in.md, section 4): a POST from our own pages only (sameOrigin; Next checks no Origin on a route handler), never a GET.
// `everywhere=1` ends every session of the person, at every dealer; otherwise this device's. The cookie goes, and Clear-Site-Data empties
// the browser's cache of signed-in pages ("storage" is not sent: it would also remove the service worker and the device's notifications).
// A route handler, because a server action cannot send that header. Not there while SIGN_IN is `access` (signInOpen).
// shortcut: turning off notifications (this device's, or all of them for everywhere) comes with Settings, Your sign-in (steps 5 and 6).
export async function POST(req: Request) {
  if (!(await signInOpen())) return new NextResponse(null, { status: 404 });
  if (!sameOrigin(req)) {
    logSignIn({ step: "sign-out", outcome: "bad-origin" });
    return new NextResponse(null, { status: 403 });
  }
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (value) {
    const everywhere = (await req.formData().catch(() => null))?.get("everywhere") === "1";
    const s = everywhere ? await readSession(value) : null;
    if (s) await endSessionsOf(s.staffId);
    else await endSession(value);
  }
  logSignIn({ step: "sign-out", outcome: "ok" });
  const res = new NextResponse(null, { status: 303, headers: { Location: "/sign-in", "Clear-Site-Data": '"cache"' } });
  res.cookies.set(endedSessionCookie());
  return res;
}
