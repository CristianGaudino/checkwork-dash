// Cloudflare Turnstile on the sign-in form that sends a code or link (docs/sign-in.md, section 3). Same check as the showroom's lead form.
// developers.cloudflare.com/turnstile/get-started/server-side-validation/
import { appUrl } from "@/lib/site";

// Answers true, or why it failed as fixed codes: Cloudflare's own, or ours. Never the token, the IP, the secret or the address.
export async function verifyTurnstile(token: string, ip: string, secret: string): Promise<true | string[]> {
  if (!token) return ["no-token"];
  if (token.length > 2048) return ["token-too-long"];
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    // A slow Cloudflare answer fails closed after 5 seconds.
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const j = (await res.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: unknown };
    // The hostname must be this deploy's own, so a token from the dev host cannot be used on production.
    const hostOk = j.hostname === new URL(appUrl()).hostname;
    if (j.success === true && j.action === "sign-in" && hostOk) return true;
    const given = Array.isArray(j["error-codes"]) ? j["error-codes"] : [];
    const codes = [...new Set(given.map((c): string => (CLOUDFLARE_CODES.includes(c) ? c : "other")))];
    if (j.success === true && j.action !== "sign-in") codes.push("action-mismatch"); // a real token, made for another form
    else if (j.success === true) codes.push("hostname-mismatch"); // a real token, made on another site
    return codes.length ? codes : ["rejected"];
  } catch {
    return ["siteverify-failed"]; // fail closed: no answer in time, no connection, or not JSON
  }
}

const CLOUDFLARE_CODES: unknown[] = ["missing-input-secret", "invalid-input-secret", "missing-input-response", "invalid-input-response", "invalid-widget-id", "invalid-parsed-secret", "bad-request", "timeout-or-duplicate", "internal-error"];

// With the secret set, the token must pass, wherever this runs. With none: skipped in `next dev`, tests and the E2E run (no keys there), and
// refused on a deployed Worker, so a missing secret never leaves the form open to scripts. Read on use: Worker secrets arrive per request.
export async function humanCheck(token: string, ip: string): Promise<"ok" | "failed" | "not-set-up"> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret) return (await verifyTurnstile(token, ip, secret)) === true ? "ok" : "failed";
  return process.env.NODE_ENV !== "production" || process.env.E2E_FAKE_BACKENDS === "1" ? "ok" : "not-set-up";
}
