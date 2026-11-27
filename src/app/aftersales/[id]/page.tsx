import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverBadge } from "@/components/admin/badges";
import { ActSelect } from "@/components/admin/ActSelect";
import { Facts, PageHeader, Panel } from "@/components/admin/kit";
import { CostPanel } from "@/components/admin/ClaimForms";
import { CLAIM_STATUSES, CLAIM_STATUS_LABELS, claimsStore, coverEnds, customersStore, salesStore } from "@/lib/admin/collections";
import { TimeLeft } from "@/components/admin/charts";
import { dublinDay, fmtDate } from "@/lib/admin/format";
import { can, currentMember } from "@/lib/permissions";
import { hasModule } from "@/lib/modules";
import { addClaimNoteAction, setClaimCostAction, setClaimStatusAction } from "../actions";
import { Notes } from "@/components/admin/Notes";

export const metadata = { title: "Warranty claim" };

// One claim: the car, the buyer, the cover, the fault, where it is, notes, and (margins only) what the repair cost the dealer.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claim = await claimsStore.get(id);
  if (!claim) notFound();
  const [sale, buyer, margins, me] = await Promise.all([salesStore.get(claim.saleId), claim.customerId ? customersStore.get(claim.customerId) : undefined, can("margins"), currentMember()]);
  const day = (d: string) => fmtDate(`${d}T12:00:00Z`);
  // The warranty as time: from the sale to the last day of cover, how much is used and how much is left (or when it ended).
  const ends = sale ? coverEnds(sale) : undefined;
  const now = Date.parse(`${dublinDay()}T12:00:00Z`);
  const left = ends ? Math.round((Date.parse(`${ends}T12:00:00Z`) - now) / (30.44 * 86_400_000)) : 0;
  const coverText = !ends ? "" : left <= 0 ? `Ended ${day(ends)}` : `${left === 1 ? "About a month" : `About ${left} months`} left, until ${day(ends)}`;
  return (
    <>
      <PageHeader title={claim.carTitle} text={`Opened ${day(claim.openedOn)}`} back={{ href: "/aftersales", label: "Warranty claims" }} />
      <div className="grid grid-cols-1 items-start gap-6 wide:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="The fault" action={<CoverBadge inCover={claim.inCover} />}>
            <p className="max-w-measure whitespace-pre-line text-body">{claim.fault}</p>
            <Facts
              items={[
                ["Customer", buyer ? ((await hasModule("sales")) ? <Link key="b" href={`/customers/${buyer.id}`} className="underline">{buyer.name}</Link> : buyer.name) : "Not on file"],
                ["Sold", sale ? day(sale.soldOn) : "Not on file"],
                // The Cover panel says it when the sale is on file.
                ...(ends ? [] : [["Cover until", "Not known"] as const]),
                ...(claim.leadId ? [["From", <Link key="l" href={`/aftersales/requests/${claim.leadId}`} className="underline">The website request</Link>] as const] : []),
              ] as const}
            />
          </Panel>
          <Notes notes={claim.notes} action={addClaimNoteAction.bind(null, claim.id)} me={me.name} />
        </div>
        {/* Status, cover and cost are sections of one quiet panel, hairlines between them (#213), not three small cards. */}
        <div className="flex min-w-0 flex-col divide-y divide-hairline rounded-card border border-hairline bg-row-alt px-5 *:py-5">
          {/* Where it stands: one drop-down of the six stages, as the lead's stage (#136), never a block of chips. The only place it is set (#169):
              it reaches Declined and goes back, which a row's next step could not. */}
          <Panel title="Status" plain>
            <ActSelect label="Status" value={claim.status} options={CLAIM_STATUSES.map((s) => [s, CLAIM_STATUS_LABELS[s]] as const)} action={setClaimStatusAction.bind(null, claim.id)} field="status" extra={{ from: claim.status }} back={{ status: claim.status }} done="Claim: " />
          </Panel>
          {sale && ends && (
            <Panel title="Cover" plain>
              <TimeLeft from={Date.parse(`${sale.soldOn}T12:00:00Z`)} to={Date.parse(`${ends}T12:00:00Z`)} now={now} text={coverText} />
            </Panel>
          )}
          {margins && (
            <CostPanel title="Repair cost" act={setClaimCostAction.bind(null, claim.id)} label="Repair cost to us (€)" hint="Counts against the car's margin. Leave empty to clear it." costEur={claim.costEur} plain />
          )}
        </div>
      </div>
    </>
  );
}
