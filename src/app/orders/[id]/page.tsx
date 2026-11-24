import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderBadge } from "@/components/admin/badges";
import { ChoiceAct } from "@/components/admin/ActButton";
import { Facts, FormActions, PageHeader, Panel, adminButton, adminButtonQuiet, tapArea } from "@/components/admin/kit";
import { CancelOrder } from "@/components/admin/OrderForms";
import { ActSelect } from "@/components/admin/ActSelect";
import { ORDER_STATUS_LABELS, customersStore, orderOpen, ordersStore } from "@/lib/admin/collections";
import { fmtDate, fmtEur } from "@/lib/admin/format";
import { monthLabel } from "@/lib/admin/reports";
import { regPeriodLabel } from "@/lib/leads/reg-periods";
import { can, currentMember } from "@/lib/permissions";
import { hasModule } from "@/lib/modules";
import { stockSource } from "@/lib/stock-source";
import { addOrderNoteAction, setOrderStatusAction } from "../actions";
import { Notes } from "@/components/admin/Notes";

export const metadata = { title: "Order" };

const STEPS = ["ordered", "built", "in-transit"] as const; // before it arrives

// One factory order: the car, the buyer, the deposit, where it is, and notes. Arrived puts the car in stock for the handover.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if ((await stockSource()) === "donedeal") notFound();
  const { id } = await params;
  const o = await ordersStore.get(id);
  if (!o) notFound();
  const [buyer, canCancel, me] = await Promise.all([o.customerId ? customersStore.get(o.customerId) : undefined, can("settings"), currentMember()]);
  const open = orderOpen(o.status);
  return (
    <>
      <PageHeader title={`${o.make} ${o.model}`} text={`Ordered ${fmtDate(`${o.orderedOn}T12:00:00Z`)} for ${regPeriodLabel(o.regPeriod)}`} back={{ href: "/orders", label: "Orders" }} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="The order">
            <Facts
              items={[
                ["Customer", buyer ? ((await hasModule("sales")) ? <Link key="b" href={`/customers/${buyer.id}`} className="underline">{buyer.name}</Link> : buyer.name) : "Not on file"],
                ["Spec", [o.spec, o.colour].filter(Boolean).join(", ") || "Not given"],
                ["Price", fmtEur(o.priceEur)],
                ["Deposit", o.depositEur ? `${fmtEur(o.depositEur)}, ${o.depositMethod?.toLowerCase()}${o.refundEur ? `, ${fmtEur(o.refundEur)} refunded` : ""}` : "None"],
                ["Due", monthLabel(o.expected)],
                ["Taken by", o.salesperson ?? "Not taken"],
              ] as const}
            />
            {o.leadId && <Link href={`/leads/${o.leadId}`} className={`w-fit text-meta underline ${tapArea}`}>The website request</Link>}
          </Panel>
          <Notes notes={o.notes} action={addOrderNoteAction.bind(null, o.id)} me={me.name} />
          {/* At the end, out of the way: it cannot be taken back. Owners and managers only; the server refuses anyone else. */}
          {open && canCancel && (
            <Panel title="Cancel the order">
              <p className="max-w-measure text-body text-text-2">For an order that will not go ahead. It cannot be undone.</p>
              <CancelOrder id={o.id} depositEur={o.depositEur} />
            </Panel>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6 max-lg:order-first">
          <Panel title="Where it is" action={open && o.status !== "arrived" ? undefined : <OrderBadge status={o.status} />}>
            {/* The steps before it arrives as one drop-down (#141), as a claim's and a lead's stage, never a block of chips. Arrived is its own
                button: it puts the car in stock and never steps back, so it asks first, and it is the main one once the car is on its way. */}
            {open && o.status !== "arrived" && (
              <>
                <ActSelect label="Where it is" value={o.status} options={STEPS.map((s) => [s, ORDER_STATUS_LABELS[s]] as const)} action={setOrderStatusAction.bind(null, o.id)} field="status" extra={{ from: o.status }} back={{ status: o.status }} done="Order: " />
                <FormActions>
                  <ChoiceAct
                    action={setOrderStatusAction.bind(null, o.id)}
                    set={{ status: "arrived" }}
                    confirm={{ title: "Mark it arrived?", text: "The car goes into stock, held for the buyer. This cannot be stepped back.", yes: "It has arrived", safe: true }}
                    active={false}
                    done="Order: Arrived"
                    className={o.status === "in-transit" ? adminButton : adminButtonQuiet}
                  >
                    Mark arrived
                  </ChoiceAct>
                </FormActions>
              </>
            )}
            {/* Arrived: the car is in stock, hidden and held for them. Mark sold on it is the handover. */}
            {o.carId && o.status === "arrived" && (
              <>
                <p className="text-body text-text-2">It is in stock, held for {buyer?.name ?? "the buyer"}. Mark it sold when they collect it.</p>
                <FormActions>
                  <Link href={`/stock/${o.carId}`} className={adminButtonQuiet}>The car</Link>
                  <Link href={`/stock/${o.carId}/sale`} className={adminButton}>Hand over</Link>
                </FormActions>
              </>
            )}
            {o.carId && !open && <Link href={`/stock/${o.carId}`} className={`w-fit text-meta underline ${tapArea}`}>The car</Link>}
          </Panel>
        </div>
      </div>
    </>
  );
}
