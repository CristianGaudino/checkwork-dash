import Link from "next/link";
import { Avatar, Badge, Notice, PageHeader, Panel, rowButton } from "@/components/admin/kit";
import { Phones } from "@/components/admin/whatsapp/Phones";
import { ChevronDownIcon } from "@/components/stock/icons";
import { getSettings } from "@/lib/admin/collections";
import { enabledModules, requireModule } from "@/lib/modules";
import { can, currentMember } from "@/lib/permissions";
import { eventList, type EventId } from "@/lib/whatsapp/rules";
import { dealerProfile } from "@/lib/tenancy/current";
import { staffStore, viewFor } from "@/lib/whatsapp/store";
import { StaffForm } from "@/components/admin/whatsapp/StaffForm";

export const metadata = { title: "WhatsApp" };

const NOTICES: Record<string, { tone: "good" | "warn"; text: string }> = {
  saved: { tone: "good", text: "Saved." },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireModule("whatsapp");
  const { notice } = await searchParams;
  const modules = await enabledModules();
  const me = await currentMember();
  const { team } = await getSettings();
  const phones = await staffStore.list();
  const view = await viewFor(me.name, modules);
  const mayEditAll = await can("settings");
  const { rules } = await dealerProfile();
  const allowed = eventList(modules, rules.oldStockDays).filter((e) => e.on);
  const note = notice ? NOTICES[notice] : undefined;
  const linked = phones.some((x) => x.name === me.name && x.phone);

  return (
    <>
      <PageHeader title="WhatsApp" text="New leads on your phone, answered with a tap" />
      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      <Panel title="Staff phones">
        <ul className="flex flex-col divide-y divide-hairline">
          {team.map((t) => {
            const p = phones.find((x) => x.id === t.id);
            const mine = new Set<EventId>(p?.alerts ?? []);
            const count = allowed.filter((e) => mine.has(e.id)).length;
            const canEdit = mayEditAll || t.name === me.name;
            return (
              <li key={t.id} data-wa-person={t.name}>
                <details className="group">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                    <Avatar name={t.name} className="size-10" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-medium">{t.name}</span>
                      {/* Two even lines: the number itself is in the opened form. */}
                      <span className="text-meta text-text-2">
                        {t.role} · <span className="whitespace-nowrap">{p?.phone ? `${count} of ${allowed.length} alerts` : "No number yet"}</span>
                      </span>
                    </span>
                    {/* Not on a phone: the line under the name already says it, and the name and that line keep the width. */}
                    <span className="shrink-0 max-sm:hidden">{p?.phone ? <Badge tone="good">Linked</Badge> : <Badge>Not linked</Badge>}</span>
                    <span className={`${rowButton} max-sm:hidden`}>{canEdit ? "Change" : "See"}</span>
                    {/* A phone has no room for the button; the chevron says the row opens. */}
                    <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180 sm:hidden" />
                  </summary>
                  {canEdit ? (
                    <StaffForm id={t.id} p={p} allowed={allowed.map(({ id, label }) => ({ id, label }))} />
                  ) : (
                    <p className="pb-4 text-meta text-text-2 sm:pl-13">Only {t.name} or an owner or manager can change this.</p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* The job first (linking phones); the live demo one tap away. */}
      <details className="group rounded-tile border border-hairline">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-6 [&::-webkit-details-marker]:hidden">
          <h2 className="text-section font-semibold">Try it</h2>
          <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-8 border-t border-hairline p-4 sm:p-6">
          {/* Both phones side by side: the buyer's and yours. */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* Only a linked number gets alerts and can act, so say that first rather than point at a phone with nothing on it. */}
            {!linked ? (
              <p className="text-meta text-text-2">
                <span className="font-semibold text-text">Try it:</span> link your number in Staff phones first.
              </p>
            ) : (
              modules.has("tradeIn") && (
                <p className="text-meta text-text-2">
                  <span className="font-semibold text-text">Try it:</span> tap Reply with a price on the trade-in and type 8,500.
                </p>
              )
            )}
            <Phones initial={view} />
            {/* How it works, the alerts and the email fallback are in Help (src/lib/help/topics.ts), with the rest of how to. */}
            <Link href="/help#whatsapp-how" className="text-meta font-medium text-accent-text underline underline-offset-2">
              How WhatsApp works
            </Link>
          </div>
        </div>
      </details>
    </>
  );
}
