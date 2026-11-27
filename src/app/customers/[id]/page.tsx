import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimStatusBadge, CoverBadge, DriveStatusBadge, LeadStatusBadge } from "@/components/admin/badges";
import { Badge, Facts, PageHeader, Panel, Task, TaskList, rowButton } from "@/components/admin/kit";
import { LEAD_TYPE_LABELS, claimOpen, getSettings, claimsStore, coverEnds, customersStore, drivesStore, leadsStore, reservationsStore, salesStore } from "@/lib/admin/collections";
import { dublinDay, fmtDate, fmtEur, fmtTime } from "@/lib/admin/format";
import { isOpenDrive } from "@/lib/admin/drives";
import { answerNow, isOpenLead, openWarrantyRequests } from "@/lib/admin/leads";
import { currentMember } from "@/lib/permissions";
import { matchesAny, parsePersonQuery, type PersonQuery } from "@/lib/admin/person-match";
import { ContactButtons } from "@/components/admin/ContactButtons";
import { stockSource } from "@/lib/stock-source";
import { reminderFacts } from "@/lib/admin/reminders";
import { adminCar } from "@/lib/admin/stock-admin";
import { carHistoryStore } from "@/lib/history";
import { currentDealer } from "@/lib/tenancy/current";

export const metadata = { title: "Customer" };

// The time, read once a request (a plain Date.now() in the render trips the purity lint), as on Leads.
const now = () => Date.now();

