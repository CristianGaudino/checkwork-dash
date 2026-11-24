import "server-only";
import { appUrl } from "@/lib/site";
import { logSignIn } from "@/lib/log";
import type { Dealer } from "@/lib/tenancy/directory";
import { reserveLink } from "./attempts";
import { EMAILS_PER_15_MIN, EMAILS_PER_HOUR } from "./email-signin";
import { signInMode } from "./gate";
import { sendSignInMail } from "./mail";

// The invitation (docs/sign-in.md, section 1): adding someone in Settings, Team is the only way in, and they get one email saying so. It
// carries no token, only the address of the sign-in page, so an old invitation in a mailbox can never sign anyone in. Sent by
// addTeamAction only, after the owner or manager check and once the person is on the team.
// Not while SIGN_IN is `access` (Access decides who gets in then, and nothing of our sign-in may change), and never from a demo dealer,
// which sends nothing outside. Counted in the address's email caps like every email we send (an `invite` row, section 5): over them, nothing
// is sent. Never throws, so the person stays added whatever happens to the email; the log line is fixed words only.
const MIN = 60_000;
export type InviteOutcome = "sent" | "off" | "limited" | "failed";

export async function sendInvitation({ email, by, dealer }: { email: string; by: string; dealer: Pick<Dealer, "name" | "demo"> }, now = Date.now()): Promise<InviteOutcome> {
  if (signInMode() === "access" || dealer.demo) return "off";
  try {
    const row = { id: crypto.randomUUID(), kind: "invite" as const, email, staffId: null, challenge: null, codeHmac: null, tokenHmac: null, browserHash: null, tries: 0, createdAt: new Date(now), expiresAt: new Date(now), usedAt: null };
    if (!(await reserveLink(row, now, 15 * MIN, EMAILS_PER_15_MIN, 60 * MIN, EMAILS_PER_HOUR))) {
      logSignIn({ step: "invite", outcome: "rate" });
      return "limited";
    }
    const name = dealer.name.replace(/[\r\n]+/g, " "); // a subject line is one line
    await sendSignInMail({ to: email, subject: `You have been added to ${name}`, text: `${by} added you to the ${name} team on Checkwork.\n\nSign in at ${appUrl()} with this email address.` });
    logSignIn({ step: "invite", outcome: "ok" });
    return "sent";
  } catch {
    logSignIn({ step: "invite", outcome: "send-failed" }); // never the error: its text can carry values
    return "failed";
  }
}
