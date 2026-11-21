import { Panel, adminButton } from "@/components/admin/kit";
import { ExternalIcon } from "@/components/stock/icons";
import { NEW_TAB } from "@/components/ui";
import { listing } from "@/lib/stock-source";

// Shown where a car would be added, when the stock comes from DoneDeal: cars are added there.
export async function SyncedNotice() {
  const { site, url } = await listing();
  return (
    <Panel title={`This stock comes from ${site}`}>
      <p className="max-w-measure text-body text-text-2">Add, edit and sell cars on {site}. The site updates within 15 minutes.</p>
      <a href={url} {...NEW_TAB} className={`${adminButton} self-start`}>
        Open {site}
        <ExternalIcon className="size-4" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Panel>
  );
}
