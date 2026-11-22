"use server";

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ATTEMPT_COOKIE, SESSION_COOKIE, attemptCookie, originOk, safeNext } from "@/lib/auth/gate";
import { checkCode, completeSignIn, countWrong, hmac, peekLink, sendSignIn, sendSignedInNotice, spendLink } from "@/lib/auth/email-signin";
import { sessionCookie } from "@/lib/auth/session";
import { getBindings } from "@/lib/leads/bindings";
import { logSignIn, type SignInOutcome, type SignInStep } from "@/lib/log";
import { deviceLabel } from "@/lib/push";
import { signInOpen } from "@/lib/staff";
import { hashSiteKey as sha256Hex } from "@/lib/tenancy/directory";

// Our sign-in's actions for the email code and link (docs/sign-in.md, sections 3 to 5). Each starts the same way: not there while SIGN_IN is
// `access` (404), Origin present and ours (Next lets a POST with none through), then the per-IP limit. Answers never say whether an address
// is on a team: the work that depends on the email runs in after().
export type FormState = { error?: string } | undefined;
const RATE_ERROR = "Too many tries. Wait a minute and try again.";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

async function guard(step: SignInStep): Promise<boolean> {
  if (!(await signInOpen())) notFound();
  const h = await headers();
  if (!originOk(h.get("origin"))) {
    logSignIn({ step, outcome: "bad-origin" });
    notFound();
  }
  const limiter = getBindings().SIGN_IN_LIMITER;
  const ok = !limiter || (await limiter.limit({ key: await hmac(`ip|${h.get("cf-connecting-ip") ?? ""}`) })).success;
  if (!ok) logSignIn({ step, outcome: "rate" });
  return ok;
}
const done = (step: SignInStep, outcome: SignInOutcome) => logSignIn({ step, outcome });

// "Email me a code": the same work, cookie and answer for every address.
const RequestInput = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()), next: z.string().max(500).optional() });
export async function requestCode(_prev: FormState, data: FormData): Promise<FormState> {
  if (!(await guard("email"))) return { error: RATE_ERROR };
  const input = RequestInput.safeParse({ email: data.get("email"), next: data.get("next") ?? undefined });
  if (!input.success) return { error: "Enter your email address." };
  const next = safeNext(input.data.next);
  const value = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const browserHash = await sha256Hex(value);
  (await cookies()).set(attemptCookie(value));
  after(async () => {
    try {
      const outcome = await sendSignIn({ email: input.data.email, browserHash, next });
      done("email", outcome === "unknown" ? "no-dealer" : outcome === "limited" ? "rate" : outcome === "link-only" ? "locked" : "ok");
    } catch {
      done("email", "send-failed"); // never the error: its text can carry values
    }
  });
  redirect(`/sign-in/code${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`);
}

const session = async (staffId: string, how: "code" | "link", email: string, next: string | undefined): Promise<never> => {
  const jar = await cookies();
  const label = deviceLabel((await headers()).get("user-agent") ?? "");
  jar.set(sessionCookie(await completeSignIn(staffId, label, jar.get(SESSION_COOKIE)?.value)));
  jar.set({ ...attemptCookie(""), maxAge: 0 });
  after(() => sendSignedInNotice(email, how, label).catch(() => done("session", "send-failed")));
  done(how, "ok");
  redirect(safeNext(next));
};

// A code typed in the browser that asked for it.
const CodeInput = z.object({ code: z.string().transform((s) => s.replace(/\s/g, "")).pipe(z.string().regex(/^\d{6}$/)), next: z.string().max(500).optional() });
export async function submitCode(_prev: FormState, data: FormData): Promise<FormState> {
  if (!(await guard("code"))) return { error: RATE_ERROR };
  const wrong: FormState = { error: "That code did not work. Check it, or ask for a new one." };
  const input = CodeInput.safeParse({ code: data.get("code"), next: data.get("next") ?? undefined });
  const value = (await cookies()).get(ATTEMPT_COOKIE)?.value;
  if (!input.success || !value || !TOKEN.test(value)) return wrong;
  const result = await checkCode(await sha256Hex(value), input.data.code);
  if (!result.ok) {
    const email = result.countFor;
    if (email) after(() => countWrong(email).catch(() => done("code", "send-failed")));
    done("code", "wrong-code");
    return wrong;
  }
  return session(result.staffId, "code", result.email, input.data.next);
}

// The link page, step one: who would it sign in? Changes nothing.
export type PeekResult = { email: string } | { expired: true };
export async function peekSignInLink(token: string): Promise<PeekResult> {
  if (!(await guard("link"))) return { expired: true };
  const email = TOKEN.test(token) ? await peekLink(token) : null;
  done("link", email ? "ok" : "expired");
  return email ? { email } : { expired: true };
}

// Step two, the button: only this uses the token.
export async function signInWithLink(token: string, next: string | undefined): Promise<PeekResult> {
  if (!(await guard("link"))) return { expired: true };
  const who = TOKEN.test(token) ? await spendLink(token) : null;
  if (!who) {
    done("link", "expired");
    return { expired: true };
  }
  return session(who.staffId, "link", who.email, next);
}
