import { ChannelIcon } from "@/components/admin/BrandIcon";
import { StatGrid } from "@/components/admin/kit";
import { ChevronDownIcon } from "@/components/stock/icons";
import { fmtNum, plural } from "@/lib/admin/format";
import { sourceGroups, sourceTiles, type ChannelCount, type SourceFigures, type SourceTile } from "@/lib/admin/visit-sources";

// "Where visits come from" (#35), one tile per channel: its mark, visits and the change on the period before, the leads it brought and
// leads per 100 visits. The channel with the most leads has an indigo edge and says so in words. The groups (Search, Social, Listing
// sites...) each open into their networks (Analytics, the monthly report).
// The panel around it names the period ("Last 30 days, compared with the 30 before"), so a tile says only "Up 6%".
type Props = { now: ChannelCount[]; before: Pick<ChannelCount, "channel" | "visits">[] };

export function VisitSources({ now, before }: Props) {
  const tiles = sourceTiles(now, before);
  if (!tiles.length) return <p className="text-meta text-text-2">No visits in this period.</p>;
  return (
    <StatGrid>
      {sourceGroups(tiles, before).map((g) =>
        // A group with one network this period is that network's tile: nothing to open.
        g.channels.length === 1 ? (
          <Tile key={g.id} f={g.channels[0]} best={g.best} icon={<ChannelIcon channel={g.channels[0].channel} />} />
        ) : (
          <details key={g.id} className="group/src flex min-w-0 flex-col open:col-span-full">
            <summary className="flex-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <Tile f={g} best={g.best} icon={<Marks tiles={g.channels} />} more={<OpenLine tiles={g.channels} />} />
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
              {g.channels.map((t) => <Tile key={t.channel} f={t} best={t.best} icon={<ChannelIcon channel={t.channel} />} />)}
            </div>
          </details>
        ),
      )}
    </StatGrid>
  );
}

const Marks = ({ tiles }: { tiles: SourceTile[] }) => (
  <span className="flex shrink-0 -space-x-1">
    {tiles.map((t) => <ChannelIcon key={t.channel} channel={t.channel} />)}
  </span>
);

// What the group opens into, named, with the chevron that turns as it opens.
const OpenLine = ({ tiles }: { tiles: SourceTile[] }) => (
  <span className="mt-1 flex items-center gap-1 text-meta font-medium text-accent-text">
    <span className="min-w-0 truncate">{tiles.map((t) => t.label).join(", ")}</span>
    <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 transition-transform group-open/src:rotate-180" />
  </span>
);

function Tile({ f, best, icon, more }: { f: SourceFigures; best: boolean; icon: React.ReactNode; more?: React.ReactNode }) {
  return (
    <div data-tile className={`@container flex h-full min-w-0 flex-col gap-1 rounded-card border bg-card p-4 shadow-panel ${best ? "border-accent" : "border-hairline/70"}`}>
      <p className="flex min-w-0 items-center gap-2 text-body font-medium">
        {icon}
        <span className="min-w-0 truncate">{f.label}</span>
      </p>
      <p className="font-display font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">
        <span className="text-[min(2rem,20cqi)]">{fmtNum(f.visits)}</span> <span className="text-meta font-normal text-text-2">{f.visits === 1 ? "visit" : "visits"}</span>
      </p>
      <p className={`text-meta ${f.trend === "up" ? "text-ok" : f.trend === "down" ? "text-bad" : "text-text-2"}`}>{f.change}</p>
      {/* Wraps only at the dot, never inside a half. */}
      <p className="text-meta text-text-2 tabular-nums">
        <span className="whitespace-nowrap">{plural(f.leads, "lead")}</span>
        {f.rate !== null && (
          <>
            {" · "}
            <span className="whitespace-nowrap">{f.rate.toFixed(1)} per 100</span>
          </>
        )}
      </p>
      {best && <p className="text-meta font-medium text-accent-text">Most leads</p>}
      {more}
    </div>
  );
}
