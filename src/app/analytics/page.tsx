import { Suspense } from "react";
import { Bone, LineBone, PanelBones, Skeleton, TextBones, TileBones } from "@/components/admin/Skeleton";
import { Fresh } from "@/components/Tween";
import { counted } from "@/lib/admin/reports";
import { bounds } from "@/lib/reports/monthly";
import { alertsStore, salesStore } from "@/lib/admin/collections";
import { addDays, dublinDay } from "@/lib/admin/format";
import { visitorFigures } from "@/lib/admin/visitor-figures";
import { countsBetween } from "@/lib/owner-api/counters";
import type { Range } from "@/lib/admin/analytics";
import { AreaChart, BarList } from "@/components/admin/charts";
import { DataTable, PageHeader, Panel, Segmented, StatCard, StatGrid } from "@/components/admin/kit";
import { RANGES, buildAnalytics, changeText, changeTone, parseRange } from "@/lib/admin/analytics";
import { fmtCompact, fmtNum, fmtPct, plural, threeLetter } from "@/lib/admin/format";
import { leadsStore } from "@/lib/admin/collections";
import { adminCars } from "@/lib/admin/stock-admin";
import { simulating } from "@/lib/integrations";
import { currentMember } from "@/lib/permissions";
import { roleCan } from "@/lib/permission-rules";
import { carName, siteCarUrl } from "@/lib/stock/format";
import { dealerProfile } from "@/lib/tenancy/current";
import { NEW_TAB } from "@/components/ui";
import { forSale } from "@/lib/stock/types";
import { VisitSources } from "@/components/admin/VisitSources";
import { sourceTiles, visitWindows } from "@/lib/admin/visit-sources";
import { realVisitSources } from "@/lib/admin/visit-sources-load";


export const metadata = { title: "Analytics" };

const shortDate = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", timeZone: "UTC" });

// The header and the period first, so a tap on another period works from the first paint; the figures stream in under them (#109).
export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = parseRange((await searchParams).range);
  const demo = await simulating(); // the directory's flag, already read for this request: which of the two pages the bones are
  return (
    <>
      <PageHeader title="Analytics" />
      <Segmented label="Period" items={RANGES.map((r) => ({ label: `${r} days`, href: `/analytics?range=${r}`, active: range === r }))} />
      <Suspense key={range} fallback={<FiguresBones demo={demo} />}>
        <Fresh className="flex flex-col gap-6">
          <Figures range={range} demo={demo} />
        </Fresh>
      </Suspense>
    </>
  );
}

// The shape of Figures (the demo's generated figures) or of RealAnalytics, so nothing moves when it lands.
function FiguresBones({ demo }: { demo: boolean }) {
  const sources = (
    <PanelBones plain title="Where visits come from" text>
      <TileBones />
    </PanelBones>
  );
  if (!demo) {
    return (
      <Skeleton>
        <TileBones count={3} lead />
        {sources}
        <div className="grid grid-cols-1 gap-6 wide:grid-cols-2">
          {["Searches with no cars to show", "Prices people look at", "Filters people use", "Finance"].map((t) => <PanelBones key={t} title={t} />)}
        </div>
      </Skeleton>
    );
  }
  return (
    <Skeleton>
      <TextBones />
      <TileBones lead />
      {sources}
      <PanelBones title="From visit to sale" />
      <PanelBones title="Visitors each day">
        <div className="flex flex-col gap-2">
          <Bone className="h-44" />
          <LineBone className="h-3.5 w-full" />
        </div>
      </PanelBones>
    </Skeleton>
  );
}

