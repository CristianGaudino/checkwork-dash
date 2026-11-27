import { Tween } from "@/components/Tween";
import { ChannelIcon } from "@/components/admin/BrandIcon";
import { Meter } from "@/components/admin/kit";
import { fmtCompact, plural } from "@/lib/admin/format";
import { sourceGroups, sourceTiles, type ChannelCount, type SourceFigures, type SourceTile } from "@/lib/admin/visit-sources";

// "Where visits come from" (#35, #213): a ranked list, most visits first. Each source has its visits, a bar for its share, the change on
// the period before, the leads it brought and leads per 100 visits. A group's networks (Google and Bing under Search) are always shown as
// indented rows under it, so the breakdown is on the page with nothing to open. The source with the most leads says so in words.
// The panel around it names the period ("Compared with the 30 days before"), so a row says only "Up 6%".
type Props = { now: ChannelCount[]; before: Pick<ChannelCount, "channel" | "visits">[] };

export function VisitSources({ now, before }: Props) {
  const tiles = sourceTiles(now, before);
  if (!tiles.length) return <p className="text-meta text-text-2">No visits in this period.</p>;
  const groups = sourceGroups(tiles, before);
  const max = Math.max(...groups.map((g) => g.visits));
  return (
    // A container query: the figures take their own columns once the list is 36rem wide, and sit under the name before that.
    <div className="@container">
      <div aria-hidden="true" className={`hidden border-b border-hairline pb-2 text-meta text-text-2 @xl:grid ${COLS}`}>
        <span>Source</span>
        <span className="text-right">Visits</span>
        <span className="text-right">Change</span>
        <span className="text-right">Leads</span>
      </div>
      <ol className="flex flex-col divide-y divide-hairline">
        {groups.map((g) => {
          const single = g.channels.length === 1;
          return (
            <li key={g.id} className="py-3">
              <Row f={g} best={g.best} max={max} icon={single ? <ChannelIcon channel={g.channels[0].channel} /> : <Marks tiles={g.channels} />} />
              {!single && (
                <ul aria-label={`${g.label}: by site`} className="mt-3 flex flex-col gap-3 @xl:gap-1.5 border-l-2 border-hairline pl-3 ml-2.5">
                  {g.channels.map((t) => (
                    <li key={t.channel}>
                      <Row f={t} best={false} max={max} sub icon={<ChannelIcon channel={t.channel} />} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const COLS = "grid-cols-[minmax(0,1fr)_5.5rem_7rem_9rem] gap-x-4"; // the rows repeat it at @xl, written out for Tailwind

const Marks = ({ tiles }: { tiles: SourceTile[] }) => (
  <span className="flex shrink-0 -space-x-1">
    {tiles.map((t) => <ChannelIcon key={t.channel} channel={t.channel} />)}
  </span>
);

// One source: name and share bar, then its figures. `sub`: a network inside a group, quieter and smaller.
function Row({ f, best, max, icon, sub = false }: { f: SourceFigures; best: boolean; max: number; icon: React.ReactNode; sub?: boolean }) {
  const trend = f.trend === "up" ? "text-ok" : f.trend === "down" ? "text-bad" : "text-text-2";
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_4.5rem] items-start gap-x-4 gap-y-1 @xl:items-center @xl:grid-cols-[minmax(0,1fr)_5.5rem_7rem_9rem]`}>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 ${sub ? "text-meta" : "text-body font-medium"}`}>
          {icon}
          <span className="min-w-0 break-words">{f.label}</span>
          {best && <span className="rounded-full bg-accent-soft px-2 text-meta font-medium text-accent-text">Most leads</span>}
        </span>
        <Meter value={f.visits} max={max} lead={best} />
      </span>
      <span className={`text-right tabular-nums ${sub ? "text-body" : "font-display text-heading font-semibold"}`}>
        <Tween value={fmtCompact(f.visits)} />
        <span className="sr-only"> {f.visits === 1 ? "visit" : "visits"}</span>
      </span>
      {/* Under the name on a narrow list, its own columns from 36rem. */}
      <span className="col-span-2 flex flex-wrap gap-x-3 text-meta tabular-nums @xl:contents">
        <span className={`@xl:text-right ${trend}`}>{f.change}</span>
        <span className="text-text-2 @xl:text-right">
          <span className="whitespace-nowrap">{plural(f.leads, "lead")}</span>
          {f.rate !== null && <span className="whitespace-nowrap">, {f.rate.toFixed(1)} per 100</span>}
        </span>
      </span>
    </div>
  );
}
