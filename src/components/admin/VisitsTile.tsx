import Link from "next/link";
import { ChannelIcon } from "@/components/admin/BrandIcon";
import { figureSize } from "@/components/admin/kit";
import { card, press } from "@/components/ui";
import { fmtNum } from "@/lib/admin/format";
import { sourceTiles, type ChannelCount } from "@/lib/admin/visit-sources";

// The Overview's visits figure for owners and managers: the week's visits, and under it the three busiest channels with their marks.
// A StatCard's frame and rows (label, figure, then the channels), so it sits level with the tiles beside it. The whole tile opens Analytics.
export function VisitsTile({ now, before }: { now: ChannelCount[]; before: Pick<ChannelCount, "channel" | "visits">[] }) {
  const total = fmtNum(now.reduce((n, c) => n + c.visits, 0));
  return (
    <Link href="/analytics" className={`${card} row-span-3 grid min-w-0 grid-rows-subgrid gap-1 p-4 transition-colors hover:border-control ${press}`}>
      <p className="text-meta text-text-2">Visits this week</p>
      <div className="@container min-w-0">
        <p className={`font-display font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums ${figureSize(total)}`}>{total}</p>
      </div>
      <ul className="flex min-w-0 flex-col gap-1 text-meta">
        {sourceTiles(now, before)
          .slice(0, 3)
          .map((t) => (
            <li key={t.channel} className="flex min-w-0 items-center gap-2">
              <ChannelIcon channel={t.channel} className="size-4" />
              <span className="min-w-0 truncate">{t.label}</span>
              <span className="ml-auto tabular-nums text-text-2">{fmtNum(t.visits)}</span>
            </li>
          ))}
      </ul>
    </Link>
  );
}
