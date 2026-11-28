import { ChannelIcon } from "@/components/admin/BrandIcon";
import { StatCard } from "@/components/admin/kit";
import { fmtCompact } from "@/lib/admin/format";
import { sourceTiles, type ChannelCount } from "@/lib/admin/visit-sources";

// The Overview's visits figure for owners and managers: the week's visits as a row of This week, the three busiest channels with their
// marks under the label. The whole row opens Analytics.
export function VisitsTile({ now, before }: { now: ChannelCount[]; before: Pick<ChannelCount, "channel" | "visits">[] }) {
  const total = fmtCompact(now.reduce((n, c) => n + c.visits, 0));
  const top = sourceTiles(now, before).slice(0, 3);
  return (
    <StatCard
      href="/analytics?range=7"
      label="Visits"
      value={total}
      hint={
        top.length ? (
          <span role="list" className="flex flex-wrap gap-x-3 gap-y-0.5">
            {top.map((t) => (
              <span key={t.channel} role="listitem" className="inline-flex items-center gap-1 whitespace-nowrap">
                <ChannelIcon channel={t.channel} className="size-3.5 shrink-0" />
                {t.label} {fmtCompact(t.visits)}
              </span>
            ))}
          </span>
        ) : undefined
      }
    />
  );
}
