// What a dealer pays us, and the rules for the usage billed on top (#147, #181). Plain data and pure functions, so the Billing page, the
// meters and the tests agree. The prices are the demo's: a real site reads the dealer's own prices and bills from the owner's billing
// program, and these stand in until it does (docs/dealer-admin.md, Billing).

// Usage counted per use. Lookups, history checks and WhatsApp messages are billed past the plan's monthly allowance (PLANS' `allowance`; none
// for history checks); AI writing is fair use: counted, never billed, and stopped at our ceiling (AI_FAIR_USE).
const SERVICES = ["lookup", "history", "ai", "whatsapp"] as const;
export type Service = (typeof SERVICES)[number];
export const SERVICE_LABELS: Record<Service, string> = { lookup: "Registration lookup", history: "History check", ai: "AI writing", whatsapp: "WhatsApp" };
export type Scope = Exclude<Service, "ai">; // what is billed per use, and so has a limit
export const PAID: Scope[] = ["lookup", "history", "whatsapp"];

// What each use is, and its price. A lookup is in the dashboard (the website has none, #182: a stored bill's "website" line keeps its
// label through itemise, and the demo's rebuilt bills have none). An AI action (a draft or an adjust) is counted by the model that wrote it, Premium (Claude Opus) or Standard (Claude
// Sonnet) (BillingSettings.aiModel); the dealer never sees which model or provider it is. A WhatsApp message is an alert or confirmation, a reply inside the 24 hours after a buyer writes, or a marketing message.
export const KINDS = {
  lookup: { dashboard: "In the dashboard" },
  history: { dashboard: "In the dashboard" },
  ai: { opus: "Premium", sonnet: "Standard" },
  whatsapp: { alert: "Alerts and confirmations", reply: "Replies to buyers", marketing: "Marketing messages" },
} as const satisfies Record<Service, Record<string, string>>;
export type Kind<S extends Service = Service> = keyof (typeof KINDS)[S] & string;
export const UNIT_PRICE_EUR: { [S in Service]: Record<Kind<S>, number> } = {
  lookup: { dashboard: 0.3 },
  history: { dashboard: 2.5 }, // TO CONFIRM against One Auto's price for a history check (#170): a placeholder until the owner has it
  ai: { opus: 0, sonnet: 0 }, // fair use: never billed
  whatsapp: { alert: 0.05, reply: 0.03, marketing: 0.12 },
};
export type AiModel = "opus" | "sonnet";
// Our ceiling on AI writing, in actions a month.
export const AI_FAIR_USE = 500;

// The plans (#147, #212), a month before VAT, for one dealership: the website, the dashboard, or both. Each is all-inclusive: no add-ons and
// no setup fee, and a plan with the dashboard has every part of it (social and ads, AI writing and the rest). The plan is a billing fact
// only: what a dealer sees never depends on it. Each month a plan with the dashboard includes some lookups and WhatsApp alerts; past
// that, usage is pay as you go. No plan includes a history check (#170): every one is billed.
// shortcut: one dealership only; the price per extra dealership comes back with multi-dealership (#16).
export type PlanId = "website" | "dashboard" | "both";
export const PLANS: Record<PlanId, { label: string; eur: number; allowance: Allowance }> = {
  website: { label: "Website", eur: 149, allowance: {} }, // no paid service on the website alone
  dashboard: { label: "Dashboard", eur: 149, allowance: { lookup: 100, whatsapp: 500 } },
  both: { label: "Website + Dashboard", eur: 249, allowance: { lookup: 100, whatsapp: 500 } },
};
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && Object.hasOwn(PLANS, v); // not `in`: "toString" is in every object

// The contract: 1 or 2 years. A record from before (#147) said "monthly", "annual" or "twoYear": read as 1, 1 and 2 years.
export type Term = 1 | 2;
export const termOf = (t: unknown): Term => (t === 2 || t === "twoYear" ? 2 : 1);
// What the price depends on (BillingSettings has both). `freeMonth`: the dealer's first month, "YYYY-MM", free.
export type PlanOptions = { term: Term; freeMonth?: string };

// The plan as bill lines for a month: the plan, and on the dealer's first month a line that takes it off.
export function planLines(plan: PlanId, o: PlanOptions, month?: string): { label: string; eur: number }[] {
  const p = PLANS[plan];
  return [{ label: `${p.label} plan`, eur: p.eur }, ...(month && month === o.freeMonth ? [{ label: "First month free", eur: -p.eur }] : [])];
}
// The plan's price for a month (the first one free), before VAT.
export const planEur = (plan: PlanId, o: PlanOptions, month?: string): number => planLines(plan, o, month).reduce((n, l) => n + l.eur, 0);

export const VAT_PCT = 23;
export const withVat = (eur: number) => round2(eur * (1 + VAT_PCT / 100));
export const round2 = (n: number) => Math.round(n * 100) / 100;
// "€20", "€20.50": whole euros without cents, as the Billing page writes them; `cents` always shows them, as a bill does ("€200.00").
export const eur = (n: number, cents = !Number.isInteger(n)) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;

// One count a month per service, kind and place: a record per line of the bill, not one per use, so it never grows with traffic.
export type UsageCount = { id: string; month: string; service: Service; kind: string; count: number };
export const usageId = (month: string, service: Service, kind: string) => `${month}:${service}:${kind}`;

