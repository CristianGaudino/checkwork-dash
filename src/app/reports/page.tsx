import { Suspense } from "react";
import { Bone, PanelBones, Skeleton, TextBones, TileBones } from "@/components/admin/Skeleton";
import { dealerProfile } from "@/lib/tenancy/current";
import { AreaChart, BarList } from "@/components/admin/charts";
import { ChevronDownIcon } from "@/components/stock/icons";
import { MoreDetail } from "@/components/admin/MoreDetail";
import { DataTable, EmptyState, PageHeader, Panel, StatCard, StatGrid, adminButtonQuiet } from "@/components/admin/kit";
import { ReportViews } from "./views";
import { getSettings, leadsStore, prepStore, salesStore } from "@/lib/admin/collections";
import { isSalesLead } from "@/lib/admin/leads";
import { carCosts } from "@/lib/admin/costs";
import { fmtEur, fmtNum, plural } from "@/lib/admin/format";
import { PERIODS, fullReport, monthLabel, personalReport, type Period } from "@/lib/admin/reports";
import { adminCars } from "@/lib/admin/stock-admin";
import { can, currentMember } from "@/lib/permissions";
import { NotForRole } from "@/components/admin/NotForRole";

export const metadata = { title: "Reports" };

// Who sees what (owner's decision, 2026-11-11): owners, managers and finance (the margins permission) see the whole dealership's report,
// profit included. A salesperson sees their own: counts only, no money, nobody else's. Anyone else, a page saying who it is for.
const now = () => Date.now();

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  if (!(await can("reports"))) return <NotForRole title="Reports" permission="reports" />;
  const asked = Number((await searchParams).period);
  const period: Period = (PERIODS as readonly number[]).includes(asked) ? (asked as Period) : 12;
  const whole = await can("margins");
  // The header and the periods first, so a tap on another period works from the first paint; the figures stream in under them (#109).
  return (
    <>
      <PageHeader
        title="Reports"
        text={whole ? `The last ${period} months, this one included` : `Your own figures, the last ${period} months, this one included`}
        actions={
          whole && (
            <a href={`/reports/export?period=${period}`} download className={adminButtonQuiet}>
              Export sales
            </a>
          )
        }
      />
      <ReportViews period={period} />
      <Suspense key={period} fallback={<FiguresBones />}>
        {whole ? <Full period={period} /> : <Personal period={period} />}
      </Suspense>
    </>
  );
}

function FiguresBones() {
  return (
    <Skeleton>
      <TextBones />
      <TileBones />
      <PanelBones title="Sales by month">
        <Bone className="h-48" />
      </PanelBones>
    </Skeleton>
  );
}

