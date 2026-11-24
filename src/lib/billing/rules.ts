import { MODULES, MODULE_IDS, modulesValue, parseModules, type ModuleId } from "@/lib/modules-rules";

// What a dealer pays us, and the rules for the usage billed on top (#147, #181). Plain data and pure functions, so the Billing page, the
// meters and the tests agree. The prices are the demo's: a real site reads the dealer's own prices and bills from the owner's billing
// program, and these stand in until it does (docs/dealer-admin.md, Billing).

// Usage counted per use. Lookups and WhatsApp messages are billed past the plan's monthly allowance (allowanceFor); AI writing is fair
// use: counted, never billed, and stopped at our ceiling (AI_FAIR_USE).
const SERVICES = ["lookup", "ai", "whatsapp"] as const;
export type Service = (typeof SERVICES)[number];
export const SERVICE_LABELS: Record<Service, string> = { lookup: "Registration lookup", ai: "AI writing", whatsapp: "WhatsApp" };
export type Scope = Exclude<Service, "ai">; // what is billed per use, and so has a limit
export const PAID: Scope[] = ["lookup", "whatsapp"];

// What each use is, and its price. A lookup is on the website or in the dashboard; an AI action (a draft or an adjust) is counted by the
// model that wrote it, Premium (Claude Opus) or Standard (Claude Sonnet) (BillingSettings.aiModel); the dealer never sees which model or
// provider it is. A WhatsApp message is an alert or confirmation, a reply inside the 24 hours after a buyer writes, or a marketing message.
export const KINDS = {
  lookup: { website: "On the website", dashboard: "In the dashboard" },
  ai: { opus: "Premium", sonnet: "Standard" },
  whatsapp: { alert: "Alerts and confirmations", reply: "Replies to buyers", marketing: "Marketing messages" },
} as const satisfies Record<Service, Record<string, string>>;
export type Kind<S extends Service = Service> = keyof (typeof KINDS)[S] & string;
export const UNIT_PRICE_EUR: { [S in Service]: Record<Kind<S>, number> } = {
  lookup: { website: 0.3, dashboard: 0.3 },
  ai: { opus: 0, sonnet: 0 }, // fair use: never billed
  whatsapp: { alert: 0.05, reply: 0.03, marketing: 0.12 },
};
export type AiModel = "opus" | "sonnet";
// Our ceiling on AI writing, in actions a month.
export const AI_FAIR_USE = 500;

// The plans (#147), a month before VAT, for one dealership. Everything in a plan is included; the only add-on is Social and ads, at its
// own price until marketing is priced (#148). A setup fee for a plan with the website, none on a 2-year term.
// shortcut: one dealership only; the price per extra dealership comes back with multi-dealership (#16).
const WEBSITE_ONLY: ModuleId[] = ["tradeIn", "finance", "carFinder", "commercial", "lookupWebsite"];
const ADD_ON_EUR: Partial<Record<ModuleId, number>> = { social: 99 };
const ADD_ON_SETUP_EUR: Partial<Record<ModuleId, number>> = { social: 150 };
// The dashboard plan: every other module (reviews is in both: shown on the website, answered from the dashboard).
const DASHBOARD = MODULE_IDS.filter((m) => !WEBSITE_ONLY.includes(m) && !ADD_ON_EUR[m]);
export const PLANS: { id: string; label: string; modules: readonly ModuleId[]; eur: number; setupEur: number; allowance: Allowance }[] = [
  { id: "website", label: "Website", modules: [...WEBSITE_ONLY, "reviews"], eur: 149, setupEur: 500, allowance: { lookup: 25 } },
  { id: "dashboard", label: "Dashboard", modules: DASHBOARD, eur: 149, setupEur: 0, allowance: { lookup: 100, whatsapp: 500 } },
  { id: "both", label: "Website + Dashboard", modules: [...WEBSITE_ONLY, ...DASHBOARD], eur: 249, setupEur: 500, allowance: { lookup: 100, whatsapp: 500 } },
];
type Plan = (typeof PLANS)[number];

