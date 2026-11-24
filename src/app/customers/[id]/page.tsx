import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimStatusBadge, CoverBadge, DriveStatusBadge, LeadStatusBadge, OrderBadge } from "@/components/admin/badges";
import { Badge, PageHeader, Panel, Task, TaskList, rowButton } from "@/components/admin/kit";
import { CalendarIcon, CarIcon, InboxIcon, ReceiptIcon, WrenchIcon } from "@/components/stock/icons";
import { LEAD_TYPE_LABELS, claimOpen, getSettings, claimsStore, coverEnds, customersStore, drivesStore, leadsStore, orderOpen, ordersStore, reservationsStore, salesStore } from "@/lib/admin/collections";
import { monthLabel } from "@/lib/admin/reports";
import { dublinDay, fmtDate, fmtEur, fmtTime } from "@/lib/admin/format";
import { isOpenDrive } from "@/lib/admin/drives";
import { answerNow, isOpenLead, openWarrantyRequests } from "@/lib/admin/leads";
import { currentMember } from "@/lib/permissions";
import { matchesAny, parsePersonQuery, type PersonQuery } from "@/lib/admin/person-match";
import { hasModule } from "@/lib/modules";
import { NotInPlan } from "@/components/admin/NotInPlan";
import { ContactButtons } from "@/components/admin/ContactButtons";
import { stockSource } from "@/lib/stock-source";

export const metadata = { title: "Customer" };

// The time, read once a request (a plain Date.now() in the render trips the purity lint), as on Leads.
const now = () => Date.now();

