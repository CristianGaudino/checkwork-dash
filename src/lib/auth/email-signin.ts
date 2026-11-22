import "server-only";
import { same } from "@/lib/cron";
import { appUrl, TIME_ZONE } from "@/lib/site";
import { membershipsOf } from "@/lib/tenancy/directory";
import { logSignIn } from "@/lib/log";
import { startSession } from "./session";
import { addAttempt, addFailure, clearFailures, endAllButNewest, endLive, ensureStaff, linkByHmac, lockCodes, markUsed, reserveLink, spendTry, staffByEmail, wrongTries, type Attempt, type Person } from "./attempts";
import { sendSignInMail } from "./mail";

// The emailed code and link (docs/sign-in.md, sections 3 and 5). The rows hold only HMACs (key: SIGN_IN_SECRET), never a code or a token.
// Every function takes `now` so tests can move time; nothing here logs an email, code or token.
const MIN = 60_000;
export const CODE_MS = 15 * MIN;
export const TRIES_PER_CODE = 5;
export const EMAILS_PER_15_MIN = 3;
export const EMAILS_PER_DAY = 10;
export const WRONG_PER_DAY = 15;
export const LOCK_MS = 24 * 60 * MIN;
export const FAILURES_IN_A_ROW = 100;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

// HMAC-SHA-256 with SIGN_IN_SECRET, hex. A missing secret fails closed: nothing can be sent or checked.
export async function hmac(input: string): Promise<string> {
  const secret = process.env.SIGN_IN_SECRET;
  if (!secret || secret.length < 16) throw new Error("SIGN_IN_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(input)));
}

// Six digits, every value equally likely (no modulo bias).
function sixDigits(): string {
  const limit = 4_294_000_000; // the largest multiple of a million in a Uint32
  let n: number;
  do n = crypto.getRandomValues(new Uint32Array(1))[0];
  while (n >= limit);
  return String(n % 1_000_000).padStart(6, "0");
}

// Codes are off for a person who is locked (15 wrong in a day), has had 100 wrong in a row, or whose rows already show 15 wrong tries in
// the last 24 hours (so a try still in flight when the lock was written cannot get in).
async function codesOff(p: Person, now: number): Promise<boolean> {
  return (p.codeLockedUntil?.getTime() ?? 0) > now || p.codeFailures >= FAILURES_IN_A_ROW || (await wrongTries(p.email, now)) >= WRONG_PER_DAY;
}

const linkUrl = (token: string, next: string) => `${appUrl()}/sign-in/link${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}#t=${token}`;
const footer = () => `The code and the link work once, for 15 minutes. If you did not ask to sign in, you can ignore this email.\nOnly type the code at ${new URL(appUrl()).host}. Checkwork will never ask you for it.`;

export type SendOutcome = "sent" | "link-only" | "limited" | "unknown";

// Everything about "Email me a code" that depends on the email, run after the answer (the answer is the same for every address). On a
// team and under the caps it writes a code row and a link row and sends one email; locked or with codes off, a link row and a link-only
// email (counted like any other); in every other case only a code row with no email and no code, so the code page behaves the same.
export async function sendSignIn({ email, browserHash, next }: { email: string; browserHash: string; next: string }, now = Date.now()): Promise<SendOutcome> {
  const id = crypto.randomUUID();
  const base: Attempt = { id, kind: "code", email: null, staffId: null, challenge: null, codeHmac: null, tokenHmac: null, browserHash, tries: 0, createdAt: new Date(now), expiresAt: new Date(now + CODE_MS), usedAt: null };
  if ((await membershipsOf(email)).length === 0) {
    await addAttempt(base);
    return "unknown";
  }
  const person = await ensureStaff(email, now);
  const token = random();
  const link: Attempt = { ...base, id: `${id}-link`, kind: "link", email, tokenHmac: await hmac(`link|${token}`) };
  // The caps are the write: the link row goes in only under them, and only then is anything sent. Over a cap, nothing is sent or ended.
  if (!(await reserveLink(link, now, 15 * MIN, EMAILS_PER_15_MIN, EMAILS_PER_DAY))) {
    await addAttempt(base);
    return "limited";
  }
  const off = await codesOff(person, now);
  const code = sixDigits();
  await addAttempt(off ? base : { ...base, email, codeHmac: await hmac(`code|${id}|${code}`) });
  await endAllButNewest(email, now); // parallel requests leave one live code and link
  const url = linkUrl(token, next);
  await sendSignInMail({
    to: email,
    subject: "Your Checkwork sign-in code",
    text: off
      ? `Codes are paused for your address after wrong tries. Use this link to sign in.\n\n${url}\n\n${footer()}`
      : `Your code is ${code.slice(0, 3)} ${code.slice(3)}\n\nOr open this link to sign in: ${url}\n\n${footer()}`,
  });
  return off ? "link-only" : "sent";
}

export type CodeResult = { ok: true; staffId: string; email: string } | { ok: false; countFor?: string };

// Checks a code typed in the browser that asked for it. The try is spent first, in one statement; only then is anything compared, in
// constant time. A row with no code (an unknown address, a limit, a lock) compares against a random value, so it takes the same work.
// A wrong code returns `countFor` (the email, if there is one) for countWrong(), which runs after the answer.
export async function checkCode(browserHash: string, code: string, now = Date.now()): Promise<CodeResult> {
  const row = await spendTry(browserHash, now, TRIES_PER_CODE);
  if (!row) return { ok: false };
  const given = await hmac(`code|${row.id}|${code}`);
  const dummy = await hmac(`none|${random()}`); // always made, so a row with no code does the same work
  const match = same(given, row.codeHmac ?? dummy);
  if (!match || !row.codeHmac || !row.email) return { ok: false, countFor: row.email ?? undefined };
  if (!(await markUsed(row.id, now))) return { ok: false }; // another post got there first
  // The lock is exact: the tries are on the rows already, so a match after the 15th wrong one is refused even if the lock is not written yet.
  const person = await staffByEmail(row.email);
  if (!person || (await codesOff(person, now)) || (await membershipsOf(row.email)).length === 0) return { ok: false };
  return { ok: true, staffId: person.id, email: row.email };
}

// After the answer to a wrong code: one more wrong in a row, and at the 15th in a day the address locks for 24 hours, its live codes end,
// and the person gets one warning.
export async function countWrong(email: string, now = Date.now()): Promise<void> {
  const person = await staffByEmail(email);
  if (!person) return;
  await addFailure(person.id);
  if ((await wrongTries(email, now)) < WRONG_PER_DAY || !(await lockCodes(person.id, now + LOCK_MS, now))) return;
  await endLive(email, ["code"], now);
  logSignIn({ step: "code", outcome: "locked" });
  await sendSignInMail({ to: email, subject: "Someone tried to sign in to Checkwork", text: "Someone tried to sign in to Checkwork as you. If it was not you, tell your manager." });
}

// The link's row, if it is live and its person is still at an active dealer. Looked up by the token's HMAC, which is then compared.
async function liveLink(token: string, now: number): Promise<Attempt | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const h = await hmac(`link|${token}`);
  const row = await linkByHmac(h, now);
  if (!row?.tokenHmac || !row.email || !same(row.tokenHmac, h) || (await membershipsOf(row.email)).length === 0) return null;
  return row;
}