// The contract: 1 or 2 years. A record from before (#147) said "monthly", "annual" or "twoYear": read as 1, 1 and 2 years.
export type Term = 1 | 2;
export const termOf = (t: unknown): Term => (t === 2 || t === "twoYear" ? 2 : 1);
// What the price depends on besides the modules (BillingSettings has both). `freeMonth`: the dealer's first month, "YYYY-MM", free.
export type PlanOptions = { term: Term; freeMonth?: string };
const ONE_YEAR: PlanOptions = { term: 1 };

// The plan for these modules: the cheapest that holds them all (the add-ons aside), the add-ons on top, and the setup fee on this term.
// No modules is Website.
export function planFor(modules: Iterable<ModuleId>, o: PlanOptions = ONE_YEAR): { plan: Plan; extras: ModuleId[]; eur: number; setupEur: number; name: string } {
  const set = new Set(modules);
  const on = MODULE_IDS.filter((m) => set.has(m)); // the list's order, each once
  const extras = on.filter((m) => ADD_ON_EUR[m]);
  const plan = PLANS.find((p) => on.every((m) => ADD_ON_EUR[m] || p.modules.includes(m)))!; // cheapest first; the last holds every module
  const setupEur = o.term === 2 ? 0 : plan.setupEur + extras.reduce((n, m) => n + (ADD_ON_SETUP_EUR[m] ?? 0), 0);
  return { plan, extras, eur: plan.eur + extras.reduce((n, m) => n + ADD_ON_EUR[m]!, 0), setupEur, name: plan.label };
}
// Choosing a plan keeps the add-ons the dealer had. One that needs what the new plan lacks (Social on Website) cannot stay: it is
// dropped, and listed so the switch can say so.
export function switchPlan(modules: Iterable<ModuleId>, plan: Plan): { modules: Set<ModuleId>; dropped: ModuleId[] } {
  const { extras } = planFor(modules);
  const next = parseModules(modulesValue([...plan.modules, ...extras]));
  return { modules: next, dropped: extras.filter((m) => !next.has(m)) };
}
// The plan as bill lines for a month: the plan, each add-on, and on the dealer's first month a line that takes them off.
export function planLines(modules: Iterable<ModuleId>, o: PlanOptions = ONE_YEAR, month?: string): { label: string; eur: number }[] {
  const p = planFor(modules, o);
  return [
    { label: `${p.plan.label} plan`, eur: p.plan.eur },
    ...MODULES.filter((m) => p.extras.includes(m.id)).map((m) => ({ label: m.label, eur: ADD_ON_EUR[m.id]! })),
    ...(month && month === o.freeMonth ? [{ label: "First month free", eur: -p.eur }] : []),
  ];
}
// The plan's price for a month (the first one free), before VAT.
export const planEur = (modules: Iterable<ModuleId>, o: PlanOptions = ONE_YEAR, month?: string): number => planLines(modules, o, month).reduce((n, l) => n + l.eur, 0);
// What the plan includes each month before lookups and WhatsApp are billed.
export const allowanceFor = (modules: Iterable<ModuleId>, o: PlanOptions): Allowance => planFor(modules, o).plan.allowance;

export const VAT_PCT = 23;
export const withVat = (eur: number) => round2(eur * (1 + VAT_PCT / 100));
export const round2 = (n: number) => Math.round(n * 100) / 100;
// "€20", "€20.50": whole euros without cents, as the Billing page writes them; `cents` always shows them, as a bill does ("€200.00").
export const eur = (n: number, cents = !Number.isInteger(n)) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;

// One count a month per service, kind and place: a record per line of the bill, not one per use, so it never grows with traffic.
export type UsageCount = { id: string; month: string; service: Service; kind: string; count: number };
export const usageId = (month: string, service: Service, kind: string) => `${month}:${service}:${kind}`;

export type ServiceCost = { count: number; costEur: number; kinds: { kind: string; label: string; count: number; included: number; costEur: number }[] };
// What a plan includes a month, per service: lookups of either place and WhatsApp alerts (replies and marketing messages are always
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
const DEFAULT_CEILINGS: Partial<Record<Scope, number>> = { lookup: 15, whatsapp: 20 };
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
