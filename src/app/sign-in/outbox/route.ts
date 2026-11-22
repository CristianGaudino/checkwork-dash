import { NextResponse } from "next/server";
import { outbox, outboxOn } from "@/lib/auth/mail";
import { signInOpen } from "@/lib/staff";

// The E2E run's mail (src/lib/auth/mail.ts): the messages sent to one address, newest last. Only with E2E_FAKE_BACKENDS=1 and no directory
// bound, so never on a deploy; otherwise, and while SIGN_IN is `access`, not there.
export async function GET(req: Request) {
  if (!outboxOn() || !(await signInOpen())) return new NextResponse(null, { status: 404 });
  const to = new URL(req.url).searchParams.get("to")?.toLowerCase();
  return NextResponse.json(outbox().filter((m) => m.to === to));
}
