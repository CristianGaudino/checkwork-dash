import Link from "next/link";
import { DetailsEdit } from "@/components/admin/BillingForms";
import { Badge, DataTable, Facts, PageHeader, Panel, adminButtonQuiet, tapArea } from "@/components/admin/kit";
import { listing, stockSource } from "@/lib/stock-source";
import { currentDealer } from "@/lib/tenancy/current";
import { dublinDay, fmtDay, fmtNum, plural } from "@/lib/admin/format";
import { can, currentMember } from "@/lib/permissions";
import { billingDetails, listBills } from "@/lib/billing/bills";
import { eur, fmtMonth, itemise, nextBillDate, type Bill, type BillingDetails } from "@/lib/billing/bills-rules";
import { PAID, PLAN, SERVICE_LABELS, VAT_PCT, capOf, planLines, round2, usageEstimate, withVat, type BillingSettings, type Scope } from "@/lib/billing/rules";
import { billingSettings, monthCounts, monthUsage } from "@/lib/billing/usage";
import { NotForRole } from "@/components/admin/NotForRole";

export const metadata = { title: "Billing" };

const USE_WORD: Record<Scope, [string, string]> = { lookup: ["lookup", "lookups"], history: ["check", "checks"], whatsapp: ["message", "messages"] };
const INCLUDED: Record<Scope, string> = { lookup: "lookups", history: "checks", whatsapp: "alerts" };