// One customer. At the top: how to reach them. Below: what they bought (with the warranty on each), then one list of each kind
// (claims, deposits, leads, test drives), what is still open first, marked by the bar at its left, each a link to it (#169). Aftersales starts
// here: a claim is opened on one of their purchases.
const list = "flex flex-col divide-y divide-hairline";
const item = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await customersStore.get(id);
  if (!c) notFound();
  // Deposits are our version only: with DoneDeal stock their pages are not there.
  const synced = (await stockSource()) === "donedeal";
  const [sales, reservations, claims, leads, drives, { leadSlaHours }, me] = await Promise.all([salesStore.list(), reservationsStore.list(), claimsStore.list(), leadsStore.list(), drivesStore.list(), getSettings(), currentMember()]);
  const at = now();
  // Whose it is, as on To do: a name, You, or Not taken.
  const who = (name?: string) => (!name ? "Not taken" : name === me.name ? "You" : name);
  const today = dublinDay();
  const day = (d: string) => fmtDate(`${d}T12:00:00Z`);
  const qs = [c.email, c.phone].map((v) => (v ? parsePersonQuery(v) : null)).filter((q): q is PersonQuery => q !== null);
  const bought = sales.filter((s) => s.customerId === id).sort((a, b) => b.soldOn.localeCompare(a.soldOn));
  // Each car's NCT and service dates and the reminders sent (#171).
  const { serviceMonths } = (await currentDealer()).profile.rules;
  // Each car bought, read on its own (a customer has a sale or two, never the whole stock); nothing to read when they bought nothing.
  const cars = new Map(await Promise.all(bought.map(async (s) => [s.id, { reg: (await adminCar(s.id))?.reg, history: (await carHistoryStore.get(s.id))?.history }] as const)));
  const deposits = reservations.filter((r) => r.customerId === id).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const theirClaims = claims.filter((k) => k.customerId === id).sort((a, b) => b.createdAt - a.createdAt);
  const theirLeads = qs.length ? leads.filter((l) => matchesAny(l, qs)).sort((a, b) => b.createdAt - a.createdAt) : [];
  const theirDrives = qs.length ? drives.filter((d) => matchesAny(d, qs)).sort((a, b) => b.startsAt - a.startsAt) : [];
  const none = (what: string) => <p className="text-body text-text-2">{what}</p>;
  const leadHref = (l: { id: string; type: string }) => (l.type === "warranty" ? `/aftersales/requests/${l.id}` : `/leads/${l.id}`);

  // What is still open for them goes first in its list, marked: red to do now, amber otherwise. A drive coming up is soonest first.
  const openDrives = theirDrives.filter((d) => isOpenDrive(d) && dublinDay(d.startsAt) >= today).reverse();
  // A warranty request that became a claim is done, as on Aftersales: the claim is what is open.
  const openRequests = new Set(openWarrantyRequests(theirLeads, claims).map((l) => l.id));
  const openLeads = theirLeads.filter((l) => (l.type === "warranty" ? openRequests.has(l.id) : isOpenLead(l)));
  const openClaims = theirClaims.filter((k) => claimOpen(k.status));
  const held = synced ? [] : deposits.filter((r) => r.status === "held");
  const openFirst = <T,>(all: T[], open: T[]) => [...open, ...all.filter((x) => !open.includes(x))];

  return (
    <>
      {/* Reaching them is in the header (#213); their details are rows beside what they bought. */}
      <PageHeader title={c.name} text={`Customer since ${fmtDate(c.createdAt)} · ${c.source}`} back={{ href: "/customers", label: "Customers" }} actions={<ContactButtons phone={c.phone || undefined} email={c.email || undefined} />} />

      <div className="grid grid-cols-1 items-start gap-6 wide:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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
                        {!s.returnedOn && <span className="text-meta text-text-2">{reminderFacts(s, cars.get(s.id), serviceMonths, today).join(" · ")}</span>}
                      </span>
                      {!s.returnedOn && (
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <CoverBadge inCover={coverEnds(s) >= today} />
                          <Link href={`/aftersales/new?sale=${s.id}`} className={rowButton}>Open a claim</Link>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </Panel>
          {theirClaims.length > 0 && (
            <Panel title="Warranty claims">
              <TaskList label="Warranty claims">
                {openFirst(theirClaims, openClaims).map((k) => (
                  <Task key={k.id} href={`/aftersales/${k.id}`} urgency={openClaims.includes(k) ? "soon" : "info"} title={k.carTitle} detail={<span title={k.fault} className="line-clamp-1">{day(k.openedOn)}: {k.fault}</span>} action={<ClaimStatusBadge status={k.status} />} />
                ))}
              </TaskList>
            </Panel>
          )}
          {deposits.length > 0 && (
            <Panel title="Deposits">
              <TaskList label="Deposits">
                {openFirst(deposits, held).map((r) => (
                  <Task key={r.id} href={held.includes(r) ? `/stock/${r.carId}/reserve` : undefined} urgency={held.includes(r) ? "soon" : "info"} title={r.carTitle} detail={held.includes(r) ? `${fmtEur(r.depositEur)}, held until ${day(r.until)}` : `${fmtEur(r.depositEur)}, paid ${day(r.paidOn)}`} action={<Badge tone={r.status === "held" ? "info" : "neutral"}>{{ held: "Held", sold: "Part of the sale", refunded: "Refunded", kept: "Kept" }[r.status]}</Badge>} />
                ))}
              </TaskList>
            </Panel>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Details" quiet>
            <Facts items={[...(c.email ? [["Email", c.email] as const] : []), ...(c.phone ? [["Phone", c.phone] as const] : []), ["Marketing", c.marketingConsent ? "Agreed" : "No offers"]]} />
          </Panel>
          <Panel title="Leads" quiet>
            {theirLeads.length === 0
              ? none("No leads from them yet.")
              : (
                <TaskList label="Leads">
                  {openFirst(theirLeads, openLeads).map((l) => {
                    const open = openLeads.includes(l);
                    return <Task key={l.id} href={leadHref(l)} urgency={!open ? "info" : answerNow(l, at, today, leadSlaHours) ? "now" : "soon"} title={`${LEAD_TYPE_LABELS[l.type]}${l.carTitle ? `, ${l.carTitle}` : ""}`} detail={open ? `${who(l.assignedTo)} · came in ${fmtDate(l.createdAt)}` : fmtDate(l.createdAt)} action={<LeadStatusBadge status={l.status} type={l.type} />} />;
                  })}
                </TaskList>
              )}
          </Panel>
          {theirDrives.length > 0 && (
            <Panel title="Test drives" quiet>
              <TaskList label="Test drives">
                {openFirst(theirDrives, openDrives).map((d) => {
                  const open = openDrives.includes(d);
                  return <Task key={d.id} href={`/test-drives/${d.id}`} urgency={!open ? "info" : dublinDay(d.startsAt) === today ? "now" : "soon"} title={d.carTitle} detail={open ? `${who(d.assignedTo)} · ${fmtDate(d.startsAt)}, ${fmtTime(d.startsAt)}` : fmtDate(d.startsAt)} action={<DriveStatusBadge status={d.status} />} />;
                })}
              </TaskList>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
