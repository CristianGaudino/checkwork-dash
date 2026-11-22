import "server-only";
import { getBindings } from "@/lib/leads/bindings";
import { SIGN_IN_FROM_EMAIL } from "@/lib/site";

// Sign-in email goes through the Worker's EMAIL binding, from noreply@checkwork.ie (docs/sign-in.md, section 3). The E2E run has no mail:
// with E2E_FAKE_BACKENDS=1 and no directory bound (the same rule as the in-memory directory, which the Worker never meets) the message is
// kept in memory, where e2e/sign-in.spec.ts reads it through /sign-in/outbox. Never on a deploy: the Worker has the directory bound.
export type Mail = { to: string; subject: string; text: string };
export const outboxOn = () => process.env.E2E_FAKE_BACKENDS === "1" && !getBindings().DIRECTORY;
const held = globalThis as { __checkworkOutbox?: Mail[] };
export const outbox = () => (held.__checkworkOutbox ??= []);

export async function sendSignInMail(m: Mail): Promise<void> {
  if (outboxOn()) {
    outbox().push(m);
    if (outbox().length > 100) outbox().shift();
    return;
  }
  const email = getBindings().EMAIL;
  if (!email) throw new Error("Missing binding EMAIL");
  await email.send({ ...m, from: SIGN_IN_FROM_EMAIL });
}