// The whole dealership's figures, profit included.
async function Full({ period }: { period: Period }) {
  const [sales, cars, leads, costs, prep, { team }, { rules }] = await Promise.all([salesStore.list(), adminCars(), (await leadsStore.list()).filter(isSalesLead), carCosts(), prepStore.list(), getSettings(), dealerProfile()]);
  const r = fullReport({ sales, cars, leads, team: team.map((t) => t.name), costs: new Map([...costs].map(([id, c]) => [id, c.total])), prep, period, now: now(), oldDays: rules.oldStockDays });
  const best = r.months.reduce((a, b) => (b.value > a.value ? b : a), r.months[0]);

  return (
    <>
      {/* The answer first, in words. */}
      <p className="max-w-measure text-body">
        You sold {plural(r.totals.sold, "car")} for {fmtEur(r.totals.value)}
        {r.totals.costed > 0 && (r.totals.costed === r.totals.sold ? <>, {fmtEur(r.totals.profit)} of it profit</> : <>, with {fmtEur(r.totals.profit)} profit on the {r.totals.costed} with a cost entered</>)}.{best && best.value > 0 && ` Your best month was ${monthLabel(best.month)}, at ${fmtEur(best.value)}.`}
      </p>
      <StatGrid>
        <StatCard label="Cars sold" value={fmtNum(r.totals.sold)} />
        {/* Returns are a line under Sales, not a tile of their own: a fifth tile sat alone on its row. */}
        <StatCard label="Sales" value={fmtEur(r.totals.value)} hint={r.returns.count > 0 ? `Not counting ${plural(r.returns.count, "return")}, ${fmtEur(r.returns.refundEur)} refunded` : undefined} />
        <StatCard label="Profit" value={fmtEur(r.totals.profit)} hint={r.totals.costed < r.totals.sold ? `On ${r.totals.costed} of ${r.totals.sold} cars with their cost entered` : "Less cost, prep and warranty repairs, before VAT"} />
        <StatCard label="Days to sell" value={r.totals.avgDaysToSell === null ? "None" : fmtNum(r.totals.avgDaysToSell)} hint="On average, from listing to sale" />
      </StatGrid>

      <div className="grid grid-cols-1 items-start gap-6 wider:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Sales by month">
          {r.totals.sold === 0 ? (
            <EmptyState compact title={`No sales in the last ${period} months`} text="Record a sale on a car and it shows here." />
          ) : (
            <>
              <AreaChart
                data={r.months.map((m) => ({ label: monthLabel(m.month), value: m.value }))}
                format={fmtEur}
                summary={`Sales each month over the last ${period} months, the most in ${monthLabel(best.month)} at ${fmtEur(best.value)}.`}
              />
              {/* The chart is the answer; the figures behind it are one tap away. */}
              <details className="group rounded-control border border-hairline px-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between py-2.5 text-body font-medium [&::-webkit-details-marker]:hidden">
                  Sales each month
                  <ChevronDownIcon aria-hidden="true" className="size-4 text-text-2 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pb-3">
                  <DataTable
                    bare
                    label="Sales by month"
                    rows={[...r.months].reverse()}
                    rowKey={(m) => m.month}
                    columns={[
                      { key: "month", header: "Month", cell: (m) => monthLabel(m.month), nowrap: true },
                      { key: "sold", header: "Cars sold", align: "right", hide: "sm", cell: (m) => fmtNum(m.sold) },
                      { key: "value", header: "Sales", align: "right", cell: (m) => fmtEur(m.value) },
                      { key: "profit", header: "Profit", align: "right", hide: "sm", cell: (m) => (m.costed ? fmtEur(m.profit) : <span className="text-text-2">Not costed</span>) },
                    ]}
                  />
                </div>
              </details>
            </>
          )}
        </Panel>
        <Panel title="Where the won leads came from">
          {r.sources.length ? <BarList items={r.sources.map((s) => ({ label: s.source, value: s.won, note: `of ${plural(s.leads, "lead")}, ${s.winRate}%` }))} /> : <p className="text-body text-text-2">No leads in this period.</p>}
        </Panel>
      </div>

      <Panel title="By salesperson" text="Leads won is out of all their leads">
        <DataTable
          bare
          label="By salesperson"
          rows={r.people}
          rowKey={(p) => p.name}
          empty={<p className="text-body text-text-2">No sales or leads in this period.</p>}
          columns={[
            { key: "name", header: "Name", cell: (p) => <span className="font-medium">{p.name}</span>, nowrap: true },
            { key: "sold", header: "Cars sold", align: "right", cell: (p) => fmtNum(p.sold) },
            { key: "value", header: "Sales", align: "right", hide: "sm", cell: (p) => fmtEur(p.value) },
            { key: "profit", header: "Profit", align: "right", hide: "md", cell: (p) => (p.costed ? fmtEur(p.profit) : <span className="text-text-2">Not costed</span>) },
            { key: "won", header: "Leads won", align: "right", hide: "sm", cell: (p) => `${p.won} of ${p.leads}` },
          ]}
        />
      </Panel>

      <MoreDetail>
        <div className="grid grid-cols-1 items-start gap-6 wider:grid-cols-2">
          <Panel title="Why leads were lost" quiet>
            {r.lost.length ? <BarList items={r.lost.map((x) => ({ label: x.reason, value: x.leads, note: `${Math.round((x.leads / r.lost.reduce((n, y) => n + y.leads, 0)) * 100)}% of lost leads` }))} /> : <p className="text-body text-text-2">No lost leads in this period.</p>}
          </Panel>
          <Panel title="Stock by age" quiet>
            <BarList items={r.stockAge.map((b) => ({ label: b.band, value: b.cars, note: fmtEur(b.value) }))} />
          </Panel>
          <Panel title="Prep spend" quiet>
            {r.prep.length ? <BarList format={fmtEur} items={r.prep.map((p) => ({ label: p.kind, value: p.eur, note: p.lines === 1 ? "1 job" : `${p.lines} jobs` }))} /> : <p className="text-body text-text-2">No prep costs in this period.</p>}
          </Panel>
        </div>
      </MoreDetail>
    </>
  );
}

// A salesperson's own figures: counts only.
async function Personal({ period }: { period: Period }) {
  const me = await currentMember();
  const [sales, leads] = await Promise.all([salesStore.list(), (await leadsStore.list()).filter(isSalesLead)]);
  const r = personalReport({ name: me.name, sales, leads, period, now: now() });
  return (
    <>
      <StatGrid>
        <StatCard label="Cars sold" value={fmtNum(r.totals.sold)} />
        <StatCard label="Leads" value={fmtNum(r.totals.leads)} />
        <StatCard label="Leads won" value={fmtNum(r.totals.won)} hint={`${r.totals.winRate}% of your leads`} />
        <StatCard href={`/leads?due=1&with=${encodeURIComponent(me.name)}`} label="Follow-ups due" value={fmtNum(r.totals.followUpsDue)} />
      </StatGrid>
      <Panel title="By month">
        <DataTable
          bare
          label="By month"
          rows={[...r.months].reverse()}
          rowKey={(m) => m.month}
          columns={[
            { key: "month", header: "Month", cell: (m) => monthLabel(m.month), nowrap: true },
            { key: "sold", header: "Cars sold", align: "right", cell: (m) => fmtNum(m.sold) },
            { key: "won", header: "Leads won", align: "right", cell: (m) => `${m.won} of ${m.leads}` },
          ]}
        />
      </Panel>
    </>
  );
}
