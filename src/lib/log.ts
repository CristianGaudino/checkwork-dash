import type { LeadType } from "@/lib/leads/schema";

// The only logger in the lead path (src/lib/site-api/leads.ts). It takes the three allowed keys and builds the line from them by name, so
// nothing else can reach Workers Logs (D-08). Only failures are logged, at error level so they stand out.
export function logLead({ leadId, type, outcome }: { leadId?: string; type: LeadType; outcome: "notify_failed" | "mirror_failed" }): void {
  console.error(JSON.stringify({ leadId, type, outcome }));
}

// The site API's one line per request (src/lib/site-api): the route, the dealer's id (once the key named one), what happened and the answer's
// status. Built from those keys by name, so a key, a lead or anything personal can never reach Workers Logs.
export type SiteOutcome = "stored" | "duplicate" | "listed" | "no-key" | "rate" | "too-large" | "invalid" | "not-here" | "error";
export type SiteRoute = "leads" | "stock" | "drives" | "counts" | "photos";
export function logSite({ route, dealerId, outcome, status }: { route: SiteRoute; dealerId?: string; outcome: SiteOutcome; status: number }): void {
  const line = JSON.stringify({ site: route, dealerId, outcome, status });
  if (status >= 500) console.error(line);
  else console.log(line);
}

// Our sign-in's one line (docs/sign-in.md, section 5): a step and an outcome from fixed words, built by name, so an email, an IP, a code, a
// token, a cookie or a credential id can never reach Workers Logs. Steps 4 to 6 add their steps and outcomes here.
export type SignInStep = "sign-out";
export type SignInOutcome = "ok" | "bad-origin";
export function logSignIn({ step, outcome }: { step: SignInStep; outcome: SignInOutcome }): void {
  console.log(JSON.stringify({ signIn: step, outcome }));
}