// Owners and managers only (the "billing" permission): without it the page is not there, whatever the menu showed.
// One page (#147): this month's bill with the one plan (#212), what is paid as you go, and the bills. The limits are in Settings.
export default async function Page() {
  if (!(await can("billing"))) return <NotForRole title="Billing" permission="billing" />;
  const [b, usage, counts, me, bills, details] = await Promise.all([billingSettings(), monthUsage(), monthCounts(), currentMember(), listBills(), billingDetails()]);
  const now = new Date();
  const today = dublinDay(now.getTime());
  const month = today.slice(0, 7);
  const allowance = PLAN.allowance;
  const plan = planLines(b, month); // the first month free is a line of its own
  const planEur = round2(plan.reduce((n, l) => n + l.eur, 0));
  const estimate = usageEstimate(counts, allowance, b, today);
  const total = withVat(round2(planEur + estimate));
  const lines: [string, number][] = [...plan.map((l) => [l.label, l.eur] as [string, number]), ["Pay as you go, by month end", estimate], [`VAT at ${VAT_PCT}%`, round2(total - planEur - estimate)]];
  // This month first, as it stands: its bill is issued on the 1st of next month.
  const rows: { id: string; bill?: Bill }[] = [{ id: month }, ...bills.map((bill) => ({ id: bill.id, bill }))];
  return (
    <>
      <PageHeader
        title="Billing"
        text="Your plan, this month's bill and your bills"
        actions={
          <Link href="/help?type=Billing&from=/billing" className={adminButtonQuiet}>
            Ask about my bill
          </Link>
        }
      />

      {/* What most people come for first: this month's bill, the total large and what it is made of beside it (#213). A question about it
          is the header's Ask about my bill, not a box of its own. */}
      <Panel title="This month's bill">
        <div className="@container">
          <div className="grid gap-x-10 gap-y-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] @2xl:items-center">
            <div>
              <p className="font-display text-[min(3.5rem,18cqi)] font-semibold leading-none tracking-[-0.03em] tabular-nums">{eur(total)}</p>
              <p className="mt-2 text-meta text-text-2">Estimate with {VAT_PCT}% VAT. Next bill on {nextBillDate(now)}</p>
            </div>
            <dl className="flex flex-col divide-y divide-hairline text-body">
              {lines.map(([label, n]) => (
                <div key={label} className="flex justify-between gap-4 py-2">
                  <dt>{label}</dt>
                  <dd className="whitespace-nowrap tabular-nums">{n < 0 ? `-${eur(-n)}` : eur(n)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 py-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{eur(total)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <p className="text-meta text-text-2">
          Your website, the dashboard, social and ads and everything else are included. {b.term === 2 ? "2-year" : "1-year"} contract, no setup fee. Prices before VAT.
        </p>
      </Panel>

      {/* Past what the plan includes each month, each use is paid. The limits are set in Settings, Monthly limits. */}
      <Panel
        title="Pay as you go"
        action={
          <Link href="/settings?section=limits" className={adminButtonQuiet}>
            Change limits
          </Link>
        }
      >
        <DataTable
          bare
          rows={PAID}
          rowKey={(s) => s}
          columns={[
            {
              key: "what",
              header: "What",
              cell: (s) => (
                <span className="flex flex-col">
                  <span className="font-medium">{SERVICE_LABELS[s]}</span>
                  <span className="text-meta text-text-2">
                    {plural(usage[s].count, USE_WORD[s][0], USE_WORD[s][1])}
                    {allowance[s] ? `, ${fmtNum(allowance[s])} ${INCLUDED[s]} included a month` : ""}
                  </span>
                </span>
              ),
            },
            { key: "spent", header: "Spent", align: "right", cell: (s) => eur(usage[s].costEur) },
            {
              key: "cap",
              header: "Limit",
              align: "right",
              cell: (s) => {
                const c = capOf(b, s);
                return c === undefined ? "None" : eur(c);
              },
            },
          ]}
        />
      </Panel>

      <Panel title="Bills">
        <DataTable
          bare
          rows={rows}
          rowKey={(x) => x.id}
          columns={[
            {
              key: "period",
              header: "Period",
              cell: (x) =>
                x.bill ? (
                  <Link href={`/billing/${x.id}`} className="font-medium underline-offset-2 hover:underline">
                    {fmtMonth(x.id)}
                  </Link>
                ) : (
                  <span className="font-medium">{fmtMonth(x.id)}</span>
                ),
            },
            { key: "total", header: "Total", align: "right", cell: (x) => eur(x.bill ? itemise(x.bill).total : total, true) },
            { key: "status", header: "Status", cell: ({ bill: x }) => (!x ? <Badge>Estimate</Badge> : x.status === "paid" ? <Badge tone="good">Paid</Badge> : <Badge tone="warn">Due {fmtDay(x.dueOn, "dayMonth")}</Badge>) },
          ]}
        />
        <p className="text-meta text-text-2">Paid by direct debit. Invoices are emailed as PDFs when each bill is issued.</p>
      </Panel>
      {/* Two short sets of details side by side on a wide screen, rather than two half-empty full-width cards. */}
      <div className="grid grid-cols-1 items-start gap-6 wide:grid-cols-2">
        <BillingDetailsPanel details={details} owner={me.role === "Owner"} />
        <SetForYou b={b} />
      </div>
    </>
  );
}

// Ours to set with the plan (the owner's program, docs/new-dealer.md): shown, never changed here. It was "Your plan" in Settings.
async function SetForYou({ b }: { b: BillingSettings }) {
  const [source, { site }, { profile }] = await Promise.all([stockSource(), listing(), currentDealer()]);
  const r = profile.rules;
  return (
    <Panel title="What we set for you" quiet>
      <Facts
        items={[
          ...(b.freeMonth ? [["First month free", fmtMonth(b.freeMonth)] as const] : []),
          ["Stock", source === "donedeal" ? `From ${site}` : "Kept here"],
          ["Old stock after", `${r.oldStockDays} days`],
          ["Price drop suggested", `€${r.slowDropEur}`],
          ["Sold cars stay on your website", `${r.soldVisibleDays} days`],
          ["Service due after a sale", `${r.serviceMonths} months`],
        ]}
      />
      <p className="text-meta text-text-2">
        <Link href={`/help?type=${encodeURIComponent("Request a change")}&from=/billing`} className={`font-medium text-accent-text underline underline-offset-2 ${tapArea}`}>Ask us to change them</Link>
      </p>
    </Panel>
  );
}

// The details bills are made out to, read first; the owner changes them in the house dialog (#141).
function BillingDetailsPanel({ details, owner }: { details: BillingDetails; owner: boolean }) {
  return (
    <Panel title="Billing details" action={owner ? <DetailsEdit details={details} /> : undefined}>
      <Facts
        items={[
          ["Company name", details.company || "Not set"],
          ["VAT number", details.vatNumber || "Not set"],
          ["Billing address", details.address || "Not set"],
          ["Email bills go to", details.email || "Not set", "[overflow-wrap:anywhere]"],
        ]}
      />
      {!owner && <p className="text-meta text-text-2">Only the owner can change these.</p>}
    </Panel>
  );
}