// ci…a@gmail.com: the first two letters and the last of the name, and the whole domain.
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const name = email.slice(0, at);
  const shown = name.length >= 4 ? `${name.slice(0, 2)}…${name.slice(-1)}` : `${name.slice(0, 1)}…`;
  return shown + email.slice(at);
}

// Reads a link and changes nothing: who it would sign in, masked, or null for a used, expired or unknown one.
export async function peekLink(token: string, now = Date.now()): Promise<string | null> {
  const row = await liveLink(token, now);
  return row?.email ? maskEmail(row.email) : null;
}

// Uses a link, once. Does not touch the person's code (a separate row), and a lock does not stop it.
export async function spendLink(token: string, now = Date.now()): Promise<{ staffId: string; email: string } | null> {
  const row = await liveLink(token, now);
  if (!row?.email || !(await markUsed(row.id, now))) return null;
  const person = await staffByEmail(row.email);
  return person ? { staffId: person.id, email: row.email } : null;
}

// A sign-in by email: the run of wrong codes starts over, and the device gets a new session in place of any it had.
export async function completeSignIn(staffId: string, label: string, replacing: string | undefined, now = Date.now()): Promise<string> {
  await clearFailures(staffId);
  return startSession({ staffId, method: "email", label }, replacing, now);
}

// Every sign-in by email is told to the person (section 1).
export async function sendSignedInNotice(email: string, how: "code" | "link", label: string, now = Date.now()): Promise<void> {
  const when = new Intl.DateTimeFormat("en-IE", { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(",", "");
  await sendSignInMail({
    to: email,
    subject: "Signed in to Checkwork",
    text: `A device signed in to Checkwork with an email ${how} (${label}, ${when}). If it was not you, sign in, tap Sign out everywhere and check your passkeys.`,
  });
}