export type ServiceCost = { count: number; costEur: number; kinds: { kind: string; label: string; count: number; included: number; costEur: number }[] };
// What a plan includes a month, per service: lookups and WhatsApp alerts (replies and marketing messages are always
// billed).
export type Allowance = Partial<Record<Service, number>>;
const allowanceCovers = (s: Service, kind: string) => s !== "whatsapp" || kind === "alert";
// Whether one more use (of `kind`, when known) is still inside the plan's allowance: it costs nothing, so no limit stops it. A WhatsApp use
// of unknown kind is not, as only alerts are included.
export function inAllowance(c: ReturnType<typeof usageCosts>, allowance: Allowance, s: Service, kind?: string): boolean {
  if (kind === undefined ? s === "whatsapp" : !allowanceCovers(s, kind)) return false;
  return (allowance[s] ?? 0) > c[s].kinds.reduce((n, k) => n + (k.included ?? 0), 0);
}
// What the month's usage costs: each kind's uses past what the allowance still has, in the order of KINDS.
export function usageCosts(counts: Pick<UsageCount, "service" | "kind" | "count">[], allowance: Allowance): Record<Service, ServiceCost> & { totalEur: number } {
  const out = Object.fromEntries(SERVICES.map((s) => [s, { count: 0, costEur: 0, kinds: [] as ServiceCost["kinds"] }])) as Record<Service, ServiceCost>;
  for (const s of SERVICES) {
    let left = allowance[s] ?? 0;
    for (const kind of Object.keys(KINDS[s]) as Kind[]) {
      const count = counts.filter((c) => c.service === s && c.kind === kind).reduce((n, c) => n + c.count, 0);
      const included = allowanceCovers(s, kind) ? Math.min(left, count) : 0;
      left -= included;
      const costEur = round2((count - included) * (UNIT_PRICE_EUR[s] as Record<string, number>)[kind]);
      out[s].kinds.push({ kind, label: (KINDS[s] as Record<string, string>)[kind], count, included, costEur });
      out[s].count += count;
      out[s].costEur = round2(out[s].costEur + costEur);
    }
  }
  return { ...out, totalEur: round2(SERVICES.reduce((n, s) => n + out[s].costEur, 0)) };
}

// The dealer's own limits, and ours. `ceilings` are set by us per dealer; a dealer's limit can be lower, never higher. A record from before
// #147 may still carry `alerts`, `alertAt80`, `branches`, `brands` and a "total" limit: nothing reads them.
export type BillingSettings = {
  caps: Partial<Record<Scope, number>>;
  ceilings: Partial<Record<Scope, number>>;
  aiModel: AiModel;
  // Set from the owner's program, as the ceilings: the contract's years, and the dealer's first month (free).
  term: Term;
  freeMonth?: string;
};
// Every site starts with our limits past the allowance, so no paid service runs without one; the dealer can set lower, and the owner's
// program can set others per dealer.
const DEFAULT_CEILINGS: Partial<Record<Scope, number>> = { lookup: 15, history: 25, whatsapp: 20 };
export const BILLING_DEFAULT: BillingSettings = { caps: {}, ceilings: DEFAULT_CEILINGS, aiModel: "opus", term: 1 };
// A stored record over the defaults, the ceilings merged one level down: a record saved before a default ceiling existed still gets it.
export const withBillingDefaults = (b?: Partial<BillingSettings>): BillingSettings => ({ ...BILLING_DEFAULT, ...b, ceilings: { ...BILLING_DEFAULT.ceilings, ...b?.ceilings }, term: termOf(b?.term) });

// The limit in force: the lower of the dealer's and ours, or none.
export function capOf(b: BillingSettings, scope: Scope): number | undefined {
  const set = [b.caps[scope], b.ceilings[scope]].filter((n): n is number => typeof n === "number" && n >= 0);
  return set.length ? Math.min(...set) : undefined;
}
// Whether one more use of `service` is allowed this month: a paid one under its limit, AI writing under our fair use.
export function withinCaps(c: ReturnType<typeof usageCosts>, b: BillingSettings, service: Service): boolean {
  if (service === "ai") return c.ai.count < AI_FAIR_USE;
  const cap = capOf(b, service);
  return cap === undefined || c[service].costEur < cap;
}

// The notice a change in usage sets off: a limit reached between `before` and `after`. Each has a key, so it is sent once a month.
// `text`: what happened, as the bell's heading; `detail`: which service and how much, under it.
export type Alert = { key: string; scope: Scope; text: string; detail: string };
export function alertsCrossed(before: ReturnType<typeof usageCosts>, after: ReturnType<typeof usageCosts>, b: BillingSettings, month: string): Alert[] {
  return PAID.flatMap((s) => {
    const cap = capOf(b, s);
    if (cap === undefined || cap <= 0 || before[s].costEur >= cap || after[s].costEur < cap) return [];
    return [{ key: `${month}:${s}:cap:${cap}`, scope: s, text: "Monthly limit reached", detail: `${SERVICE_LABELS[s]}: ${eur(cap)} used, paid use stopped until next month` }];
  });
}

// The month to date, a whole month at the same pace: an estimate, always shown as one.
// `today`: the dealer's day, "YYYY-MM-DD" in Dublin time, the same calendar the usage months are counted in.
export function monthEndEstimate(sofarEur: number, today: string): number {
  const [y, m, day] = today.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return round2((sofarEur / day) * days);
}

// The month's usage at month end: each count at its pace, less the allowance, each service stopped at its own limit; never less than what
// is already spent (a limit lowered mid-month).
export function usageEstimate(counts: UsageCount[], allowance: Allowance, b: BillingSettings, today: string): number {
  const now = usageCosts(counts, allowance);
  const pace = usageCosts(counts.map((c) => ({ ...c, count: Math.round(monthEndEstimate(c.count, today)) })), allowance);
  return round2(PAID.reduce((sum, s) => sum + Math.max(now[s].costEur, Math.min(pace[s].costEur, capOf(b, s) ?? Infinity)), 0));
}