async function Figures({ range, demo }: { range: Range; demo: boolean }) {
  // The demo shows generated figures; a dealer's own site shows what its visitors really did.
  if (!demo) return <RealAnalytics range={range} />;
  const [all, leads, allSales, me, { siteUrl }] = await Promise.all([adminCars(), leadsStore.list(), salesStore.list(), currentMember(), dealerProfile()]);
  // As on Reports (owner's decision): the roles allowed margins see the dealership's sales; a salesperson sees their own.
  const whole = roleCan(me.role, "margins");
  const sales = whole ? allSales : allSales.filter((s) => s.salesperson === me.name);
  const cars = all.filter(forSale).map((c) => ({ slug: c.slug, title: carName(c) }));
  const a = buildAnalytics({ range, cars, leadTimes: leads.filter(counted).map((l) => l.createdAt) }); // spam is no lead (#56)
  const convBefore = a.previous.visitors ? (a.previous.leads / a.previous.visitors) * 100 : 0;
  const top = a.funnel[0].count;
  // Cars sold is the sales recorded in the period (as Reports counts them), never a generated figure; the funnel ends on the same number.
  const from = addDays(dublinDay(), -range);
  const sold = sales.filter((s) => !s.returnedOn && s.soldOn > from).length;
  // The funnel is the dealership's: its last step only for those who see every sale, never one person's sales under it.
  const funnel = whole ? a.funnel.map((s, i, f) => (i === f.length - 1 ? { ...s, count: Math.min(sold, f[i - 1]?.count ?? sold) } : s)) : a.funnel.slice(0, -1);
  const best = sourceTiles(a.channels, a.previous.channels).find((t) => t.best);

  return (
    <>
      {/* The answer first, in words; the figures behind it follow. */}
      <p className="max-w-measure text-body">
        {fmtCompact(a.totals.visitors)} people visited your site in the last {range} days, {changeText(a.totals.visitors, a.previous.visitors).toLowerCase()}. {fmtCompact(a.totals.leads)} got in touch{whole ? ` and ${fmtCompact(sold)} bought a car.` : `, and you sold ${fmtCompact(sold)}.`}
        {best && ` Most leads came from ${best.channel === "direct" ? "people who typed in your address" : best.label}.`}
      </p>

      <StatGrid>
        <StatCard lead label="Leads" value={fmtCompact(a.totals.leads)} hint={changeText(a.totals.leads, a.previous.leads)} tone={changeTone(a.totals.leads, a.previous.leads)} />
        <StatCard label="Visitors" value={fmtCompact(a.totals.visitors)} hint={changeText(a.totals.visitors, a.previous.visitors)} tone={changeTone(a.totals.visitors, a.previous.visitors)} />
        <StatCard label="Cars sold" value={fmtCompact(sold)} hint={whole ? "Sales you recorded" : "Your own sales"} />
        <StatCard label="Visitors who got in touch" value={fmtPct(a.totals.conversion)} hint={changeText(a.totals.conversion, convBefore, true)} tone={changeTone(a.totals.conversion, convBefore, true)} />
      </StatGrid>

      <Panel title="Where visits come from" text={`Compared with the ${range} days before`}>
        <VisitSources now={a.channels} before={a.previous.channels} />
      </Panel>

      <Panel title="From visit to sale">
        <BarList items={funnel.map((s, i) => ({ label: s.label, value: s.count, note: i ? fmtPct((s.count / top) * 100) : undefined }))} of={top} />
      </Panel>

      <Panel title="Visitors each day">
        <AreaChart data={a.days.map((d) => ({ label: threeLetter(shortDate.format(new Date(d.date))), value: d.visitors }))} format={(n) => `${fmtCompact(n)} visitors`} empty="No visitors in this period" summary={`Visitors each day over the last ${range} days, from ${fmtCompact(Math.min(...a.days.map((d) => d.visitors)))} to ${fmtCompact(Math.max(...a.days.map((d) => d.visitors)))}.`} />
      </Panel>

      <Panel title="Most viewed cars">
        <DataTable
          bare
          rows={a.topCars}
          rowKey={(t) => t.slug}
          columns={[
            {
              key: "car",
              header: "Car",
              cell: (t) => (
                <>
                  {siteUrl ? <a href={siteCarUrl(siteUrl, t.slug)} {...NEW_TAB} className="font-semibold underline-offset-2 hover:underline">{t.title}</a> : <span className="font-semibold">{t.title}</span>}
                  {/* On a phone the figures move under the name, so the car keeps the width. */}
                  <span className="block text-meta text-text-2 tabular-nums sm:hidden">{plural(t.views, "view")} · {plural(t.leads, "lead")}</span>
                </>
              ),
            },
            { key: "views", header: "Views", align: "right", cell: (t) => fmtNum(t.views), hide: "sm" },
            { key: "saves", header: "Saved", align: "right", cell: (t) => fmtNum(t.saves), hide: "sm" },
            { key: "leads", header: "Leads", align: "right", cell: (t) => fmtNum(t.leads), hide: "sm" },
          ]}
        />
      </Panel>

    </>
  );
}

const today = () => Date.now(); // lint: a page may not call Date.now directly
const none = <p className="text-meta text-text-2">None in this period.</p>;

async function RealAnalytics({ range }: { range: Range }) {
  const now = today();
  const w = visitWindows(range, now); // the same Irish days as Where visits come from
  const { from, to } = w;
  const [start] = bounds(from, to);
  // The window before is read at the same time; this period's counts are passed in, so nothing is read twice.
  const [{ features }, everyLead, alerts, before] = await Promise.all([countsBetween(from, to), leadsStore.list(), alertsStore.list(), countsBetween(w.beforeFrom, w.beforeTo)]);
  const leads = everyLead.filter(counted); // spam is no lead here either (#56)
  const f = visitorFigures({ counts: features, leads: leads.filter((l) => l.createdAt >= start), alerts });
  const src = await realVisitSources(range, now, leads, features, before.features);

  return (
    <>
      <StatGrid>
        <StatCard lead label="Website leads" value={fmtCompact(f.totals.leads)} />
        <StatCard label="Visits" value={fmtCompact(f.totals.visits)} />
        <StatCard label="Visits that became leads" value={fmtPct(f.totals.conversion)} />
      </StatGrid>

      <Panel title="Where visits come from" text={`Compared with the ${range} days before`}>
        <VisitSources now={src.now} before={src.before} />
        {src.unknownLeads > 0 && <p className="text-meta text-text-2">{plural(src.unknownLeads, "website lead")} came with no source known.</p>}
      </Panel>

      <div className="grid grid-cols-1 gap-6 wide:grid-cols-2">
        <Panel title="Searches with no cars to show" count={f.noResults.count}>
          {f.noResults.makes.length ? <BarList items={f.noResults.makes} /> : none}
        </Panel>
        <Panel title="Prices people look at">{f.bands.length ? <BarList items={f.bands} /> : none}</Panel>
        <Panel title="Filters people use">{f.filters.length ? <BarList items={f.filters} /> : none}</Panel>
        <Panel title="Finance">
          <BarList items={[{ label: "Used the calculator", value: f.finance.calculator }, { label: "Applied", value: f.finance.applications }]} />
        </Panel>
      </div>

      <Panel title="Alerts on each car">
        {f.alertsPerCar.length ? <BarList items={f.alertsPerCar} /> : <p className="text-meta text-text-2">No one is waiting on a price drop or a car coming back.</p>}
      </Panel>

      <p className="text-meta text-text-2">A visit counts once, from its first page. Nothing here says who a visitor is.</p>
    </>
  );
}
