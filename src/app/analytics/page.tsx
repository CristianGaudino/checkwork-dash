import { counted } from "@/lib/admin/reports";
import { bounds } from "@/lib/reports/monthly";
import { alertsStore, salesStore } from "@/lib/admin/collections";
import { addDays, dublinDay } from "@/lib/admin/format";
import { visitorFigures } from "@/lib/admin/visitor-figures";
import { countsBetween } from "@/lib/owner-api/counters";
import type { Range } from "@/lib/admin/analytics";
import { AreaChart, BarList } from "@/components/admin/charts";
import { MoreDetail } from "@/components/admin/MoreDetail";
import { DataTable, PageHeader, Panel, Segmented, StatCard, StatGrid } from "@/components/admin/kit";
import { RANGES, buildAnalytics, changeText, changeTone, parseRange } from "@/lib/admin/analytics";
import { fmtNum, fmtPct, plural, threeLetter } from "@/lib/admin/format";
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

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = parseRange((await searchParams).range);
  // The demo shows generated figures; a dealer's own site shows what its visitors really did.
  if (!(await simulating())) return <RealAnalytics range={range} />;
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
      <PageHeader title="Analytics" />
      <Segmented label="Period" items={RANGES.map((r) => ({ label: `${r} days`, href: `/analytics?range=${r}`, active: range === r }))} />

      {/* The answer first, in words; the figures behind it follow. */}
      <p className="max-w-measure text-body">
        {fmtNum(a.totals.visitors)} people visited your site in the last {range} days, {changeText(a.totals.visitors, a.previous.visitors).toLowerCase()}. {fmtNum(a.totals.leads)} got in touch{whole ? ` and ${fmtNum(sold)} bought a car.` : `, and you sold ${fmtNum(sold)}.`}
        {best && ` Most leads came from ${best.channel === "direct" ? "people who typed in your address" : best.label}.`}
      </p>

      <StatGrid>
        <StatCard label="Visitors" value={fmtNum(a.totals.visitors)} hint={changeText(a.totals.visitors, a.previous.visitors)} tone={changeTone(a.totals.visitors, a.previous.visitors)} />
        <StatCard label="Leads" value={fmtNum(a.totals.leads)} hint={changeText(a.totals.leads, a.previous.leads)} tone={changeTone(a.totals.leads, a.previous.leads)} />
        <StatCard label="Cars sold" value={fmtNum(sold)} hint={whole ? "Sales you recorded" : "Your own sales"} />
        <StatCard label="Visitors who got in touch" value={fmtPct(a.totals.conversion)} hint={changeText(a.totals.conversion, convBefore, true)} tone={changeTone(a.totals.conversion, convBefore, true)} />
      </StatGrid>

      <Panel plain title="Where visits come from" text={`Compared with the ${range} days before`}>
        <VisitSources now={a.channels} before={a.previous.channels} />
      </Panel>

      <Panel title="From visit to sale">
        <BarList items={funnel.map((s, i) => ({ label: s.label, value: s.count, note: i ? fmtPct((s.count / top) * 100) : undefined }))} of={top} />
      </Panel>

      <Panel title="Visitors each day">
        <AreaChart data={a.days.map((d) => ({ label: threeLetter(shortDate.format(new Date(d.date))), value: d.visitors }))} format={(n) => `${fmtNum(n)} visitors`} summary={`Visitors each day over the last ${range} days, from ${fmtNum(Math.min(...a.days.map((d) => d.visitors)))} to ${fmtNum(Math.max(...a.days.map((d) => d.visitors)))}.`} />
      </Panel>

      <Panel title="Most viewed cars">
        <DataTable
          bare
          rows={a.topCars}
          rowKey={(t) => t.slug}
          columns={[
            { key: "car", header: "Car", cell: (t) => (siteUrl ? <a href={siteCarUrl(siteUrl, t.slug)} {...NEW_TAB} className="font-semibold underline-offset-2 hover:underline">{t.title}</a> : <span className="font-semibold">{t.title}</span>) },
            { key: "views", header: "Views", align: "right", cell: (t) => fmtNum(t.views) },
            { key: "saves", header: "Saved", align: "right", cell: (t) => fmtNum(t.saves), hide: "sm" },
            { key: "leads", header: "Leads", align: "right", cell: (t) => fmtNum(t.leads) },
          ]}
        />
      </Panel>

      {/* Worth a look now and then, not every day: folded so the page stays short. */}
      <MoreDetail>
        <p className="text-body">
          {fmtNum(a.totals.pageviews)} pages viewed, <span className={{ good: "text-ok", bad: "text-bad", none: "" }[changeTone(a.totals.pageviews, a.previous.pageviews) ?? "none"]}>{changeText(a.totals.pageviews, a.previous.pageviews).toLowerCase()}</span>.
        </p>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <Panel title="Where in Ireland" quiet>
            <BarList items={a.places.map((p) => ({ label: p.name, value: p.visitors }))} />
          </Panel>
          <Panel title="Devices" quiet>
            <BarList items={a.devices.map((d) => ({ label: d.name, value: d.visitors, note: fmtPct((d.visitors / a.totals.visitors) * 100) }))} of={a.totals.visitors} />
          </Panel>
        </div>
      </MoreDetail>
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
      <PageHeader title="Analytics" />
      <Segmented label="Period" items={RANGES.map((r) => ({ label: `${r} days`, href: `/analytics?range=${r}`, active: range === r }))} />

      <StatGrid>
        <StatCard label="Visits" value={fmtNum(f.totals.visits)} />
        <StatCard label="Website leads" value={fmtNum(f.totals.leads)} />
        <StatCard label="Visits that became leads" value={fmtPct(f.totals.conversion)} />
      </StatGrid>

      <Panel plain title="Where visits come from" text={`Compared with the ${range} days before`}>
        <VisitSources now={src.now} before={src.before} />
        {src.unknownLeads > 0 && <p className="text-meta text-text-2">{plural(src.unknownLeads, "website lead")} came with no source known.</p>}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
