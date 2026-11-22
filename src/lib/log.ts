import type { LeadType } from "@/lib/leads/schema";

// The only logger in the lead path (src/lib/site-api/leads.ts). It takes the three allowed keys and builds the line from them by name, so
// nothing else can reach Workers Logs (D-08). Only failures are logged, at error level so they stand out.
export function logLead({ leadId, type, outcome }: { leadId?: string; type: LeadType; outcome: "notify_failed" | "mirror_failed" }): void {
  console.error(JSON.stringify({ leadId, type, outcome }));
}

// The site API's one line per request (src/lib/site-api): the route, the dealer's id (once the key named one), what happened and the answer's
// status. Built from those keys by name, so a key, a lead or anything personal can never reach Workers Logs.
export type SiteOutcome = "stored" | "duplicate" | "listed" | "no-key" | "rate" | "too-large" | "invalid" | "not-here" | "error";
export function logSite({ route, dealerId, outcome, status }: { route: "leads" | "stock" | "photos"; dealerId?: string; outcome: SiteOutcome; status: number }): void {
  const line = JSON.stringify({ site: route, dealerId, outcome, status });
  if (status >= 500) console.error(line);
  else console.log(line);
}
