import Link from "next/link";
import { card } from "@/components/ui";
import { CarIcon, ChevronDownIcon } from "@/components/stock/icons";
import { IfModule } from "@/components/IfModule";
import { AIBrief } from "./AIWriter";
import { CarThumb } from "./CarThumb";
import { minutesText, readVisit, type Journey } from "@/lib/leads/journey";
import { isSold, type Car } from "@/lib/stock/types";
import { CHANNEL_LABELS } from "@/lib/visit-rules";

// "This visit" on a lead (#34): what they did on the dealer's website before they got in touch, when they chose to send it. Folded on a
// phone under one line that says the most (how long, how many cars, from where), open from 1024px (`open-lg`, globals.css). Only what is
// there: a part with nothing in it is left out. Prepare me at the foot, for the AI brief.
export function VisitPanel({ lead, stock }: { lead: { id: string; journey: Journey; channel?: string; carSlug?: string; carTitle?: string }; stock: Car[] }) {
  const j = lead.journey;
  const { cars, pattern, searches, tools } = readVisit(j, stock, lead);
  const line = [minutesText(j.minutes), cars.length > 0 && (cars.length === 1 ? "1 car" : `${cars.length} cars`), lead.channel && (lead.channel === CHANNEL_LABELS.direct ? "typed in" : `from ${lead.channel}`)].filter(Boolean).join(" · ");
  const label = "text-meta text-text-2";

  return (
    <details className={`${card} open-lg group p-5`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 lg:pointer-events-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-section font-semibold">This visit</h2>
          <span className={label}>{line}</span>
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180 lg:hidden" />
      </summary>
      <div className="mt-4 flex flex-col gap-5">
        {pattern && <p className="text-body font-medium">{pattern}</p>}
        {cars.length > 0 && (
          <section aria-label="Cars they opened" className="flex flex-col gap-2">
            <h3 className={label}>Cars they opened</h3>
            <ul className="flex flex-col gap-2">
              {cars.map((v) => (
                <li key={v.id} className="flex min-w-0 items-center gap-3">
                  <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-control bg-photo-bg text-text-2">
                    {v.car?.photos[0] ? <CarThumb src={v.car.photos[0].src} /> : <CarIcon className="size-5" />}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-medium">
                      {v.car ? (
                        <Link href={`/stock/${v.car.id}`} className="underline-offset-4 hover:underline">{v.name}</Link>
                      ) : (
                        (v.name ?? "A car no longer in stock")
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-meta text-text-2">
                      {v.asked && <span className="font-medium text-accent-text">Asked about</span>}
                      <span>{v.views === 1 ? "Opened once" : `Opened ${v.views} times`}</span>
                      {v.car && isSold(v.car) && <span>Sold</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {searches.length > 0 && (
          <section aria-label="Searches" className="flex flex-col gap-2">
            <h3 className={label}>Searched</h3>
            {/* One chip a search; a long one wraps inside its chip rather than run off a phone. */}
            <ul className="flex flex-wrap gap-1">
              {searches.map((w, i) => (
                <li key={i} className="rounded-full bg-hairline px-2.5 py-0.5 text-meta text-text-2">{w.join(" · ")}</li>
              ))}
            </ul>
          </section>
        )}
        {tools.length > 0 && (
          <section aria-label="Also used" className="flex flex-col gap-1">
            <h3 className={label}>Also</h3>
            <ul className="flex flex-col gap-1 text-body">
              {tools.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </section>
        )}
        <IfModule id="ai">
          <div className="border-t border-hairline pt-4">
            <AIBrief leadId={lead.id} />
          </div>
        </IfModule>
      </div>
    </details>
  );
}