// One customer. At the top: how to reach them and what is still open for them (a deposit held, a claim, a car on order, a lead, a test
// drive), each a link to it. Below: what they bought (with the warranty on each), and their history. Aftersales starts here: a claim is
// opened on one of their purchases.
const list = "flex flex-col divide-y divide-hairline";
const item = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasModule("sales"))) return <NotInPlan id="sales" />; // the customer list is the sales module (src/lib/modules-rules.ts)
  const c = await customersStore.get(id);
  if (!c) notFound();
  // Claims, orders and test drives are modules of their own: with one off, its records stay but its links go (#173).
  const [service, newCars, drivesOn] = await Promise.all([hasModule("service"), hasModule("newCars"), hasModule("testDrives")]);
  // Orders and deposits are our version only: with DoneDeal stock their pages are not there.
  const synced = (await stockSource()) === "donedeal";
  const ordersOn = newCars && !synced;
  const [sales, reservations, claims, leads, drives, orders, { leadSlaHours }, me] = await Promise.all([salesStore.list(), reservationsStore.list(), claimsStore.list(), leadsStore.list(), drivesStore.list(), ordersStore.list(), getSettings(), currentMember()]);
  const at = now();
  // Whose it is, as on To do: a name, You, or Not taken.
  const who = (name?: string) => (!name ? "Not taken" : name === me.name ? "You" : name);
  const today = dublinDay();
  const day = (d: string) => fmtDate(`${d}T12:00:00Z`);
  const qs = [c.email, c.phone].map((v) => (v ? parsePersonQuery(v) : null)).filter((q): q is PersonQuery => q !== null);
  const bought = sales.filter((s) => s.customerId === id).sort((a, b) => b.soldOn.localeCompare(a.soldOn));
  const deposits = reservations.filter((r) => r.customerId === id).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const theirOrders = orders.filter((o) => o.customerId === id).sort((a, b) => b.createdAt - a.createdAt);
  const theirClaims = claims.filter((k) => k.customerId === id).sort((a, b) => b.createdAt - a.createdAt);
  const theirLeads = qs.length ? leads.filter((l) => matchesAny(l, qs)).sort((a, b) => b.createdAt - a.createdAt) : [];
  const theirDrives = qs.length ? drives.filter((d) => matchesAny(d, qs)).sort((a, b) => b.startsAt - a.startsAt) : [];
  const none = (what: string) => <p className="text-body text-text-2">{what}</p>;
  const leadHref = (l: { id: string; type: string }) => (l.type === "warranty" && service ? `/aftersales/requests/${l.id}` : `/leads/${l.id}`);

  // What is still open for them, as tasks to open. Soonest needs first: a drive coming up, a lead to answer, then the longer-running ones.
  const openDrives = drivesOn ? theirDrives.filter((d) => isOpenDrive(d) && dublinDay(d.startsAt) >= today).reverse() : [];
  // A warranty request that became a claim is done, as on Aftersales: the claim is what is open.
  const openRequests = new Set(openWarrantyRequests(theirLeads, claims).map((l) => l.id));
  const openLeads = theirLeads.filter((l) => (l.type === "warranty" ? service && openRequests.has(l.id) : isOpenLead(l)));
  const openClaims = service ? theirClaims.filter((k) => claimOpen(k.status)) : [];
  const openOrders = ordersOn ? theirOrders.filter((o) => orderOpen(o.status)) : [];
  // An open one is under Open for them, not twice.
  const pastOrders = theirOrders.filter((o) => !openOrders.includes(o));
  const pastLeads = theirLeads.filter((l) => !openLeads.includes(l));
  const pastDrives = theirDrives.filter((d) => !openDrives.includes(d));
  const pastClaims = theirClaims.filter((k) => !openClaims.includes(k));
  const held = synced ? [] : deposits.filter((r) => r.status === "held");
  const openCount = openDrives.length + openLeads.length + openClaims.length + openOrders.length + held.length;

  return (
    <>
      <PageHeader title={c.name} text={`Customer since ${fmtDate(c.createdAt)} · ${c.source}`} back={{ href: "/customers", label: "Customers" }} />
      <Panel>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <section aria-labelledby="reach" className="flex min-w-0 flex-col gap-3">
            <h2 id="reach" className="text-meta font-medium text-text-2">Contact</h2>
            <p className="flex flex-col text-body">
              {c.email && <span className="break-all">{c.email}</span>}
              {c.phone && <span>{c.phone}</span>}
            </p>
            <ContactButtons phone={c.phone || undefined} email={c.email || undefined} />
            <p className="text-meta text-text-2">{c.marketingConsent ? "Agreed to marketing" : "No marketing: do not send offers"}</p>
          </section>
          <section aria-labelledby="open" className="flex min-w-0 flex-col gap-2 lg:border-l lg:border-hairline lg:pl-6">
            <h2 id="open" className="text-meta font-medium text-text-2">
              Open for them <span className="ml-2 font-normal text-text-2 tabular-nums">{openCount}</span>
            </h2>
            {openCount === 0 ? (
              none("Nothing open. Everything they started is finished.")
            ) : (
              <TaskList label="Open for them">
                {openDrives.map((d) => (
                  <Task key={d.id} href={`/test-drives/${d.id}`} urgency={dublinDay(d.startsAt) === today ? "now" : "soon"} icon={<CalendarIcon />} title={`Test drive, ${d.carTitle}`} detail={`${who(d.assignedTo)} · ${fmtDate(d.startsAt)}, ${fmtTime(d.startsAt)}`} action={<DriveStatusBadge status={d.status} />} />
                ))}
                {openLeads.map((l) => (
                  <Task key={l.id} href={leadHref(l)} urgency={answerNow(l, at, today, leadSlaHours) ? "now" : "soon"} icon={<InboxIcon />} title={`${LEAD_TYPE_LABELS[l.type]}${l.carTitle ? `, ${l.carTitle}` : ""}`} detail={`${who(l.assignedTo)} · came in ${fmtDate(l.createdAt)}`} action={<LeadStatusBadge status={l.status} type={l.type} />} />
                ))}
                {openClaims.map((k) => (
                  <Task key={k.id} href={`/aftersales/${k.id}`} icon={<WrenchIcon />} title={`Warranty claim, ${k.carTitle}`} detail={<span className="line-clamp-1">{k.fault}</span>} action={<ClaimStatusBadge status={k.status} />} />
                ))}
                {openOrders.map((o) => (
                  <Task key={o.id} href={`/orders/${o.id}`} icon={<CarIcon />} title={`On order, ${o.regPeriod} ${o.make} ${o.model}`} detail={`Due ${monthLabel(o.expected)}`} action={<OrderBadge status={o.status} />} />
                ))}
                {held.map((r) => (
                  <Task key={r.id} icon={<ReceiptIcon />} href={`/stock/${r.carId}/reserve`} title={`Deposit held, ${r.carTitle}`} detail={`${fmtEur(r.depositEur)}, held until ${day(r.until)}`} />
                ))}
              </TaskList>
            )}
          </section>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Purchases">
            {bought.length === 0
              ? none("Nothing bought yet.")
              : (
                <ul className={list}>
                  {bought.map((s) => (
                    <li key={s.id} className={item}>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{s.carTitle}</span>
                        <span className="text-meta text-text-2">
                          {fmtEur(s.priceEur)}, {day(s.soldOn)}
                          {s.returnedOn ? `, ${s.kind === "returned" ? "brought back" : "fell through"} ${day(s.returnedOn)}` : `, warranty until ${day(coverEnds(s))}`}
                          {s.reviewAskedOn && `, asked for a review ${day(s.reviewAskedOn)}`}
                        </span>
                      </span>
                      {!s.returnedOn && (
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <CoverBadge inCover={coverEnds(s) >= today} />
                          {service && <Link href={`/aftersales/new?sale=${s.id}`} className={rowButton}>Open a claim</Link>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </Panel>
          {ordersOn && pastOrders.length > 0 && (
            <Panel title="Factory orders">
              <ul className={list}>
                {pastOrders.map((o) => (
                  <li key={o.id} className={item}>
                    <Link href={`/orders/${o.id}`} className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium underline-offset-2 hover:underline">{o.regPeriod} {o.make} {o.model}</span>
                      <span className="text-meta text-text-2">Due {monthLabel(o.expected)}</span>
                    </Link>
                    <span className="shrink-0"><OrderBadge status={o.status} /></span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {service && pastClaims.length > 0 && (
            <Panel title="Warranty claims">
              <ul className={list}>
                {pastClaims.map((k) => (
                  <li key={k.id} className={item}>
                    {/* The text takes the room left (a long fault is cut short, whole on hover), so the status stays on the right. */}
                    <Link href={`/aftersales/${k.id}`} className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium underline-offset-2 hover:underline">{k.carTitle}</span>
                      <span title={k.fault} className="line-clamp-1 text-meta text-text-2">{day(k.openedOn)}: {k.fault}</span>
                    </Link>
                    <span className="shrink-0"><ClaimStatusBadge status={k.status} /></span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {deposits.length > 0 && (
            <Panel title="Deposits">
              <ul className={list}>
                {deposits.map((r) => (
                  <li key={r.id} className={item}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{r.carTitle}</span>
                      <span className="text-meta text-text-2">{fmtEur(r.depositEur)}, paid {day(r.paidOn)}</span>
                    </span>
                    <span className="shrink-0"><Badge tone={r.status === "held" ? "info" : "neutral"}>{{ held: "Held", sold: "Part of the sale", refunded: "Refunded", kept: "Kept" }[r.status]}</Badge></span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Leads" quiet>
            {pastLeads.length === 0
              ? none(theirLeads.length ? "No past leads." : "No leads from them yet.")
              : (
                <ul className={list}>
                  {pastLeads.map((l) => (
                    <li key={l.id} className={item}>
                      <Link href={leadHref(l)} className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium underline-offset-2 hover:underline">{LEAD_TYPE_LABELS[l.type]}{l.carTitle ? `, ${l.carTitle}` : ""}</span>
                        <span className="text-meta text-text-2">{fmtDate(l.createdAt)}</span>
                      </Link>
                      <span className="shrink-0"><LeadStatusBadge status={l.status} type={l.type} /></span>
                    </li>
                  ))}
                </ul>
              )}
          </Panel>
          {pastDrives.length > 0 && (
            <Panel title="Test drives" quiet>
              <ul className={list}>
                {pastDrives.map((d) => (
                  <li key={d.id} className={item}>
                    {drivesOn ? (
                      <Link href={`/test-drives/${d.id}`} className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium underline-offset-2 hover:underline">{d.carTitle}</span>
                        <span className="text-meta text-text-2">{fmtDate(d.startsAt)}</span>
                      </Link>
                    ) : (
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">{d.carTitle}</span>
                        <span className="text-meta text-text-2">{fmtDate(d.startsAt)}</span>
                      </span>
                    )}
                    <span className="shrink-0"><DriveStatusBadge status={d.status} /></span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
