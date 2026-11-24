import Link from "next/link";
import { Badge, DataTable, EmptyState, PageHeader, SummaryTabs, TableFooter, TableToolbar, pageOf, rowButton, rowDanger, sortRows, type Column, type FilterGroup } from "@/components/admin/kit";
import { filterAlerts, filterCustomers } from "@/lib/admin/customer-lists";
import { ActButton } from "@/components/admin/ActButton";
import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { hasModule } from "@/lib/modules";
import { ALERT_KINDS, ALERT_KIND_LABELS, alertsStore, claimOpen, claimsStore, customersStore, orderOpen, ordersStore, reservationsStore, salesStore, type Customer, type StockAlert } from "@/lib/admin/collections";
import { stockSource } from "@/lib/stock-source";
import { fmtAgo, fmtDate, fmtNum } from "@/lib/admin/format";
import { pauseAlertAction, removeAlertAction } from "./actions";
import { CallButton } from "@/components/admin/LeadActions";
import { RowMenu } from "@/components/admin/RowMenu";
import { BrandName } from "@/components/admin/BrandIcon";

export const metadata = { title: "Customers" };

// The customer list is the sales module; stock alerts are the "newsletter" module (its id kept for stored plans), where visitors sign up (#173).
const TABS = [["customers", "Customers", "sales"], ["alerts", "Stock alerts", "newsletter"]] as const;
type Params = { tab?: string; q?: string; source?: string; consent?: string; kind?: string; state?: string; sort?: string; dir?: string; page?: string; per?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const [sales, alertsOn] = await Promise.all([hasModule("sales"), hasModule("newsletter")]);
  const tabs = TABS.filter(([, , m]) => (m === "sales" ? sales : alertsOn));
  if (!tabs.length) notFound();
  const tab = tabs.find(([k]) => k === sp.tab)?.[0] ?? tabs[0][0];
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const [customers, alerts, sold, deposits, claims, orders, service, newCars] = await Promise.all([customersStore.list(), alertsStore.list(), salesStore.list(), reservationsStore.list(), claimsStore.list(), ordersStore.list(), hasModule("service"), hasModule("newCars")]);
  const synced = (await stockSource()) === "donedeal"; // orders and deposits are our version only
  const ordersOn = newCars && !synced;
  // What each customer bought last, and what is still open for them (a deposit held, a claim, a factory order), at a glance in the row.
  const lastBought = new Map<string, { car: string; on: string }>();
  for (const s of sold) if (s.customerId && !s.returnedOn && (lastBought.get(s.customerId)?.on ?? "") < s.soldOn) lastBought.set(s.customerId, { car: s.carTitle, on: s.soldOn });
  const open = new Map<string, string[]>();
  const add = (id: string | undefined, what: string) => id && open.set(id, [...new Set([...(open.get(id) ?? []), what])]);
  if (!synced) for (const r of deposits) if (r.status === "held") add(r.customerId, "Deposit held");
  if (service) for (const k of claims) if (claimOpen(k.status)) add(k.customerId, "Warranty claim");
  if (ordersOn) for (const o of orders) if (orderOpen(o.status)) add(o.customerId, "Car on order");
  const sources = [...new Set(customers.map((c) => c.source))].sort();

  const customerColumns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      sort: (c) => c.name,
      cell: (c) => (
        <span className="flex min-w-0 flex-col">
          <Link href={`/customers/${c.id}`} className="font-medium text-text after:absolute after:inset-0">{c.name}</Link>
          {/* w-0 min-w-full: on a phone a long email is cut to the column, never widening the table past the screen. */}
          <span className="w-0 min-w-full truncate text-meta text-text-2 sm:w-auto">{c.email || c.phone}</span>
        </span>
      ),
      className: "sm:max-w-[14rem]",
    },
    {
      key: "bought",
      header: "Bought",
      hide: "md",
      sort: (c) => lastBought.get(c.id)?.on,
      cell: (c) => {
        const b = lastBought.get(c.id);
        return b ? <span className="flex flex-col"><span className="line-clamp-2">{b.car}</span><span className="text-meta text-text-2">{fmtDate(`${b.on}T12:00:00Z`)}</span></span> : <span className="text-text-2">Nothing yet</span>;
      },
    },
    { key: "open", header: "Open", hide: "sm", sort: (c) => open.get(c.id)?.length ?? 0, cell: (c) => <span className="flex flex-wrap gap-1">{(open.get(c.id) ?? []).map((w) => <Badge key={w} tone="info">{w}</Badge>)}</span> },
    { key: "source", header: "Came from", sort: (c) => c.source, cell: (c) => <BrandName name={c.source} />, hide: "2xl" },
    { key: "consent", header: "Marketing", hide: "xl", sort: (c) => (c.marketingConsent ? 0 : 1), cell: (c) => (c.marketingConsent ? <Badge tone="good">Agreed</Badge> : <Badge>No</Badge>) },
    { key: "last", header: "Last contact", sort: (c) => c.lastContactAt, cell: (c) => fmtAgo(c.lastContactAt), align: "right", nowrap: true },
    {
      key: "act",
      header: "Contact",
      quietHeader: true,
      hide: "lg",
      nowrap: true,
      cell: (c) => (
        <span className="relative z-10 flex justify-end gap-2">
          {/* A call, and Email under the row's menu (#95). */}
          <CallButton phone={c.phone} name={c.name} />
          {c.email && (
            <RowMenu label={`More for ${c.name}`}>
              <a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`} className={rowButton}>Email</a>
            </RowMenu>
          )}
        </span>
      ),
    },
  ];
  const alertColumns: Column<StockAlert>[] = [
    { key: "kind", header: "Alert", hide: "sm", sort: (a) => ALERT_KIND_LABELS[a.kind], cell: (a) => ALERT_KIND_LABELS[a.kind] },
    // On a phone the kind and the status move in here, so the row keeps its buttons on screen.
    {
      key: "criteria",
      header: "Looking for",
      sort: (a) => a.criteria,
      cell: (a) => (
        <span className="flex min-w-0 flex-col">
          <span>{a.criteria}</span>
          <span className="flex w-0 min-w-full items-center gap-2">
            <span className="shrink-0 sm:hidden">{a.active ? <Badge tone="good">Active</Badge> : <Badge>Stopped</Badge>}</span>
            <span className="truncate text-meta text-text-2"><span className="sm:hidden">{ALERT_KIND_LABELS[a.kind]} · </span>{a.email}</span>
          </span>
        </span>
      ),
    },
    { key: "status", header: "Status", hide: "sm", sort: (a) => (a.active ? 0 : 1), cell: (a) => (a.active ? <Badge tone="good">Active</Badge> : <Badge>Stopped</Badge>) },
    { key: "since", header: "Since", sort: (a) => a.createdAt, cell: (a) => fmtDate(a.createdAt), hide: "md", nowrap: true },
    {
      key: "actions",
      header: "",
      nowrap: true,
      cell: (a) => (
        // No next step on an alert: Stop and Remove are under the row's menu (#95).
        <div className="flex justify-end">
          <RowMenu label={`More for ${a.email}: ${a.criteria}`}>
            {/* Stop only: an alert starts again only when the person signs up again (actions.ts). */}
            {a.active && (
              <ActButton act={pauseAlertAction.bind(null, a.id)} confirm={{ title: "Stop this stock alert?", text: "Only the customer can start it again, by signing up on the website.", yes: "Stop" }} className={rowButton}>Stop</ActButton>
            )}
            <ActButton act={removeAlertAction.bind(null, a.id)} confirm={{ title: "Remove this stock alert?", text: "This cannot be undone.", yes: "Remove" }} className={rowDanger}>Remove</ActButton>
          </RowMenu>
        </div>
      ),
    },
  ];
  // Each list searched, filtered and sorted from the URL, then in pages of 50: a dealer's customers and alerts only grow.
  const people = sortRows(filterCustomers(customers, sp), customerColumns, sp, { key: "last", dir: "desc" });
  const alertList = sortRows(filterAlerts(alerts, sp), alertColumns, sp, { key: "since", dir: "desc" });
  // Each list's page, worked out once (slices: only the open tab's is shown).
  const [peoplePage, alertPage] = [pageOf(people.rows, sp), pageOf(alertList.rows, sp)];
  // Each tab's footer, with its own CSV (the list as it is filtered now): owners and managers only.
  const canExport = await can("data");
  const footer = (p: { page: number; pageCount: number; total: number; per: number }) => <TableFooter {...p} exportHref={canExport ? `/customers/export?tab=${tab}` : undefined} />;
  const filters: Record<string, FilterGroup[]> = {
    customers: [
      { name: "source", label: "Where they came from", any: "Any source", options: sources.map((s) => [s, s] as const) },
      { name: "consent", label: "Marketing", any: "Either", options: [["true", "Agreed to marketing"], ["false", "Not agreed"]] },
    ],
    alerts: [
      { name: "kind", label: "Alert", any: "Every alert", options: ALERT_KINDS.map((k) => [k, ALERT_KIND_LABELS[k]] as const) },
      { name: "state", label: "Status", any: "Active and stopped", options: [["active", "Active"], ["paused", "Stopped"]] },
    ],
  };

  return (
    <>
      <PageHeader title="Customers" text="Buyers, and people who signed up for stock alerts" />
      {/* The lists are the summary: each tile is its count and opens its list. */}
      <SummaryTabs
        label="Customer lists"
        items={[
          ...(sales ? [{ label: "Customers", count: fmtNum(customers.length), hint: `${customers.filter((c) => c.marketingConsent).length} agreed to marketing`, href: "/customers", active: tab === "customers" }] : []),
          ...(alertsOn ? [{ label: "Stock alerts", count: fmtNum(alerts.filter((a) => a.active).length), hint: `${alerts.filter((a) => a.lastSentAt).length} have had an email`, href: "/customers?tab=alerts", active: tab === "alerts" }] : []),
        ]}
      />

      {tab === "customers" && (
        <>
          <TableToolbar search={{ placeholder: "Search", label: "Search customers" }} filters={filters.customers} />
          <DataTable label="Customers" linkRows sort={people.sort} rows={peoplePage.rows} rowKey={(c) => c.id} columns={customerColumns} empty={<EmptyState title="No customers match" text="Try another filter or search." />} />
          {footer(peoplePage)}
        </>
      )}

      {tab === "alerts" && (
        <>
          <TableToolbar search={{ placeholder: "Search", label: "Search stock alerts" }} filters={filters.alerts} />
          <DataTable label="Stock alerts" sort={alertList.sort} rows={alertPage.rows} rowKey={(a) => a.id} columns={alertColumns} empty={<EmptyState title={q || sp.kind || sp.state ? "No alerts match" : "No alerts yet"} text={q || sp.kind || sp.state ? "Try another filter or search." : "Visitors can ask to be told about a car. They show here."} />} />
          {footer(alertPage)}
        </>
      )}
    </>
  );
}
